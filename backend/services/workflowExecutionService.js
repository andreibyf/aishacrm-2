/**
 * Workflow Execution Service
 * 
 * Handles workflow execution logic with Supabase client.
 * This service is used by both the workflow routes and the queue processor.
 */

import { initiateOutboundCall } from '../lib/outboundCallService.js';
import { generateChatCompletion } from '../lib/aiEngine/llmClient.js';
import logger from '../lib/logger.js';

// Helper: lift workflow fields from metadata and align shape with frontend expectations
function normalizeWorkflow(row) {
  if (!row) return row;

  let meta = row.metadata;

  // Handle stringified JSON (common with some DB drivers or text columns)
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch (e) {
      logger.warn('[normalizeWorkflow] Failed to parse metadata string:', e);
      meta = {};
    }
  }

  // Ensure meta is an object
  meta = meta && typeof meta === 'object' ? meta : {};

  // Log if nodes are missing but expected (debugging)
  if ((!meta.nodes || meta.nodes.length === 0) && row.name) {
    logger.debug(`[normalizeWorkflow] Workflow "${row.name}" (id: ${row.id}) has no nodes in metadata. Raw metadata type: ${typeof row.metadata}`);
  }

  return {
    ...row,
    // Frontend expects trigger object
    trigger: row.trigger_type || row.trigger_config
      ? { type: row.trigger_type || 'webhook', config: row.trigger_config || {} }
      : undefined,
    // Lift commonly used fields stored in metadata
    nodes: meta.nodes || [],
    connections: meta.connections || [],
    webhook_url: meta.webhook_url || null,
    execution_count: meta.execution_count || 0,
    last_executed: meta.last_executed || null,
  };
}

/**
 * Execute a workflow by ID
 * @param {string} workflow_id - The workflow UUID
 * @param {object} triggerPayload - The trigger payload data
 * @returns {Promise<{status: string, httpStatus: number, data: object}>}
 */
export async function executeWorkflowById(workflow_id, triggerPayload) {
  // Dynamic import to avoid circular dependencies
  const { getSupabaseClient } = await import('../lib/supabase-db.js');
  const supabase = getSupabaseClient();
  
  const startTime = Date.now();
  const executionLog = [];
  let executionId = null;
  
  try {
    if (!workflow_id) {
      throw new Error('workflow_id is required');
    }

    // Load workflow
    const { data: wfData, error: wfError } = await supabase
      .from('workflow')
      .select('*')
      .eq('id', workflow_id)
      .single();
    
    if (wfError || !wfData) {
      return { status: 'error', httpStatus: 404, data: { message: 'Workflow not found' } };
    }
    
    const workflow = normalizeWorkflow(wfData);
    
    // 🔍 DEBUG: Log workflow tenant assignment
    logger.info(`[WorkflowExecution] Workflow ${workflow.id} belongs to tenant_id: ${workflow.tenant_id}`);
    
    if (workflow.is_active === false) {
      return { status: 'error', httpStatus: 400, data: { message: 'Workflow is not active' } };
    }

    // Create execution record (running)
    const { data: exData, error: exError } = await supabase
      .from('workflow_execution')
      .insert({
        workflow_id: workflow.id,
        tenant_id: workflow.tenant_id,
        status: 'running',
        trigger_data: triggerPayload ?? {},
        execution_log: [],
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (exError) {
      logger.error('[WorkflowExecution] Failed to create execution record:', exError);
      return { status: 'error', httpStatus: 500, data: { message: 'Failed to create execution record' } };
    }
    
    const execution = exData;
    executionId = execution.id;

    // Execution context
    const context = { payload: triggerPayload ?? {}, variables: {} };
    
    // 🔍 DEBUG: Log initial context setup
    logger.info(`[WorkflowExecution] Initial context created:`, {
      payload_keys: Object.keys(context.payload),
      payload: JSON.stringify(context.payload),
      has_email: 'email' in context.payload,
      email_value: context.payload.email
    });

    // Helper: resolve next node
    function getNextNode(currentNodeId) {
      const outgoing = (workflow.connections || []).filter(c => c.from === currentNodeId);
      if (!outgoing.length) return null;
      const current = (workflow.nodes || []).find(n => n.id === currentNodeId);
      if (current?.type === 'condition') {
        const conditionResult = context.last_condition_result;
        if (outgoing.length >= 2) {
          const target = conditionResult ? outgoing[0] : outgoing[1];
          return (workflow.nodes || []).find(n => n.id === target.to) || null;
        }
        return (workflow.nodes || []).find(n => n.id === outgoing[0].to) || null;
      }
      return (workflow.nodes || []).find(n => n.id === outgoing[0].to) || null;
    }

    // Helper: variable replacement
    function replaceVariables(template) {
      if (typeof template !== 'string') return template;
      return template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
        const trimmed = String(variable).trim();
        
        // Check payload first
        if (context.payload && context.payload[trimmed] !== undefined) {
          logger.debug(`[replaceVariables] Found "${trimmed}" in payload:`, context.payload[trimmed]);
          return context.payload[trimmed];
        }
        
        // Check nested paths
        const parts = trimmed.split('.');
        if (parts.length > 1) {
          let value = context.variables[parts[0]];
          for (let i = 1; i < parts.length; i++) {
            if (value && value[parts[i]] !== undefined) value = value[parts[i]]; else { value = undefined; break; }
          }
          if (value !== undefined) {
            logger.debug(`[replaceVariables] Found "${trimmed}" in nested variables:`, value);
            return value;
          }
        } else if (context.variables && context.variables[trimmed] !== undefined) {
          logger.debug(`[replaceVariables] Found "${trimmed}" in variables:`, context.variables[trimmed]);
          return context.variables[trimmed];
        }
        
        // Variable not found
        logger.warn(`[replaceVariables] Variable "${trimmed}" not found in context. Payload keys: ${Object.keys(context.payload).join(', ')}`);
        return match;
      });
    }

    // Node executor
    async function execNode(node) {
      const log = { node_id: node.id, node_type: node.type, timestamp: new Date().toISOString(), status: 'success', output: {} };
      const cfg = node.config || {};
      
      try {
        switch (node.type) {
          case 'webhook_trigger': {
            log.output = { payload: context.payload };
            break;
          }
          
          case 'http_request': {
            const method = (cfg.method || 'POST').toUpperCase();
            const url = replaceVariables(cfg.url || '');
            
            if (!url || url === cfg.url) {
              log.status = 'error';
              log.error = 'URL is required and must be properly configured';
              break;
            }

            const headers = { 'Content-Type': 'application/json' };
            if (cfg.headers && Array.isArray(cfg.headers)) {
              for (const h of cfg.headers) {
                if (h.key && h.value) {
                  headers[h.key] = replaceVariables(h.value);
                }
              }
            }

            let requestBody = null;
            if (method !== 'GET' && method !== 'HEAD') {
              if (cfg.body_type === 'raw') {
                requestBody = replaceVariables(cfg.body || '{}');
                try {
                  requestBody = JSON.parse(requestBody);
                } catch {
                  // Keep as string if not valid JSON
                }
              } else if (cfg.body_mappings && Array.isArray(cfg.body_mappings)) {
                requestBody = {};
                for (const mapping of cfg.body_mappings) {
                  if (mapping.key && mapping.value) {
                    const value = replaceVariables(`{{${mapping.value}}}`);
                    if (value !== `{{${mapping.value}}}`) {
                      requestBody[mapping.key] = value;
                    }
                  }
                }
              }
            }

            try {
              const fetchOptions = {
                method,
                headers,
                ...(requestBody && { body: typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody) })
              };

              const response = await fetch(url, fetchOptions);
              const contentType = response.headers.get('content-type');
              let responseData;
              
              if (contentType && contentType.includes('application/json')) {
                responseData = await response.json().catch(() => null);
              } else {
                responseData = await response.text();
              }

              log.output = {
                status_code: response.status,
                status_text: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                data: responseData
              };
              
              context.variables.last_http_response = responseData;
              context.variables.last_http_status = response.status;

              if (response.status >= 400) {
                log.status = 'error';
                log.error = `HTTP ${response.status}: ${response.statusText}`;
              }
            } catch (err) {
              log.status = 'error';
              log.error = `HTTP request failed: ${err.message}`;
            }
            break;
          }
          
          case 'send_email': {
            const toRaw = cfg.to || '{{email}}';
            const subjectRaw = cfg.subject || 'Workflow Email';
            const bodyRaw = cfg.body || '';

            const toValue = Array.isArray(toRaw)
              ? toRaw.map(t => replaceVariables(t))
              : String(replaceVariables(toRaw)).replace(/^['"]|['"]$/g, '').trim();
            const subject = String(replaceVariables(subjectRaw));
            const body = String(replaceVariables(bodyRaw));

            logger.info(`[WorkflowExecution] 📧 Email variables resolved: to="${toValue}", subject="${subject}", toRaw="${toRaw}"`);
            logger.info(`[WorkflowExecution] 📦 Context payload:`, JSON.stringify(context.payload));

            const lead = context.variables.found_lead;
            const contact = context.variables.found_contact;
            const related_to = lead ? 'lead' : (contact ? 'contact' : null);
            const related_id = lead ? lead.id : (contact ? contact.id : null);
            
            // Compute dedupe_key to prevent duplicate email activities
            // Format: workflow_id:node_id:email:timestamp_bucket
            const timeBucket = Math.floor(Date.now() / 60000); // 1-minute bucket
            const dedupeKey = `${workflow.id}:${node.id}:${toValue}:${timeBucket}`;

            const emailMeta = {
              created_by_workflow: workflow.id,
              dedupe_key: dedupeKey, // CRITICAL: Prevents duplicate activities
              email: {
                to: toValue,
                subject,
                cc: cfg.cc ? replaceVariables(cfg.cc) : undefined,
                bcc: cfg.bcc ? replaceVariables(cfg.bcc) : undefined,
                from: cfg.from ? replaceVariables(cfg.from) : undefined
              }
            };

            // 🔍 DEBUG: Log tenant_id being used for email activity
            logger.info(`[WorkflowExecution] Creating email activity with tenant_id: ${workflow.tenant_id} (workflow: ${workflow.id}), dedupeKey: ${dedupeKey}`);
            
            // Check if activity already exists with this dedupe_key
            const { data: existingAct } = await supabase
              .from('activities')
              .select('id')
              .eq('tenant_id', workflow.tenant_id)
              .eq('type', 'email')
              .contains('metadata', { dedupe_key: dedupeKey })
              .limit(1)
              .single();
            
            if (existingAct) {
              logger.info(`[WorkflowExecution] Email activity already exists (dedupe prevented): ${existingAct.id}`);
              log.output = { email_queued: false, duplicate_prevented: true, existing_activity_id: existingAct.id };
              break;
            }
            
            const { data: actData, error: actError } = await supabase
              .from('activities')
              .insert({
                tenant_id: workflow.tenant_id,
                type: 'email',
                subject: subject || null,
                body: body || null,
                status: 'queued',
                related_id: related_id,
                related_to: related_to,
                metadata: emailMeta,
                created_date: new Date().toISOString(),
                updated_date: new Date().toISOString()
              })
              .select()
              .single();
            
            if (actData) {
              logger.info(`[WorkflowExecution] Email activity created: ${actData.id} with tenant_id: ${actData.tenant_id}`);
            }
            if (actError) {
              logger.error(`[WorkflowExecution] Failed to create email activity: ${actError.message}`);
            }
            
            log.output = { email_queued: true, to: toValue, subject, activity_id: actData?.id };
            break;
          }
          
          case 'find_lead': {
            const field = cfg.search_field || 'email';
            let value = replaceVariables(cfg.search_value || '{{email}}');
            if (typeof value === 'string') value = value.replace(/^["']|["']$/g, '').trim();
            
            const { data: leadData, error: _leadError } = await supabase
              .from('leads')
              .select('*')
              .eq('tenant_id', workflow.tenant_id)
              .eq(field, value)
              .limit(1)
              .single();
            
            if (leadData) {
              log.output = { lead: leadData };
              context.variables.found_lead = leadData;
            } else {
              log.status = 'error';
              log.error = `No lead found with ${field} = ${value}`;
            }
            break;
          }
          
          case 'create_lead': {
            const mappings = cfg.field_mappings || [];
            if (!mappings.length) { log.status = 'error'; log.error = 'No field mappings configured'; break; }
            
            const insertData = { tenant_id: workflow.tenant_id };
            for (const m of mappings) {
              if (m.lead_field && m.webhook_field) {
                const v = replaceVariables(`{{${m.webhook_field}}}`);
                if (v !== null && v !== undefined && v !== '') {
                  insertData[m.lead_field] = v;
                }
              }
            }
            
            const { data: newLead, error: createError } = await supabase
              .from('leads')
              .insert(insertData)
              .select()
              .single();
            
            if (createError) {
              log.status = 'error';
              log.error = `Failed to create lead: ${createError.message}`;
            } else {
              log.output = { lead: newLead };
              context.variables.found_lead = newLead;
            }
            break;
          }
          
          case 'update_lead': {
            const lead = context.variables.found_lead;
            if (!lead) { log.status = 'error'; log.error = 'No lead found in context'; break; }
            
            const mappings = cfg.field_mappings || [];
            const updateData = {};
            for (const m of mappings) {
              if (m.lead_field && m.webhook_field) {
                const v = replaceVariables(`{{${m.webhook_field}}}`);
                if (v !== `{{${m.webhook_field}}}` && v !== null && v !== undefined) {
                  updateData[m.lead_field] = v;
                }
              }
            }
            
            if (!Object.keys(updateData).length) { 
              log.status = 'error'; 
              log.error = 'No field mappings configured or no values to update'; 
              break; 
            }
            
            updateData.updated_at = new Date().toISOString();
            
            const { data: updatedLead, error: updateError } = await supabase
              .from('leads')
              .update(updateData)
              .eq('id', lead.id)
              .select()
              .single();
            
            if (updateError) {
              log.status = 'error';
              log.error = `Failed to update lead: ${updateError.message}`;
            } else {
              log.output = { updatedLead, applied_updates: updateData };
            }
            break;
          }
          
          case 'find_contact': {
            const field = cfg.search_field || 'email';
            let value = replaceVariables(cfg.search_value || '{{email}}');
            if (typeof value === 'string') value = value.replace(/^["']|["']$/g, '').trim();
            
            const { data: contactData } = await supabase
              .from('contacts')
              .select('*')
              .eq('tenant_id', workflow.tenant_id)
              .eq(field, value)
              .limit(1)
              .single();
            
            if (contactData) {
              log.output = { contact: contactData };
              context.variables.found_contact = contactData;
            } else {
              log.status = 'error';
              log.error = `No contact found with ${field} = ${value}`;
            }
            break;
          }
          
          case 'update_contact': {
            const contact = context.variables.found_contact;
            if (!contact) { log.status = 'error'; log.error = 'No contact found in context'; break; }
            
            const mappings = cfg.field_mappings || [];
            const updateData = {};
            for (const m of mappings) {
              if (m.contact_field && m.webhook_field) {
                const v = replaceVariables(`{{${m.webhook_field}}}`);
                if (v !== `{{${m.webhook_field}}}` && v !== null && v !== undefined) {
                  updateData[m.contact_field] = v;
                }
              }
            }
            
            if (!Object.keys(updateData).length) { 
              log.status = 'error'; 
              log.error = 'No field mappings configured'; 
              break; 
            }
            
            updateData.updated_at = new Date().toISOString();
            
            const { data: updatedContact, error: updateError } = await supabase
              .from('contacts')
              .update(updateData)
              .eq('id', contact.id)
              .select()
              .single();
            
            if (updateError) {
              log.status = 'error';
              log.error = `Failed to update contact: ${updateError.message}`;
            } else {
              log.output = { updatedContact, applied_updates: updateData };
            }
            break;
          }
          
          case 'find_account': {
            const field = cfg.search_field || 'name';
            let value = replaceVariables(cfg.search_value || '{{company}}');
            if (typeof value === 'string') value = value.replace(/^["']|["']$/g, '').trim();
            
            const { data: accountData } = await supabase
              .from('accounts')
              .select('*')
              .eq('tenant_id', workflow.tenant_id)
              .eq(field, value)
              .limit(1)
              .single();
            
            if (accountData) {
              log.output = { account: accountData };
              context.variables.found_account = accountData;
            } else {
              log.status = 'error';
              log.error = `No account found with ${field} = ${value}`;
            }
            break;
          }
          
          case 'update_account': {
            const account = context.variables.found_account;
            if (!account) { log.status = 'error'; log.error = 'No account found in context'; break; }
            
            const mappings = cfg.field_mappings || [];
            const updateData = {};
            for (const m of mappings) {
              if (m.account_field && m.webhook_field) {
                const v = replaceVariables(`{{${m.webhook_field}}}`);
                if (v !== `{{${m.webhook_field}}}` && v !== null && v !== undefined) {
                  updateData[m.account_field] = v;
                }
              }
            }
            
            if (!Object.keys(updateData).length) { 
              log.status = 'error'; 
              log.error = 'No field mappings configured or no values to update'; 
              break; 
            }
            
            updateData.updated_date = new Date().toISOString();
            
            const { data: updatedAccount, error: updateError } = await supabase
              .from('accounts')
              .update(updateData)
              .eq('id', account.id)
              .select()
              .single();
            
            if (updateError) {
              log.status = 'error';
              log.error = `Failed to update account: ${updateError.message}`;
            } else {
              log.output = { updatedAccount, applied_updates: updateData };
            }
            break;
          }
          
          case 'create_opportunity': {
            const mappings = cfg.field_mappings || [];
            if (!mappings.length) { log.status = 'error'; log.error = 'No field mappings configured'; break; }
            
            const insertData = { tenant_id: workflow.tenant_id };
            for (const m of mappings) {
              if (m.opportunity_field && m.webhook_field) {
                const v = replaceVariables(`{{${m.webhook_field}}}`);
                if (v !== null && v !== undefined && v !== '') {
                  insertData[m.opportunity_field] = v;
                }
              }
            }
            
            // Associate to account or lead if present
            const account = context.variables.found_account;
            const lead = context.variables.found_lead;
            if (account) insertData.account_id = account.id;
            if (lead) insertData.lead_id = lead.id;
            
            const { data: newOpp, error: createError } = await supabase
              .from('opportunities')
              .insert(insertData)
              .select()
              .single();
            
            if (createError) {
              log.status = 'error';
              log.error = `Failed to create opportunity: ${createError.message}`;
            } else {
              log.output = { opportunity: newOpp };
              context.variables.found_opportunity = newOpp;
            }
            break;
          }
          
          case 'update_opportunity': {
            const opportunity = context.variables.found_opportunity;
            if (!opportunity) { log.status = 'error'; log.error = 'No opportunity found in context'; break; }
            
            const mappings = cfg.field_mappings || [];
            const updateData = {};
            for (const m of mappings) {
              if (m.opportunity_field && m.webhook_field) {
                const v = replaceVariables(`{{${m.webhook_field}}}`);
                if (v !== `{{${m.webhook_field}}}` && v !== null && v !== undefined) {
                  updateData[m.opportunity_field] = v;
                }
              }
            }
            
            if (!Object.keys(updateData).length) { 
              log.status = 'error'; 
              log.error = 'No field mappings configured'; 
              break; 
            }
            
            updateData.updated_date = new Date().toISOString();
            
            const { data: updatedOpp, error: updateError } = await supabase
              .from('opportunities')
              .update(updateData)
              .eq('id', opportunity.id)
              .select()
              .single();
            
            if (updateError) {
              log.status = 'error';
              log.error = `Failed to update opportunity: ${updateError.message}`;
            } else {
              log.output = { updatedOpportunity: updatedOpp, applied_updates: updateData };
            }
            break;
          }
          
          case 'create_activity': {
            const activityType = cfg.type || 'task';
            const subject = replaceVariables(cfg.title || cfg.subject || 'Workflow activity');
            const description = replaceVariables(cfg.details || cfg.description || '');
            
            const lead = context.variables.found_lead;
            const contact = context.variables.found_contact;
            const account = context.variables.found_account;
            const opportunity = context.variables.found_opportunity;
            
            const related_to = lead ? 'lead' : (contact ? 'contact' : (account ? 'account' : (opportunity ? 'opportunity' : null)));
            const related_id = lead ? lead.id : (contact ? contact.id : (account ? account.id : (opportunity ? opportunity.id : null)));
            
            const { data: actData, error: _actError } = await supabase
              .from('activities')
              .insert({
                tenant_id: workflow.tenant_id,
                type: activityType,
                subject: subject || null,
                body: description || null,
                status: 'scheduled',
                related_id: related_id,
                related_to: related_to,
                metadata: { created_by_workflow: workflow.id },
                created_date: new Date().toISOString(),
                updated_date: new Date().toISOString()
              })
              .select()
              .single();
            
            log.output = { activity: actData };
            break;
          }
          
          case 'condition': {
            const fieldTemplate = cfg.field || '';
            const operator = cfg.operator || 'equals';
            const compareValue = replaceVariables(cfg.value || '');
            const actualValue = replaceVariables(`{{${fieldTemplate}}}`);
            let result = false;
            
            switch (operator) {
              case 'equals': result = String(actualValue) === String(compareValue); break;
              case 'not_equals': result = String(actualValue) !== String(compareValue); break;
              case 'contains': result = String(actualValue || '').toLowerCase().includes(String(compareValue || '').toLowerCase()); break;
              case 'greater_than': result = Number(actualValue) > Number(compareValue); break;
              case 'less_than': result = Number(actualValue) < Number(compareValue); break;
              case 'exists': result = actualValue !== null && actualValue !== undefined && actualValue !== '' && !(typeof actualValue === 'string' && actualValue.startsWith('{{') && actualValue.endsWith('}}')); break;
              case 'not_exists': result = actualValue === null || actualValue === undefined || actualValue === '' || (typeof actualValue === 'string' && actualValue.startsWith('{{') && actualValue.endsWith('}}')); break;
              default: result = false;
            }
            
            context.last_condition_result = result;
            log.output = { condition_result: result, field_template: fieldTemplate, actual_value: actualValue, compare_value: compareValue, operator };
            break;
          }
          
          case 'ai_summarize': {
            const textToSummarize = replaceVariables(cfg.text || '');
            const provider = (cfg.provider || 'openai').toLowerCase();
            const model = cfg.model || 'gpt-4o-mini';
            
            try {
              const result = await generateChatCompletion({
                provider,
                model,
                messages: [
                  { role: 'system', content: 'You are a helpful assistant that summarizes text concisely.' },
                  { role: 'user', content: `Summarize the following:\n\n${textToSummarize}` }
                ],
                temperature: 0.5
              });
              
              if (result.status === 'success') {
                log.output = { summary: result.content, provider };
                context.variables.ai_summary = result.content;
              } else {
                throw new Error(result.error || 'AI summarization failed');
              }
            } catch (e) {
              log.status = 'error';
              log.error = `AI summarize failed: ${e.message}`;
            }
            break;
          }
          
          case 'ai_generate_email': {
            const provider = (cfg.provider || 'openai').toLowerCase();
            const model = cfg.model || 'gpt-4o-mini';
            const prompt = String(replaceVariables(cfg.prompt || ''));
            const recipientName = replaceVariables(cfg.recipient_name || '{{first_name}}');
            const senderName = replaceVariables(cfg.sender_name || 'AiSHA CRM');
            const tone = cfg.tone || 'professional';
            
            let email = { subject: '', body: '', provider };
            
            try {
              const lead = context.variables.found_lead;
              const contact = context.variables.found_contact;
              const account = context.variables.found_account;
              const opportunity = context.variables.found_opportunity;
              
              let contextInfo = '';
              if (lead) contextInfo += `Lead: ${lead.first_name} ${lead.last_name || ''} (${lead.company || 'No company'})\n`;
              if (contact) contextInfo += `Contact: ${contact.first_name} ${contact.last_name || ''} (${contact.email || 'No email'})\n`;
              if (account) contextInfo += `Account: ${account.name} (${account.industry || 'No industry'})\n`;
              if (opportunity) contextInfo += `Opportunity: ${opportunity.name} - Stage: ${opportunity.stage}, Value: $${opportunity.value || 0}\n`;
              
              const systemPrompt = `You are an AI email assistant. Generate a ${tone} email based on the user's instructions.
              
Context information:
${contextInfo || 'No additional context available.'}

Respond with ONLY a JSON object in this exact format:
{"subject": "Email subject line", "body": "Full email body text"}`;

              const userPrompt = `Generate an email for ${recipientName}. Instructions: ${prompt || 'Write a professional follow-up email.'}`;
              
              const result = await generateChatCompletion({
                provider,
                model,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ],
                temperature: 0.7
              });
              
              if (result.status === 'success' && result.content) {
                try {
                  const parsed = JSON.parse(result.content);
                  email = { subject: parsed.subject || 'Follow-up', body: parsed.body || result.content, provider };
                } catch {
                  email = { subject: 'Follow-up', body: result.content, provider };
                }
              } else {
                throw new Error(result.error || 'AI generation failed');
              }
              
              log.output = { ai_email: email };
              context.variables.ai_email = email;
            } catch (e) {
              log.status = 'error';
              log.error = `AI email generation failed: ${e.message}`;
              email = {
                subject: 'Follow-up on our conversation',
                body: `Hi ${recipientName},\n\n${prompt || 'Thank you for your time.'}\n\nBest regards,\n${senderName}`,
                provider: 'fallback'
              };
              log.output = { ai_email: email, fallback: true };
              context.variables.ai_email = email;
            }
            break;
          }
          
          case 'initiate_call': {
            const provider = cfg.provider || 'callfluent';
            let phoneNumber = replaceVariables(cfg.phone_number || '{{phone}}');
            const purpose = replaceVariables(cfg.purpose || 'Follow-up call');
            const talkingPointsRaw = cfg.talking_points || [];
            const talkingPoints = talkingPointsRaw.map(tp => replaceVariables(tp));

            const lead = context.variables.found_lead;
            const contact = context.variables.found_contact;
            const entity = lead || contact;

            if (!phoneNumber || phoneNumber === '{{phone}}') {
              phoneNumber = entity?.phone;
            }

            if (!phoneNumber) {
              log.status = 'error';
              log.error = 'No phone number available for call';
              break;
            }

            try {
              const callResult = await initiateOutboundCall({
                tenant_id: workflow.tenant_id,
                provider,
                phone_number: phoneNumber,
                contact_id: entity?.id,
                contact_name: entity?.first_name ? `${entity.first_name} ${entity.last_name || ''}`.trim() : entity?.name,
                contact_email: entity?.email,
                company: entity?.company,
                purpose,
                talking_points: talkingPoints,
                agent_id: cfg.agent_id,
                metadata: {
                  workflow_id: workflow.id,
                  workflow_name: workflow.name
                }
              });

              log.output = {
                call_initiated: callResult.success,
                provider,
                call_id: callResult.call_id,
                phone_number: phoneNumber,
                status: callResult.status
              };
              context.variables.call_result = callResult;
            } catch (callError) {
              log.status = 'error';
              log.error = `Call initiation failed: ${callError.message}`;
            }
            break;
          }
          
          case 'thoughtly_message': {
            const messageType = cfg.message_type || 'sms';
            const toRaw = messageType === 'sms' ? (cfg.to || '{{phone}}') : (cfg.to || '{{email}}');
            const messageRaw = cfg.message || cfg.body || '';
            const subjectRaw = cfg.subject || 'Message from Aisha CRM';

            const toValue = String(replaceVariables(toRaw)).replace(/^['"]|['"]$/g, '').trim();
            const message = String(replaceVariables(messageRaw));
            const subject = String(replaceVariables(subjectRaw));

            if (!toValue || toValue === '{{phone}}' || toValue === '{{email}}') {
              log.status = 'error';
              log.error = `No ${messageType === 'sms' ? 'phone number' : 'email'} provided`;
              break;
            }

            const lead = context.variables.found_lead;
            const contact = context.variables.found_contact;
            const entity = lead || contact;

            try {
              const { data: tenantSettings } = await supabase
                .from('modulesettings')
                .select('metadata')
                .eq('tenant_id', workflow.tenant_id)
                .eq('module_name', 'integrations')
                .single();
              
              const thoughtlyConfig = tenantSettings?.metadata?.thoughtly || {};
              const apiKey = thoughtlyConfig.api_key || process.env.THOUGHTLY_API_KEY;
              const apiEndpoint = thoughtlyConfig.api_endpoint || process.env.THOUGHTLY_API_ENDPOINT || 'https://api.thoughtly.io/v1';

              if (!apiKey) {
                log.status = 'error';
                log.error = 'Thoughtly API key not configured';
                break;
              }

              const payload = {
                type: messageType,
                to: toValue,
                message: message,
                subject: messageType === 'email' ? subject : undefined,
                contact_name: entity?.first_name ? `${entity.first_name} ${entity.last_name || ''}`.trim() : entity?.name,
                metadata: {
                  workflow_id: workflow.id,
                  tenant_id: workflow.tenant_id,
                  entity_type: lead ? 'lead' : 'contact',
                  entity_id: entity?.id
                }
              };

              const response = await fetch(`${apiEndpoint}/messages/send`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
              });

              const result = await response.json();

              log.output = {
                provider: 'thoughtly',
                message_type: messageType,
                to: toValue,
                message_id: result.message_id,
                status: result.status || (response.ok ? 'sent' : 'failed'),
                success: response.ok
              };
              context.variables.thoughtly_result = result;

              // Log as activity
              await supabase.from('activities').insert({
                tenant_id: workflow.tenant_id,
                type: messageType === 'sms' ? 'sms' : 'email',
                subject: messageType === 'sms' ? `SMS via Thoughtly: ${message.substring(0, 50)}` : subject,
                body: message,
                status: response.ok ? 'completed' : 'failed',
                related_id: entity?.id,
                related_to: lead ? 'lead' : (contact ? 'contact' : null),
                metadata: { created_by_workflow: workflow.id, provider: 'thoughtly', message_id: result.message_id },
                created_date: new Date().toISOString(),
                updated_date: new Date().toISOString()
              });

            } catch (err) {
              log.status = 'error';
              log.error = `Thoughtly message failed: ${err.message}`;
            }
            break;
          }
          
          case 'callfluent_message': {
            const toRaw = cfg.to || '{{phone}}';
            const messageRaw = cfg.message || '';

            const toValue = String(replaceVariables(toRaw)).replace(/^['"]|['"]$/g, '').trim();
            const message = String(replaceVariables(messageRaw));

            if (!toValue || toValue === '{{phone}}') {
              log.status = 'error';
              log.error = 'No phone number provided';
              break;
            }

            const lead = context.variables.found_lead;
            const contact = context.variables.found_contact;
            const entity = lead || contact;

            try {
              const { data: tenantSettings } = await supabase
                .from('modulesettings')
                .select('metadata')
                .eq('tenant_id', workflow.tenant_id)
                .eq('module_name', 'integrations')
                .single();
              
              const callfluentConfig = tenantSettings?.metadata?.callfluent || {};
              const apiKey = callfluentConfig.api_key || process.env.CALLFLUENT_API_KEY;
              const apiEndpoint = callfluentConfig.api_endpoint || process.env.CALLFLUENT_API_ENDPOINT || 'https://api.callfluent.ai/v1';

              if (!apiKey) {
                log.status = 'error';
                log.error = 'CallFluent API key not configured';
                break;
              }

              const payload = {
                to: toValue,
                message: message,
                from: callfluentConfig.from_number || cfg.from_number,
                contact_name: entity?.first_name ? `${entity.first_name} ${entity.last_name || ''}`.trim() : entity?.name,
                metadata: {
                  workflow_id: workflow.id,
                  tenant_id: workflow.tenant_id,
                  entity_type: lead ? 'lead' : 'contact',
                  entity_id: entity?.id
                }
              };

              const response = await fetch(`${apiEndpoint}/sms/send`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(payload)
              });

              const result = await response.json();

              log.output = {
                provider: 'callfluent',
                message_type: 'sms',
                to: toValue,
                message_id: result.message_id,
                status: result.status || (response.ok ? 'sent' : 'failed'),
                success: response.ok
              };
              context.variables.callfluent_result = result;

              // Log as activity
              await supabase.from('activities').insert({
                tenant_id: workflow.tenant_id,
                type: 'sms',
                subject: `SMS via CallFluent: ${message.substring(0, 50)}`,
                body: message,
                status: response.ok ? 'completed' : 'failed',
                related_id: entity?.id,
                related_to: lead ? 'lead' : (contact ? 'contact' : null),
                metadata: { created_by_workflow: workflow.id, provider: 'callfluent', message_id: result.message_id },
                created_date: new Date().toISOString(),
                updated_date: new Date().toISOString()
              });

            } catch (err) {
              log.status = 'error';
              log.error = `CallFluent message failed: ${err.message}`;
            }
            break;
          }
          
          case 'pabbly_webhook': {
            const webhookUrl = replaceVariables(cfg.webhook_url || '');
            
            if (!webhookUrl || webhookUrl.includes('{{')) {
              log.status = 'error';
              log.error = 'Pabbly webhook URL is required';
              break;
            }

            const lead = context.variables.found_lead;
            const contact = context.variables.found_contact;
            const opportunity = context.variables.found_opportunity;
            const account = context.variables.found_account;
            const entity = lead || contact || opportunity || account;

            let payload = {};
            
            if (cfg.payload_type === 'custom' && cfg.field_mappings && Array.isArray(cfg.field_mappings)) {
              for (const mapping of cfg.field_mappings) {
                if (mapping.pabbly_field && mapping.source_value) {
                  const value = replaceVariables(`{{${mapping.source_value}}}`);
                  if (value !== `{{${mapping.source_value}}}`) {
                    payload[mapping.pabbly_field] = value;
                  }
                }
              }
            } else {
              payload = {
                source: 'aisha_crm',
                workflow_id: workflow.id,
                workflow_name: workflow.name,
                tenant_id: workflow.tenant_id,
                timestamp: new Date().toISOString(),
                entity_type: lead ? 'lead' : (contact ? 'contact' : (opportunity ? 'opportunity' : (account ? 'account' : 'unknown'))),
                entity: entity ? { ...entity } : null,
                ai_summary: context.variables.ai_summary,
                ai_email: context.variables.ai_email,
                call_result: context.variables.call_result
              };
            }

            if (cfg.extra_fields && typeof cfg.extra_fields === 'object') {
              payload = { ...payload, ...cfg.extra_fields };
            }

            try {
              const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'AishaCRM-Workflow/1.0',
                  ...(cfg.headers && typeof cfg.headers === 'object' ? cfg.headers : {})
                },
                body: JSON.stringify(payload)
              });

              let result = {};
              try {
                result = await response.json();
              } catch {
                result = { raw_status: response.status };
              }

              log.output = {
                provider: 'pabbly',
                webhook_url: webhookUrl.substring(0, 50) + '...',
                status: response.ok ? 'sent' : 'failed',
                http_status: response.status,
                success: response.ok
              };
              context.variables.pabbly_result = result;

            } catch (err) {
              log.status = 'error';
              log.error = `Pabbly webhook failed: ${err.message}`;
            }
            break;
          }
          
          case 'wait_for_webhook': {
            const waitKey = cfg.wait_key || `workflow_${workflow.id}_${executionId}`;
            const timeoutMinutes = cfg.timeout_minutes || 60;
            const matchField = cfg.match_field || 'call_id';

            const waitState = {
              workflow_id: workflow.id,
              execution_id: executionId,
              node_id: node.id,
              wait_key: waitKey,
              match_field: matchField,
              match_value: context.variables.call_result?.call_id || context.variables[matchField] || cfg.match_value,
              timeout_at: new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString(),
              status: 'waiting',
              context_snapshot: JSON.stringify(context.variables)
            };

            // Store wait state (table may not exist yet)
            try {
              await supabase.from('workflow_wait_states').upsert({
                tenant_id: workflow.tenant_id,
                workflow_id: workflow.id,
                execution_id: executionId,
                node_id: node.id,
                wait_key: waitState.wait_key,
                match_field: waitState.match_field,
                match_value: waitState.match_value,
                timeout_at: waitState.timeout_at,
                status: 'waiting',
                context_snapshot: waitState.context_snapshot,
                created_at: new Date().toISOString()
              }, { onConflict: 'workflow_id,execution_id,node_id' });
            } catch (e) {
              logger.debug('[Workflow] wait_for_webhook state (table may not exist):', waitState);
            }

            log.output = {
              wait_state: 'waiting',
              wait_key: waitKey,
              match_field: matchField,
              match_value: waitState.match_value,
              timeout_at: waitState.timeout_at
            };

            context.variables.wait_state = waitState;
            break;
          }
          
          case 'wait': {
            const durationValue = cfg.duration_value || 1;
            const durationUnit = cfg.duration_unit || 'minutes';

            const conversions = {
              seconds: 1000,
              minutes: 60000,
              hours: 3600000,
              days: 86400000
            };

            const delayMs = durationValue * (conversions[durationUnit] || 60000);
            const maxDelay = 7 * 86400000; // 7 days max

            log.output = {
              duration_value: durationValue,
              duration_unit: durationUnit,
              delay_ms: Math.min(delayMs, maxDelay)
            };

            await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, maxDelay)));
            break;
          }
          
          case 'send_sms': {
            const toRaw = cfg.to || '{{phone}}';
            const messageRaw = cfg.message || '';

            const toValue = String(replaceVariables(toRaw)).replace(/^['"]|['"]$/g, '').trim();
            const message = String(replaceVariables(messageRaw));

            if (!toValue || toValue === '{{phone}}') {
              log.status = 'error';
              log.error = 'No phone number provided';
              break;
            }

            const lead = context.variables.found_lead;
            const contact = context.variables.found_contact;
            const related_to = lead ? 'lead' : (contact ? 'contact' : null);
            const related_id = lead ? lead.id : (contact ? contact.id : null);

            const { data: actData } = await supabase
              .from('activities')
              .insert({
                tenant_id: workflow.tenant_id,
                type: 'sms',
                subject: 'SMS: ' + message.substring(0, 50),
                body: message,
                status: 'queued',
                related_id: related_id,
                related_to: related_to,
                metadata: { created_by_workflow: workflow.id, sms: { to: toValue, message: message.substring(0, 160) } },
                created_date: new Date().toISOString(),
                updated_date: new Date().toISOString()
              })
              .select()
              .single();
            
            log.output = { sms_queued: true, to: toValue, message_length: message.length, activity_id: actData?.id };
            break;
          }
          
          case 'set_variable': {
            const varName = cfg.variable_name || 'custom_var';
            const varValue = replaceVariables(cfg.variable_value || '');
            context.variables[varName] = varValue;
            log.output = { variable_set: varName, value: varValue };
            break;
          }
          
          default: {
            log.status = 'warning';
            log.output = { message: `Unknown node type: ${node.type}` };
          }
        }
      } catch (nodeError) {
        log.status = 'error';
        log.error = nodeError.message;
      }
      
      return log;
    }

    // Find starting node
    const triggerNodes = (workflow.nodes || []).filter(n => n.type === 'webhook_trigger' || n.type === 'schedule_trigger' || n.type === 'manual_trigger');
    const startNode = triggerNodes[0] || (workflow.nodes || [])[0];

    if (!startNode) {
      return { status: 'error', httpStatus: 400, data: { message: 'No trigger node found in workflow' } };
    }

    // Execute nodes in sequence
    let currentNode = startNode;
    while (currentNode) {
      const log = await execNode(currentNode);
      executionLog.push(log);
      
      if (log.status === 'error' && !workflow.metadata?.continue_on_error) {
        // Update execution as failed
        await supabase.from('workflow_execution')
          .update({
            status: 'failed',
            execution_log: executionLog,
            completed_at: new Date().toISOString()
          })
          .eq('id', executionId);
        
        return {
          status: 'error',
          httpStatus: 200,
          data: {
            execution_id: executionId,
            status: 'failed',
            error_node: currentNode.id,
            error: log.error,
            execution_log: executionLog,
            duration_ms: Date.now() - startTime
          }
        };
      }
      
      currentNode = getNextNode(currentNode.id);
    }

    logger.debug('[WorkflowExecution] All nodes executed - updating execution record...');
    
    // Update execution as completed
    await supabase.from('workflow_execution')
      .update({
        status: 'completed',
        execution_log: executionLog,
        completed_at: new Date().toISOString()
      })
      .eq('id', executionId);

    logger.debug('[WorkflowExecution] Execution record updated - fetching workflow metadata...');
    
    // Update workflow metadata with execution stats
    const { data: currMeta } = await supabase
      .from('workflow')
      .select('metadata')
      .eq('id', workflow.id)
      .single();
    
    logger.debug('[WorkflowExecution] Workflow metadata fetched - updating stats...');
    
    const newMeta = {
      ...(currMeta?.metadata || {}),
      execution_count: ((currMeta?.metadata || {}).execution_count || 0) + 1,
      last_executed: new Date().toISOString()
    };
    
    logger.debug('[WorkflowExecution] Updating workflow metadata...');
    await supabase.from('workflow')
      .update({ metadata: newMeta, updated_at: new Date().toISOString() })
      .eq('id', workflow.id);

    logger.info('[WorkflowExecution] ✅ Execution complete - preparing return value');
    const returnValue = {
      status: 'success',
      httpStatus: 200,
      data: {
        execution_id: executionId,
        status: 'completed',
        execution_log: executionLog,
        duration_ms: Date.now() - startTime,
        variables: context.variables
      }
    };
    
    logger.debug('[WorkflowExecution] Returning:', { status: returnValue.status, execution_id: executionId });
    return returnValue;

  } catch (error) {
    logger.error('[WorkflowExecution] Error:', error);
    
    // Try to update execution record if we have one
    if (executionId) {
      try {
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        await supabase.from('workflow_execution')
          .update({
            status: 'failed',
            execution_log: [...executionLog, { error: error.message, timestamp: new Date().toISOString() }],
            completed_at: new Date().toISOString()
          })
          .eq('id', executionId);
      } catch (e) {
        logger.error('[WorkflowExecution] Failed to update execution record:', e);
      }
    }
    
    return {
      status: 'error',
      httpStatus: 500,
      data: {
        execution_id: executionId,
        message: error.message,
        execution_log: executionLog,
        duration_ms: Date.now() - startTime
      }
    };
  }
}

export { normalizeWorkflow };
