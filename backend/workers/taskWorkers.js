import { taskQueue } from '../services/taskQueue.js';
import { emitTaskAssigned, emitRunStarted, emitRunFinished, emitTaskCompleted, emitToolCallStarted, emitToolCallFinished, emitHandoff } from '../lib/telemetry/index.js';
import { randomUUID } from 'crypto';
import logger from '../lib/logger.js';
import { getOpenAIClient } from '../lib/aiProvider.js';
import { getBraidSystemPrompt, generateToolSchemas, executeBraidTool, TOOL_ACCESS_TOKEN } from '../lib/braidIntegration-v2.js';
import { getAgentProfile } from '../lib/agents/agentRegistry.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { resolveCanonicalTenant } from '../lib/tenantCanonicalResolver.js';

export function startTaskWorkers(pgPool) {
  logger.info('[TaskWorkers] Starting Ops Dispatch and Execute workers');

  // Ops Dispatch Worker
  taskQueue.process('ops-dispatch', 1, async (job) => {
    const { task_id, run_id, tenant_id, description, entity_type, entity_id, force_assignee, context = {}, related_data } = job.data;
    logger.info(`[OpsDispatch] Processing task ${task_id}`, { force_assignee });

    try {
      // 1. Determine Assignee based on task intent
      let assignee = force_assignee || 'ops_manager:dev'; // Use forced assignee if provided (for handoffs)
      
      // Only do routing if not forced
      if (!force_assignee) {
        const desc = description.toLowerCase();
        
        // Priority routing - check specific capabilities first
        // IMPORTANT: Sales/opportunity keywords take highest priority (updates, stage changes, won/lost)
        if (desc.match(/\b(opportunity|won|lost|deal|close|proposal|quote|negotiat|pipeline)\b/)) {
          assignee = 'sales_manager:dev'; // Sales owns opportunity lifecycle
        } else if (desc.match(/\b(schedule|appointment|meeting|calendar|set up a call|book|reminder|remind)\b/)) {
          assignee = 'project_manager:dev'; // PM owns calendar/scheduling/reminders
        } else if (desc.match(/\b(sales|revenue|forecast)\b/)) {
          assignee = 'sales_manager:dev';
        } else if (desc.match(/\b(marketing|campaign|content|newsletter|email blast)\b/)) {
          assignee = 'marketing_manager:dev';
        } else if (desc.match(/\b(research|find|prospect|lead|outreach|contact|enrich)\b/)) {
          assignee = 'client_services_expert:dev'; // Client Services handles research/prospecting
        } else if (desc.match(/\b(support|help|issue|ticket|customer service|problem)\b/)) {
          assignee = 'customer_service_manager:dev';
        } else if (desc.match(/\b(project|milestone|task|deadline|timeline)\b/)) {
          assignee = 'project_manager:dev';
        }
      }

      logger.info(`[OpsDispatch] Routing "${description}" to ${assignee}`);

      // 2. Update Task
      await pgPool.query(
        `UPDATE tasks SET status = 'ASSIGNED', assigned_to = $1, updated_at = NOW() WHERE id = $2`,
        [assignee, task_id]
      );

      // 3. Emit task_assigned
      emitTaskAssigned({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id,
        task_id,
        to_agent_id: assignee,
        agent_id: 'ops_manager:dev', // Dispatcher
        queue: 'primary',
        reason: 'Intent routing'
      });

      // 4. Enqueue Execute
      await taskQueue.add('execute-task', {
        task_id,
        run_id,
        tenant_id,
        assignee,
        description,
        entity_type,
        entity_id,
        context, // Pass through context for handoff metadata
        related_data // Pass through related data from frontend (opportunities, activities, notes)
      });

      return { status: 'assigned', assignee };
    } catch (err) {
      logger.error(`[OpsDispatch] Error: ${err.message}`);
      throw err;
    }
  });

  // Execute Worker - Actually invokes LLM with agent profile and tools
  taskQueue.process('execute-task', 1, async (job) => {
    const { task_id, run_id, tenant_id, assignee, description, entity_type, entity_id, context = {}, related_data } = job.data;
    logger.info(`[ExecuteTask] Agent ${assignee} executing task ${task_id}`);

    try {
      // 1. Resolve tenant and agent profile
      const resolvedTenant = await resolveCanonicalTenant(tenant_id);
      if (!resolvedTenant?.found) {
        throw new Error(`Tenant ${tenant_id} not found`);
      }

      // Create tenantRecord in the format expected by executeBraidTool (same as sidepanel)
      const tenantRecord = {
        id: resolvedTenant.uuid,           // UUID primary key
        tenant_id: resolvedTenant.slug,    // text business identifier (for backwards compat)
        name: resolvedTenant.slug          // use slug as name fallback
      };

      // Extract role from assignee (format: "role:environment" e.g., "customer_service_manager:dev")
      const agentRole = assignee.split(':')[0];
      const agentProfile = await getAgentProfile({ tenant_id: tenantRecord.id, role: agentRole });
      
      logger.info(`[ExecuteTask] Using agent profile: ${agentProfile.display_name} (${agentProfile.model})`);

      // 2. Emit run_started
      emitRunStarted({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id: tenantRecord.id,
        agent_id: assignee,
        entrypoint: 'worker',
        input_summary: description
      });

      // 3. Build context for LLM - the "folder" contains all profile data
      let contextInfo = `Task: ${description}\n`;
      if (entity_type && entity_id) {
        contextInfo += `Entity Type: ${entity_type}\nEntity ID: ${entity_id}\n`;
        
        // Check if frontend provided profile and related data (from profile page)
        const hasProfileData = related_data?.profile;
        const hasRelatedData = related_data && (
          (related_data.opportunities && related_data.opportunities.length > 0) ||
          (related_data.activities && related_data.activities.length > 0) ||
          (related_data.notes && related_data.notes.length > 0)
        );
        
        if (hasProfileData || hasRelatedData) {
          // Use data provided by frontend - no need to fetch again
          logger.info('[ExecuteTask] Using profile/related data from frontend profile page');
          
          // Include the FULL PROFILE DATA - this is critical for agents to know account_id, contact_id, etc.
          if (hasProfileData) {
            const profile = related_data.profile;
            contextInfo += `\n═══════════════════════════════════════════════════════════\n`;
            contextInfo += `📂 ENTITY PROFILE (use these IDs for creating related records):\n`;
            contextInfo += `═══════════════════════════════════════════════════════════\n`;
            
            // Extract key identifiers the agent needs
            // CRITICAL: When entity_type matches, the profile.id IS that entity's ID
            if (entity_type === 'lead') {
              contextInfo += `  LEAD_ID: ${profile.id}\n`;
            } else if (entity_type === 'contact') {
              contextInfo += `  CONTACT_ID: ${profile.id}\n`;
            } else if (entity_type === 'account') {
              contextInfo += `  ACCOUNT_ID: ${profile.id}\n`;
            } else if (entity_type === 'opportunity') {
              contextInfo += `  OPPORTUNITY_ID: ${profile.id}\n`;
            } else {
              contextInfo += `  ${entity_type.toUpperCase()}_ID: ${profile.id}\n`;
            }
            
            // Also include any referenced IDs (e.g., contact has account_id)
            if (profile.account_id && entity_type !== 'account') contextInfo += `  ACCOUNT_ID: ${profile.account_id}\n`;
            if (profile.contact_id && entity_type !== 'contact') contextInfo += `  CONTACT_ID: ${profile.contact_id}\n`;
            if (profile.lead_id && entity_type !== 'lead') contextInfo += `  LEAD_ID: ${profile.lead_id}\n`;
            
            // Include name and other context
            const displayName = profile.name || 
              [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
              profile.company || 'Unnamed';
            contextInfo += `  Name: ${displayName}\n`;
            if (profile.company) contextInfo += `  Company: ${profile.company}\n`;
            if (profile.email) contextInfo += `  Email: ${profile.email}\n`;
            if (profile.phone) contextInfo += `  Phone: ${profile.phone}\n`;
            if (profile.status) contextInfo += `  Status: ${profile.status}\n`;
            if (profile.stage) contextInfo += `  Stage: ${profile.stage}\n`;
            
            // Include account name if available
            if (profile.account_name) contextInfo += `  Account Name: ${profile.account_name}\n`;
            if (profile.account?.name) contextInfo += `  Account Name: ${profile.account.name}\n`;
            
            contextInfo += `\n⚠️ Use these IDs when creating opportunities, activities, or notes:\n`;
            contextInfo += `   - For opportunities: use lead_id (for leads) OR account_id + contact_id (for contacts/accounts)\n`;
            contextInfo += `   - For activities/notes: use the ${entity_type}_id shown above\n`;
            contextInfo += `═══════════════════════════════════════════════════════════\n`;
          }
          
          // Add opportunities with prominent IDs for the LLM
          if (related_data.opportunities && related_data.opportunities.length > 0) {
            contextInfo += `\n═══════════════════════════════════════════════════════════\n`;
            contextInfo += `📋 RELATED OPPORTUNITIES (from profile page):\n`;
            contextInfo += `═══════════════════════════════════════════════════════════\n`;
            for (const opp of related_data.opportunities) {
              contextInfo += `\n  🎯 OPPORTUNITY ID: ${opp.id}\n`;
              contextInfo += `     Name: ${opp.name || 'Unnamed'}\n`;
              contextInfo += `     Stage: ${opp.stage || 'N/A'} | Status: ${opp.status || 'N/A'}\n`;
              contextInfo += `     Value: $${opp.value || 0} | Probability: ${opp.probability || 0}%\n`;
              if (opp.close_date) contextInfo += `     Close Date: ${opp.close_date}\n`;
            }
            contextInfo += `\n⚠️ CRITICAL: When updating an opportunity, use the OPPORTUNITY ID shown above (e.g., "${related_data.opportunities[0].id}").\n`;
            contextInfo += `   DO NOT use the contact ID "${entity_id}" - that will fail!\n`;
            contextInfo += `═══════════════════════════════════════════════════════════\n`;
          }
          
          if (related_data.activities && related_data.activities.length > 0) {
            contextInfo += `\nRecent Activities (${related_data.activities.length}):\n`;
            const recentActivities = related_data.activities.slice(0, 5);
            contextInfo += JSON.stringify(recentActivities.map(a => ({
              id: a.id,
              type: a.type || a.activity_type,
              subject: a.subject,
              date: a.scheduled_date || a.due_date
            })), null, 2) + '\n';
          }
          
          if (related_data.notes && related_data.notes.length > 0) {
            contextInfo += `\nRecent Notes (${related_data.notes.length}):\n`;
            const recentNotes = related_data.notes.slice(0, 3);
            contextInfo += JSON.stringify(recentNotes.map(n => ({
              id: n.id,
              content: (n.content || '').substring(0, 100)
            })), null, 2) + '\n';
          }
        } else {
          // Fallback: Fetch entity details if frontend didn't provide them
          try {
            const supa = getSupabaseClient();
            const tableName = entity_type === 'contact' ? 'contacts' : 
                             entity_type === 'account' ? 'accounts' :
                             entity_type === 'lead' ? 'leads' :
                             entity_type === 'opportunity' ? 'opportunities' : null;
            
            if (tableName) {
              const { data: entityData } = await supa
                .from(tableName)
                .select('*')
                .eq('id', entity_id)
                .eq('tenant_id', tenantRecord.id)
                .single();
              
              if (entityData) {
                // Format as structured profile data (same as frontend provides)
                contextInfo += `\n═══════════════════════════════════════════════════════════\n`;
                contextInfo += `📂 ENTITY PROFILE (use these IDs for creating related records):\n`;
                contextInfo += `═══════════════════════════════════════════════════════════\n`;
                
                // Extract key identifiers - entity's own ID is named by entity_type
                if (entity_type === 'lead') {
                  contextInfo += `  LEAD_ID: ${entityData.id}\n`;
                } else if (entity_type === 'contact') {
                  contextInfo += `  CONTACT_ID: ${entityData.id}\n`;
                } else if (entity_type === 'account') {
                  contextInfo += `  ACCOUNT_ID: ${entityData.id}\n`;
                } else if (entity_type === 'opportunity') {
                  contextInfo += `  OPPORTUNITY_ID: ${entityData.id}\n`;
                } else {
                  contextInfo += `  ${entity_type.toUpperCase()}_ID: ${entityData.id}\n`;
                }
                
                // Also include any referenced IDs
                if (entityData.account_id && entity_type !== 'account') contextInfo += `  ACCOUNT_ID: ${entityData.account_id}\n`;
                if (entityData.contact_id && entity_type !== 'contact') contextInfo += `  CONTACT_ID: ${entityData.contact_id}\n`;
                if (entityData.lead_id && entity_type !== 'lead') contextInfo += `  LEAD_ID: ${entityData.lead_id}\n`;
                
                // Include name and context
                const displayName = entityData.name || 
                  [entityData.first_name, entityData.last_name].filter(Boolean).join(' ') ||
                  entityData.company || 'Unnamed';
                contextInfo += `  Name: ${displayName}\n`;
                if (entityData.company) contextInfo += `  Company: ${entityData.company}\n`;
                if (entityData.email) contextInfo += `  Email: ${entityData.email}\n`;
                if (entityData.phone) contextInfo += `  Phone: ${entityData.phone}\n`;
                if (entityData.status) contextInfo += `  Status: ${entityData.status}\n`;
                if (entityData.stage) contextInfo += `  Stage: ${entityData.stage}\n`;
                
                contextInfo += `\n⚠️ Use these IDs when creating opportunities, activities, or notes:\n`;
                contextInfo += `   - For opportunities: use lead_id (for leads) OR account_id + contact_id (for contacts/accounts)\n`;
                contextInfo += `   - For activities/notes: use the ${entity_type}_id shown above\n`;
                contextInfo += `═══════════════════════════════════════════════════════════\n`;
                
                // If entity is a contact, also fetch related opportunities
                if (entity_type === 'contact') {
                  const { data: relatedOpps } = await supa
                    .from('opportunities')
                    .select('id, name, stage, status, value, close_date, account_id')
                    .eq('contact_id', entity_id)
                    .eq('tenant_id', tenantRecord.id);
                  
                  if (relatedOpps && relatedOpps.length > 0) {
                    contextInfo += `\n═══════════════════════════════════════════════════════════\n`;
                    contextInfo += `📋 RELATED OPPORTUNITIES:\n`;
                    for (const opp of relatedOpps) {
                      contextInfo += `\n  🎯 OPPORTUNITY ID: ${opp.id}\n`;
                      contextInfo += `     Name: ${opp.name || 'Unnamed'}\n`;
                      contextInfo += `     Stage: ${opp.stage || 'N/A'} | Value: $${opp.value || 0}\n`;
                    }
                    contextInfo += `\n⚠️ CRITICAL: When updating an opportunity, use the OPPORTUNITY ID shown above (e.g., "${relatedOpps[0].id}").\n`;
                    contextInfo += `   DO NOT use the contact ID "${entity_id}" - that will fail!\n`;
                    contextInfo += `═══════════════════════════════════════════════════════════\n`;
                  }
                }
              }
            }
          } catch (e) {
            logger.warn(`[ExecuteTask] Could not fetch entity details: ${e.message}`);
          }
        }
      }

      // 4. Generate tool schemas filtered to agent's allowlist
      const allToolSchemas = await generateToolSchemas();
      const allowedTools = agentProfile.tool_allowlist.includes('*') 
        ? allToolSchemas 
        : allToolSchemas.filter(tool => agentProfile.tool_allowlist.includes(tool.function.name));

      // 6. Build system prompt with agent identity
      const systemPrompt = getBraidSystemPrompt(tenantRecord);
      
      // Add role-specific guidance
      let roleGuidance = '';
      if (agentRole === 'ops_manager') {
        roleGuidance = `

**IMPORTANT - Task Delegation Rules:**
1. When delegating to another agent, use delegate_task with:
   - to_agent: the target role (e.g., "sales_manager", "project_manager")
   - task_description: clear description of what needs to be done
   - Include any relevant IDs (contact_id, account_id) in the task description

2. For complex multi-step requests, break them into separate delegations:
   - Sales-related (deals, opportunities) → delegate to sales_manager
   - Scheduling (meetings, calls, reminders) → delegate to project_manager
   - Research/prospecting → delegate to client_services_expert
   - Customer issues → delegate to customer_service_manager`;
      } else if (agentRole === 'project_manager') {
        roleGuidance = `

**IMPORTANT - Activity Management Rules:**

1. For NEW activities (schedule, create, set up):
   - Use create_activity with subject, type, scheduled_date, and any related entity IDs
   - Valid types: 'call', 'meeting', 'task', 'email', 'follow_up'
   - If missing details, use reasonable defaults (30 min duration, tomorrow if no date)
   - ALWAYS call create_activity - don't just describe what should happen

2. For EXISTING activities (update, reschedule, complete):
   - Look at "Recent Activities" in the context above to find the ACTIVITY ID
   - Use update_activity or mark_activity_complete with that activity_id
   - ⚠️ Do NOT use contact_id or account_id as activity_id - they are different!

Example for "Schedule a call with John tomorrow at 2pm":
- Call create_activity with type: "call", subject: "Call with John", scheduled_date: tomorrow 2pm

Example for "Mark the follow-up call as done":
- Step 1: Look at Recent Activities above to find the correct ACTIVITY ID
- Step 2: Call mark_activity_complete with that activity_id (NOT the contact ID!)`;
      } else if (agentRole === 'sales_manager') {
        roleGuidance = `

**IMPORTANT - Opportunity Management Rules:**

1. For NEW opportunities: Use create_opportunity with the deal name, amount, stage, and:
   - If from a LEAD: use the lead_id from the profile
   - If from an ACCOUNT/CONTACT: use account_id and/or contact_id from the profile
   - ⚠️ Check the ENTITY PROFILE above for the correct IDs!
2. For EXISTING opportunities: Look at "Related Opportunities" in the context above to find the opportunity_id
   - Use update_opportunity or mark_opportunity_won with the correct opportunity_id
   - ⚠️ Do NOT use contact ID or lead ID as opportunity_id - they are different!
3. For multi-part requests (e.g., "mark won AND schedule a meeting"):
   - FIRST complete your part (create or update the opportunity)
   - THEN use delegate_task to hand off scheduling/meeting requests to project_manager
4. When delegating, use: delegate_task(to_agent: "project_manager", task_description: "<specific task>", handoff_type: "delegate")

Example for creating opportunity FROM A LEAD:
- Check profile: LEAD_ID: abc-123
- Call create_opportunity with name: "Lead Deal", amount: 50000, stage: "proposal", lead_id: "abc-123"

Example for creating opportunity FROM AN ACCOUNT:
- Check profile: ACCOUNT_ID: def-456, CONTACT_ID: ghi-789
- Call create_opportunity with name: "Account Deal", amount: 50000, stage: "proposal", account_id: "def-456", contact_id: "ghi-789"

Example for "Mark opportunity won and schedule celebration meeting":
- Step 1: Look at Related Opportunities above to find the correct opportunity ID
- Step 2: Call mark_opportunity_won with that opportunity_id (NOT the lead/contact ID!)
- Step 3: Call delegate_task to project_manager with the meeting details`;
      } else if (agentRole === 'client_services_expert') {
        roleGuidance = `

**IMPORTANT - Lead/Contact Creation Rules:**

1. For NEW leads: Use create_lead with name, email, company, and source
   - A lead is a potential prospect that hasn't been qualified yet
   - After creation, the response will contain the new lead_id

2. For NEW contacts: Use create_contact with name, email, phone, and optionally account_id
   - A contact is a qualified person, often linked to an account
   - After creation, the response will contain the new contact_id

3. For research tasks: FIRST use search_web or lookup_company_info, THEN create the entity
   - Don't create leads/contacts with placeholder data
   - Gather real info from research tools first

4. For multi-step requests (e.g., "research and create a lead"):
   - Step 1: Call search_web or lookup_company_info
   - Step 2: Use the research results to populate create_lead or create_contact
   - Step 3: If scheduling follow-up is needed, delegate_task to project_manager

⚠️ NEVER use placeholder IDs like "lead_id" or "contact_id" - wait for the actual ID from create response!`;
      } else if (agentRole === 'customer_service_manager') {
        roleGuidance = `

**IMPORTANT - Customer Service Rules:**

1. For customer lookups: Use search_contacts or get_contact_details with the customer's name/email
   - The result will contain the contact_id you need for follow-up actions

2. For logging interactions: Use create_note with the contact_id and content
   - Include issue details, resolution steps, customer sentiment

3. For scheduling follow-ups: Use create_activity with the contact_id
   - Types: 'follow_up', 'call', 'email'
   - Include clear subject describing the follow-up purpose

4. For searching history: Use search_notes to find previous interactions

⚠️ CRITICAL: When creating notes or activities for a customer:
- FIRST get the contact_id from search_contacts or get_contact_details
- THEN use that contact_id (not a placeholder) in create_note or create_activity`;
      } else if (agentRole === 'marketing_manager') {
        roleGuidance = `

**IMPORTANT - Marketing Campaign Rules:**

1. For audience segmentation: Use search_leads or list_accounts to find targets
   - Filter by criteria relevant to your campaign
   - The results contain IDs you can use for campaign notes

2. For campaign planning: Use create_note to document campaign strategy
   - Include goals, target audience, messaging, timeline

3. For campaign tasks: Use create_activity to schedule marketing activities
   - Types: 'task', 'email', 'meeting'
   - Include clear subject and due dates

4. For complex campaigns requiring sales follow-up:
   - Use delegate_task to sales_manager for opportunity-related items`;
      }
      
      // Add handoff context if this is a delegated task
      let handoffContext = '';
      if (context.delegated_from) {
        handoffContext = `

**HANDOFF NOTICE:**
This task was delegated to you by ${context.delegated_from} (${context.handoff_type || 'delegate'})
${context.parent_task_id ? `Parent task: ${context.parent_task_id}` : ''}
${Object.keys(context).length > 3 ? `Additional context: ${JSON.stringify(context, null, 2)}` : ''}`;
      }
      
      const agentSystemPrompt = `${systemPrompt}

**Agent Identity:**
You are ${agentProfile.display_name}, a specialized AI agent with the following capabilities:
${agentProfile.metadata?.capabilities?.map(c => `- ${c}`).join('\n') || ''}

Your role is to: ${agentRole.replace(/_/g, ' ')}
${roleGuidance}${handoffContext}

**Current Task Context:**
${contextInfo}

**Instructions:**
Execute the task described above by using the appropriate tools available to you. Be thorough and professional.
Provide a clear summary of what you did.`;

      // 7. Invoke LLM with tools
      const messages = [
        { role: 'system', content: agentSystemPrompt },
        { role: 'user', content: description }
      ];

      let conversation = [...messages];
      let iterations = 0;
      const MAX_ITERATIONS = 5;
      let finalResponse = null;

      // Get OpenAI client for tool calling
      const client = getOpenAIClient();
      const model = agentProfile.model || 'gpt-4o-mini';
      const temperature = agentProfile.temperature || 0.2;

      logger.info(`[ExecuteTask] Calling LLM with ${allowedTools.length} tools for agent ${assignee}`);

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        logger.debug(`[ExecuteTask] LLM iteration ${iterations}`);

        const completion = await client.chat.completions.create({
          model,
          messages: conversation,
          tools: allowedTools,
          tool_choice: iterations === 1 ? 'auto' : 'auto', // Let model decide
          temperature,
        });

        logger.debug(`[ExecuteTask] LLM response:`, JSON.stringify(completion)?.slice(0, 500));

        const choice = completion?.choices?.[0];
        if (!choice) {
          logger.error(`[ExecuteTask] No choice in completion. Full response:`, JSON.stringify(completion)?.slice(0, 1000));
          throw new Error('No completion choice returned from LLM');
        }

        const assistantMessage = choice.message;
        conversation.push(assistantMessage);

        // Check for tool calls
        const toolCalls = assistantMessage.tool_calls || [];
        
        if (toolCalls.length === 0) {
          // No more tools to call - we're done
          finalResponse = assistantMessage.content;
          break;
        }

        // Execute tool calls
        logger.info(`[ExecuteTask] Executing ${toolCalls.length} tool calls`);
        
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function?.name;
          const toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
          
          logger.info(`[ExecuteTask] Tool: ${toolName}`, toolArgs);

          // Emit tool call started
          emitToolCallStarted({
            run_id,
            trace_id: run_id,
            span_id: randomUUID(),
            tenant_id: tenantRecord.id,
            agent_id: assignee,
            tool_name: toolName,
            input_summary: JSON.stringify(toolArgs).slice(0, 200)
          });

          let toolResult;
          try {
            // SPECIAL HANDLING: delegate_task (agent-to-agent handoff)
            if (toolName === 'delegate_task') {
              const { to_agent, task_description, handoff_type = 'delegate', context = {} } = toolArgs;
              
              if (!to_agent || !task_description) {
                throw new Error('delegate_task requires to_agent and task_description');
              }

              // Create new task in ops-dispatch queue for target agent
              const delegatedTaskId = `task:${randomUUID()}`;
              const delegatedRunId = randomUUID(); // New run for delegated task
              await taskQueue.add('ops-dispatch', {
                task_id: delegatedTaskId,
                run_id: delegatedRunId,
                description: task_description,
                context: {
                  ...context,
                  delegated_from: assignee,
                  handoff_type,
                  parent_task_id: task_id,
                  parent_run_id: run_id
                },
                tenant_id: tenantRecord.id,
                force_assignee: `${to_agent}:dev`, // Force routing to specific agent (add :dev suffix)
              });

              // Emit handoff telemetry
              emitHandoff({
                run_id,
                trace_id: run_id,
                span_id: randomUUID(),
                tenant_id: tenantRecord.id,
                from_agent_id: assignee,
                to_agent_id: `${to_agent}:dev`,
                task_id: delegatedTaskId,
                handoff_type,
                payload_ref: null,
                summary: task_description.slice(0, 100)
              });

              toolResult = {
                tag: 'Ok',
                value: {
                  task_id: delegatedTaskId,
                  delegated_to: to_agent,
                  status: 'delegated',
                  message: `Task successfully delegated to ${to_agent}`
                }
              };

              logger.info(`[ExecuteTask] Delegated task to ${to_agent}:`, delegatedTaskId);
            } else {
              // Use TOOL_ACCESS_TOKEN with agent info appended (same pattern as sidepanel)
              const dynamicAccessToken = {
                ...TOOL_ACCESS_TOKEN,
                user_role: 'agent',
                user_email: `agent:${assignee}`,
                user_name: agentProfile.display_name
              };

              // Execute the Braid tool with system token
              toolResult = await executeBraidTool(
                toolName,
                toolArgs,
                tenantRecord,
                `agent:${assignee}`, // userId - agent as executor
                dynamicAccessToken
              );
            }

            // Check if tool execution was successful
            const toolSucceeded = toolResult?.tag !== 'Err';

            // Emit tool call finished
            emitToolCallFinished({
              run_id,
              trace_id: run_id,
              span_id: randomUUID(),
              tenant_id: tenantRecord.id,
              agent_id: assignee,
              tool_name: toolName,
              status: toolSucceeded ? 'success' : 'error',
              output_summary: JSON.stringify(toolResult).slice(0, 200)
            });

            logger.info(`[ExecuteTask] Tool ${toolName} ${toolSucceeded ? 'succeeded' : 'failed'}:`, 
              toolSucceeded ? toolResult : toolResult.error);
          } catch (toolError) {
            logger.error(`[ExecuteTask] Tool ${toolName} failed:`, toolError);
            toolResult = { error: toolError.message };

            // Emit tool call finished (error)
            emitToolCallFinished({
              run_id,
              trace_id: run_id,
              span_id: randomUUID(),
              tenant_id: tenantRecord.id,
              agent_id: assignee,
              tool_name: toolName,
              status: 'error',
              output_summary: toolError.message.slice(0, 200)
            });
          }

          // Add tool result to conversation
          conversation.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
        }

        // Continue loop to let LLM process tool results
      }

      if (!finalResponse) {
        finalResponse = `Task executed with ${iterations} iterations. Check tool execution logs for details.`;
      }

      // 8. Emit run_completed / task_completed
      emitRunFinished({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id: tenantRecord.id,
        agent_id: assignee,
        status: 'success',
        output_summary: finalResponse.slice(0, 200)
      });

      emitTaskCompleted({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id: tenantRecord.id,
        agent_id: assignee,
        task_id,
        summary: finalResponse.slice(0, 200)
      });

      // 9. Update Task with result (if DB record exists - some tasks come from agent-office without DB record)
      try {
        await pgPool.query(
          `UPDATE tasks SET status = 'COMPLETED', result = $1, updated_at = NOW() WHERE id = $2`,
          [finalResponse, task_id]
        );
      } catch (updateErr) {
        // Task might not exist in DB (e.g., from agent-office run) - this is fine
        logger.debug(`[ExecuteTask] No DB task to update (task came from agent-office run)`);
      }

      logger.info(`[ExecuteTask] Task ${task_id} completed successfully`);
      return { status: 'completed', result: finalResponse };
      
    } catch (err) {
      logger.error(`[ExecuteTask] Error: ${err.message}`, err);
      
      // Emit error telemetry
      emitRunFinished({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id,
        agent_id: assignee,
        status: 'error',
        output_summary: err.message.slice(0, 200)
      });

      // Update task status to failed
      try {
        await pgPool.query(
          `UPDATE tasks SET status = 'FAILED', result = $1, updated_at = NOW() WHERE id = $2`,
          [err.message, task_id]
        );
      } catch (updateErr) {
        logger.error(`[ExecuteTask] Failed to update task status:`, updateErr);
      }

      throw err;
    }
  });
}
