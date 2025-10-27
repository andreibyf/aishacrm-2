/**
 * executeWorkflow
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const workflowId = new URL(req.url).searchParams.get('workflow_id');
    
    if (!workflowId) {
      return Response.json({ error: 'Missing workflow_id parameter' }, { status: 400 });
    }

    const workflow = await base44.asServiceRole.entities.Workflow.get(workflowId);
    
    if (!workflow) {
      return Response.json({ error: 'Workflow not found' }, { status: 404 });
    }

    if (!workflow.is_active) {
      return Response.json({ error: 'Workflow is not active' }, { status: 400 });
    }

    const payload = await req.json();
    
    console.log('[executeWorkflow] Starting execution:', {
      workflow_id: workflow.id,
      workflow_name: workflow.name,
      tenant_id: workflow.tenant_id,
      payload
    });

    const execution = await base44.asServiceRole.entities.WorkflowExecution.create({
      tenant_id: workflow.tenant_id,
      workflow_id: workflow.id,
      workflow_name: workflow.name,
      status: 'running',
      trigger_data: payload,
      execution_log: []
    });

    const executionLog = [];
    let context = { payload, variables: {} };

    // Helper function to get next node (handles conditional branching)
    function getNextNode(currentNodeId: string) {
      const outgoingConnections = workflow.connections.filter(conn => conn.from === currentNodeId);
      
      if (outgoingConnections.length === 0) {
        return null; // End of workflow path
      }

      const currentNode = workflow.nodes.find(n => n.id === currentNodeId);
      
      if (currentNode?.type === 'condition') {
        const conditionResult = context.last_condition_result;
        
        // Assuming outgoingConnections[0] is for TRUE and outgoingConnections[1] is for FALSE.
        // This relies on the order of connections defined in the workflow.
        if (outgoingConnections.length >= 2) {
            const targetConnection = conditionResult ? outgoingConnections[0] : outgoingConnections[1];
            return workflow.nodes.find(n => n.id === targetConnection.to);
        } else if (outgoingConnections.length === 1) {
            // If a condition node has only one outgoing connection, it's a potential misconfiguration
            // or implicitly leads to a single path. We'll follow it.
            console.warn(`Condition node ${currentNodeId} has only one outgoing connection. Following the single path.`);
            return workflow.nodes.find(n => n.id === outgoingConnections[0].to);
        } else {
            // No outgoing connections for a condition node
            console.warn(`Condition node ${currentNodeId} has no outgoing connections. Terminating path.`);
            return null;
        }
      }

      // For all other node types, follow the first outgoing connection
      // (assuming sequential or single-path branching)
      return workflow.nodes.find(n => n.id === outgoingConnections[0].to);
    }

    try {
      let currentNode = workflow.nodes.find(node => node.type === 'webhook_trigger');
      if (!currentNode && workflow.nodes.length > 0) {
        // Fallback: If no explicit 'webhook_trigger' is found, start with the very first node in the array.
        currentNode = workflow.nodes[0];
      }
      
      if (!currentNode) {
        throw new Error('Workflow has no starting node (e.g., webhook_trigger) or no nodes defined.');
      }

      const visitedNodes = new Set<string>(); // To detect infinite loops

      while (currentNode) {
        if (visitedNodes.has(currentNode.id)) {
          console.error(`[executeWorkflow] Detected potential loop or revisited node: ${currentNode.id}. Terminating execution.`);
          executionLog.push({
            node_id: currentNode.id,
            node_type: currentNode.type,
            timestamp: new Date().toISOString(),
            status: 'error',
            error: `Workflow execution detected a loop or revisited node: ${currentNode.id}.`
          });
          break; // Stop execution to prevent infinite loops
        }
        visitedNodes.add(currentNode.id);

        if (currentNode.type === 'webhook_trigger') {
          executionLog.push({
            node_id: currentNode.id,
            node_type: currentNode.type,
            timestamp: new Date().toISOString(),
            status: 'success',
            output: { payload }
          });
        } else {
          console.log('[executeWorkflow] Executing node:', {
            node_id: currentNode.id,
            node_type: currentNode.type,
            config: currentNode.config
          });

          const result = await executeNode(currentNode, context, workflow.tenant_id, base44);
          executionLog.push(result);

          console.log('[executeWorkflow] Node result:', {
            node_id: currentNode.id,
            status: result.status,
            output: result.output,
            error: result.error
          });

          if (result.status === 'success' && result.output) {
            context.variables[currentNode.id] = result.output;
            // Make newly created/found lead/contact available as 'found_lead'/'found_contact'
            if (currentNode.type === 'find_lead' && result.output.lead) {
              context.variables.found_lead = result.output.lead;
            }
            if (currentNode.type === 'create_lead' && result.output.lead) {
              context.variables.found_lead = result.output.lead;
            }
            if (currentNode.type === 'find_contact' && result.output.contact) {
              context.variables.found_contact = result.output.contact;
            }
          }

          if (result.status === 'error') {
            console.log('[executeWorkflow] Stopping execution due to node error');
            break; // Stop workflow on node execution error
          }
        }
        
        // Determine the next node based on workflow connections
        const nextNode = getNextNode(currentNode.id);
        currentNode = nextNode;
      }

      const finalStatus = executionLog.some(log => log.status === 'error') ? 'failed' : 'success';
      const duration = Date.now() - startTime;

      await base44.asServiceRole.entities.WorkflowExecution.update(execution.id, {
        status: finalStatus,
        execution_log: executionLog,
        duration_ms: duration
      });

      await base44.asServiceRole.entities.Workflow.update(workflowId, {
        execution_count: (workflow.execution_count || 0) + 1,
        last_executed: new Date().toISOString()
      });

      return Response.json({
        status: finalStatus,
        execution_log: executionLog,
        duration_ms: duration
      });

    } catch (error) {
      console.error('[executeWorkflow] Execution error:', error);
      
      // Ensure execution.id exists before trying to update
      if (execution && execution.id) {
        await base44.asServiceRole.entities.WorkflowExecution.update(execution.id, {
          status: 'failed',
          execution_log: executionLog,
          error_message: error.message,
          duration_ms: Date.now() - startTime
        });
      }

      return Response.json({
        status: 'failed',
        error: error.message,
        execution_log: executionLog
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[executeWorkflow] Handler error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function executeNode(node, context, tenantId, base44) {
  const log = {
    node_id: node.id,
    node_type: node.type,
    timestamp: new Date().toISOString(),
    status: 'success',
    output: {}
  };

  try {
    const config = node.config || {};

    switch (node.type) {
      case 'create_lead': {
        const mappings = config.field_mappings || [];
        
        if (mappings.length === 0) {
          log.status = 'error';
          log.error = 'No field mappings configured';
          break;
        }

        const leadData = { tenant_id: tenantId };
        
        for (const mapping of mappings) {
          if (mapping.lead_field && mapping.webhook_field) {
            const value = replaceVariables(`{{${mapping.webhook_field}}}`, context);
            if (value !== null && value !== undefined && value !== '') { // Only set if not null, undefined, or empty string
              leadData[mapping.lead_field] = value;
            }
          }
        }

        console.log('[create_lead] Creating lead with data:', leadData);

        try {
          const newLead = await base44.asServiceRole.entities.Lead.create(leadData);
          
          log.output = { lead: newLead };
          console.log('[create_lead] Success - created lead:', newLead.id);
        } catch (error) {
          log.status = 'error';
          log.error = `Failed to create lead: ${error.message}`;
          console.error('[create_lead] Error:', error);
        }
        
        break;
      }

      case 'find_lead': {
        const searchField = config.search_field || 'email';
        let searchValue = replaceVariables(config.search_value || '{{email}}', context);
        
        // Remove any quotes and trim
        if (typeof searchValue === 'string') {
          searchValue = searchValue.replace(/^["']|["']$/g, '').trim();
        }
        
        console.log('[find_lead] Searching for lead:', { 
          searchField, 
          searchValue, 
          searchValueLength: searchValue?.length,
          tenantId 
        });
        
        // Simple exact match filter
        const filter = {
          tenant_id: tenantId,
          [searchField]: searchValue
        };
        
        console.log('[find_lead] Filter:', JSON.stringify(filter));
        
        // Try to find with exact match
        const leads = await base44.asServiceRole.entities.Lead.filter(filter);
        
        console.log('[find_lead] Found leads:', leads?.length || 0);
        
        if (leads && leads.length > 0) {
          log.output = { lead: leads[0] };
          console.log('[find_lead] Success - found lead:', leads[0].id);
        } else {
          // Debug: fetch all leads and do manual comparison
          const allLeads = await base44.asServiceRole.entities.Lead.filter({ tenant_id: tenantId });
          
          // Try to find manually
          const manualMatch = allLeads.find(l => {
            const leadValue = l[searchField];
            console.log('[find_lead] Comparing:', {
              leadValue,
              leadValueLength: leadValue?.length,
              searchValue,
              searchValueLength: searchValue?.length,
              areEqual: leadValue === searchValue,
              leadValueTrimmed: leadValue?.trim(),
              searchValueTrimmed: searchValue?.trim(),
              areEqualTrimmed: leadValue?.trim()?.toLowerCase() === searchValue?.trim()?.toLowerCase()
            });
            return leadValue?.trim()?.toLowerCase() === searchValue?.trim()?.toLowerCase();
          });
          
          if (manualMatch) {
            console.log('[find_lead] Found via manual search!', manualMatch.id);
            log.output = { lead: manualMatch };
          } else {
            const sampleLeads = allLeads.slice(0, 5).map(l => ({
              id: l.id,
              email: l.email,
              email_length: l.email?.length,
              first_name: l.first_name,
              last_name: l.last_name
            }));
            
            log.status = 'error';
            log.error = `No lead found with ${searchField} = "${searchValue}". Tenant has ${allLeads.length} total leads. Check if the value exists and matches exactly.`;
            log.debug_info = {
              tenant_id: tenantId,
              search_field: searchField,
              search_value: searchValue,
              search_value_length: searchValue?.length,
              search_value_type: typeof searchValue,
              filter_used: filter,
              sample_leads: sampleLeads
            };
          }
        }
        break;
      }

      case 'update_lead': {
        const lead = context.variables.found_lead;
        
        if (!lead) {
          log.status = 'error';
          log.error = 'No lead found in context. Make sure a find_lead or create_lead node runs before this.';
          break;
        }

        const mappings = config.field_mappings || [];
        const updates = {};
        
        console.log('[update_lead] Applying mappings:', mappings);
        
        for (const mapping of mappings) {
          if (mapping.lead_field && mapping.webhook_field) {
            const value = replaceVariables(`{{${mapping.webhook_field}}}`, context);
            // Only add to updates if the value was successfully replaced (i.e., not the original template string)
            // and it's not null/undefined. Allowing empty string for updates.
            if (value !== `{{${mapping.webhook_field}}}` && value !== null && value !== undefined) {
              updates[mapping.lead_field] = value;
            }
          }
        }
        
        console.log('[update_lead] Updates to apply:', updates);
        
        if (Object.keys(updates).length === 0) {
          log.status = 'error';
          log.error = 'No field mappings configured or no values to update';
          log.debug_info = { configured_mappings: mappings };
          break;
        }
        
        const updatedLead = await base44.asServiceRole.entities.Lead.update(lead.id, updates);
        log.output = { updatedLead, applied_updates: updates };
        break;
      }

      case 'find_contact': {
        const searchField = config.search_field || 'email';
        let searchValue = replaceVariables(config.search_value || '{{email}}', context);
        
        if (typeof searchValue === 'string') {
          searchValue = searchValue.replace(/^["']|["']$/g, '').trim();
        }
        
        const filter = {
          tenant_id: tenantId,
          [searchField]: searchValue
        };
        
        const contacts = await base44.asServiceRole.entities.Contact.filter(filter);
        
        if (contacts && contacts.length > 0) {
          log.output = { contact: contacts[0] };
        } else {
          log.status = 'error';
          log.error = `No contact found with ${searchField} = ${searchValue}`;
        }
        break;
      }

      case 'update_contact': {
        const contact = context.variables.found_contact;
        
        if (!contact) {
          log.status = 'error';
          log.error = 'No contact found in context';
          break;
        }

        const mappings = config.field_mappings || [];
        const updates = {};
        
        for (const mapping of mappings) {
          if (mapping.contact_field && mapping.webhook_field) {
            const value = replaceVariables(`{{${mapping.webhook_field}}}`, context);
            if (value !== `{{${mapping.webhook_field}}}` && value !== null && value !== undefined) {
              updates[mapping.contact_field] = value;
            }
          }
        }
        
        if (Object.keys(updates).length === 0) {
          log.status = 'error';
          log.error = 'No field mappings configured';
          break;
        }
        
        const updatedContact = await base44.asServiceRole.entities.Contact.update(contact.id, updates);
        log.output = { updatedContact, applied_updates: updates };
        break;
      }

      case 'create_activity': {
        const activityType = config.type || 'task';
        const subject = replaceVariables(config.subject || 'Workflow activity', context);
        const description = replaceVariables(config.description || '', context);
        
        const lead = context.variables.found_lead;
        const contact = context.variables.found_contact;
        
        const activityData = {
          tenant_id: tenantId,
          type: activityType,
          subject: subject,
          description: description,
          status: 'scheduled',
          priority: 'normal' 
        };
        
        if (lead) {
          activityData.related_to = 'lead';
          activityData.related_id = lead.id;
          activityData.related_name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
        } else if (contact) {
          activityData.related_to = 'contact';
          activityData.related_id = contact.id;
          activityData.related_name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        }
        
        const activity = await base44.asServiceRole.entities.Activity.create(activityData);
        log.output = { activity };
        break;
      }

      case 'send_email': {
        const to = replaceVariables(config.to || '{{email}}', context);
        const subject = replaceVariables(config.subject || '', context);
        const body = replaceVariables(config.body || '', context);
        
        console.log('[send_email] Would send email:', { to, subject, body });
        
        log.output = {
          email_sent: true,
          to,
          subject
        };
        break;
      }

      case 'condition': {
        const fieldTemplate = config.field || ''; // e.g., "found_lead.status", "payload.email"
        const operator = config.operator || 'equals';
        const compareValue = replaceVariables(config.value || '', context);

        console.log('[condition] Evaluating:', { fieldTemplate, operator, compareValue });

        if (!fieldTemplate) {
          log.status = 'error';
          log.error = 'No field configured for condition';
          break;
        }

        // Use replaceVariables to get the actual value for comparison
        const actualValue = replaceVariables(`{{${fieldTemplate}}}`, context);

        console.log('[condition] Actual value:', actualValue, 'from template:', fieldTemplate);

        let conditionResult = false;

        switch (operator) {
          case 'equals':
            conditionResult = String(actualValue) === String(compareValue);
            break;
          case 'not_equals':
            conditionResult = String(actualValue) !== String(compareValue);
            break;
          case 'contains':
            conditionResult = String(actualValue || '').toLowerCase().includes(String(compareValue || '').toLowerCase());
            break;
          case 'greater_than':
            conditionResult = Number(actualValue) > Number(compareValue);
            break;
          case 'less_than':
            conditionResult = Number(actualValue) < Number(compareValue);
            break;
          case 'exists':
            // A variable "exists" if its resolved value is not null, undefined, or an empty string,
            // AND it's not still the original template string (meaning it couldn't be resolved).
            conditionResult = actualValue !== null && actualValue !== undefined && actualValue !== '';
            if (typeof actualValue === 'string' && actualValue.startsWith('{{') && actualValue.endsWith('}}')) {
                conditionResult = false; // The variable couldn't be resolved, so it doesn't exist
            }
            break;
          case 'not_exists':
            // A variable "does not exist" if its resolved value is null, undefined, an empty string,
            // OR it's still the original template string (meaning it couldn't be resolved).
            conditionResult = actualValue === null || actualValue === undefined || actualValue === '';
            if (typeof actualValue === 'string' && actualValue.startsWith('{{') && actualValue.endsWith('}}')) {
                conditionResult = true; // The variable couldn't be resolved, so it does not exist
            }
            break;
          default:
            conditionResult = false;
        }

        log.output = { 
          condition_result: conditionResult,
          field_template: fieldTemplate,
          actual_value: actualValue,
          compare_value: compareValue,
          operator: operator
        };

        // Store the condition result in context for path selection by getNextNode
        context.last_condition_result = conditionResult;

        console.log('[condition] Result:', conditionResult);
        break;
      }

      default:
        log.status = 'error';
        log.error = `Unknown node type: ${node.type}`;
    }

  } catch (error) {
    console.error(`[${node.type}] Error:`, error);
    log.status = 'error';
    log.error = error.message;
  }

  return log;
}

function replaceVariables(template, context) {
  if (typeof template !== 'string') return template;

  return template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
    const trimmed = variable.trim();
    
    // Check context.payload first
    if (context.payload && context.payload[trimmed] !== undefined) {
      return context.payload[trimmed];
    }
    
    // Check context.variables (from previous node outputs)
    // This allows for nested property access like 'node_id.output_key'
    const parts = trimmed.split('.');
    if (parts.length > 1) {
      let value = context.variables[parts[0]];
      for (let i = 1; i < parts.length; i++) {
        if (value && value[parts[i]] !== undefined) {
          value = value[parts[i]];
        } else {
          value = undefined; // Path not found
          break;
        }
      }
      if (value !== undefined) {
        return value;
      }
    } else if (context.variables && context.variables[trimmed] !== undefined) {
      return context.variables[trimmed];
    }
    
    return match; // If no variable found, return the original {{variable}} string
  });
}


----------------------------

export default executeWorkflow;
