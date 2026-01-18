import { taskQueue } from '../services/taskQueue.js';
import { emitTaskAssigned, emitRunStarted, emitRunFinished, emitTaskCompleted, emitToolCallStarted, emitToolCallFinished } from '../lib/telemetry/index.js';
import { randomUUID } from 'crypto';
import logger from '../lib/logger.js';
import { generateChatCompletion, selectLLMConfigForTenant } from '../lib/aiEngine/index.js';
import { getBraidSystemPrompt, generateToolSchemas, executeBraidTool } from '../lib/braidIntegration-v2.js';
import { getAgentProfile } from '../lib/agents/agentRegistry.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { resolveCanonicalTenant } from '../lib/tenantCanonicalResolver.js';

export function startTaskWorkers(pgPool) {
  logger.info('[TaskWorkers] Starting Ops Dispatch and Execute workers');

  // Ops Dispatch Worker
  taskQueue.process('ops-dispatch', 1, async (job) => {
    const { task_id, run_id, tenant_id, description, entity_type, entity_id } = job.data;
    logger.info(`[OpsDispatch] Processing task ${task_id}`);

    try {
      // 1. Determine Assignee
      let assignee = 'ops_manager:dev'; // Default
      if (description.toLowerCase().includes('sales')) assignee = 'sales_manager:dev';
      if (description.toLowerCase().includes('marketing')) assignee = 'marketing_manager:dev';
      if (description.toLowerCase().includes('support')) assignee = 'customer_service_manager:dev';
      if (description.toLowerCase().includes('project')) assignee = 'project_manager:dev';

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
        entity_id
      });

      return { status: 'assigned', assignee };
    } catch (err) {
      logger.error(`[OpsDispatch] Error: ${err.message}`);
      throw err;
    }
  });

  // Execute Worker - Actually invokes LLM with agent profile and tools
  taskQueue.process('execute-task', 1, async (job) => {
    const { task_id, run_id, tenant_id, assignee, description, entity_type, entity_id } = job.data;
    logger.info(`[ExecuteTask] Agent ${assignee} executing task ${task_id}`);

    try {
      // 1. Resolve tenant and agent profile
      const tenantRecord = await resolveCanonicalTenant(tenant_id);
      if (!tenantRecord?.found) {
        throw new Error(`Tenant ${tenant_id} not found`);
      }

      // Extract role from assignee (format: "role:environment" e.g., "customer_service_manager:dev")
      const agentRole = assignee.split(':')[0];
      const agentProfile = await getAgentProfile({ tenant_id: tenantRecord.uuid, role: agentRole });
      
      logger.info(`[ExecuteTask] Using agent profile: ${agentProfile.display_name} (${agentProfile.model})`);

      // 2. Emit run_started
      emitRunStarted({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id: tenantRecord.uuid,
        agent_id: assignee,
        entrypoint: 'worker',
        input_summary: description
      });

      // 3. Build context for LLM
      let contextInfo = `Task: ${description}\n`;
      if (entity_type && entity_id) {
        contextInfo += `Entity Type: ${entity_type}\nEntity ID: ${entity_id}\n`;
        
        // Fetch entity details to provide context
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
              .eq('tenant_id', tenantRecord.uuid)
              .single();
            
            if (entityData) {
              contextInfo += `Entity Details: ${JSON.stringify(entityData, null, 2)}\n`;
            }
          }
        } catch (e) {
          logger.warn(`[ExecuteTask] Could not fetch entity details: ${e.message}`);
        }
      }

      // 4. Get LLM config for this agent
      const llmConfig = selectLLMConfigForTenant(tenantRecord.uuid, 'chat_tools');
      
      // 5. Generate tool schemas filtered to agent's allowlist
      const allToolSchemas = generateToolSchemas();
      const allowedTools = agentProfile.tool_allowlist.includes('*') 
        ? allToolSchemas 
        : allToolSchemas.filter(tool => agentProfile.tool_allowlist.includes(tool.function.name));

      // 6. Build system prompt with agent identity
      const systemPrompt = getBraidSystemPrompt(tenantRecord);
      const agentSystemPrompt = `${systemPrompt}

**Agent Identity:**
You are ${agentProfile.display_name}, a specialized AI agent with the following capabilities:
${agentProfile.metadata?.capabilities?.map(c => `- ${c}`).join('\n') || ''}

Your role is to: ${agentRole.replace(/_/g, ' ')}

**Current Task Context:**
${contextInfo}

**Instructions:**
Execute the task described above by using the appropriate tools available to you. Be thorough and professional.
If you need to create appointments or calendar events, use the create_activity tool.
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

      while (iterations < MAX_ITERATIONS) {
        iterations++;
        logger.debug(`[ExecuteTask] LLM iteration ${iterations}`);

        const completion = await generateChatCompletion(
          conversation,
          allowedTools,
          {
            ...llmConfig,
            model: agentProfile.model,
            temperature: agentProfile.temperature,
          }
        );

        const choice = completion?.choices?.[0];
        if (!choice) {
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
            tenant_id: tenantRecord.uuid,
            agent_id: assignee,
            tool_name: toolName,
            input_summary: JSON.stringify(toolArgs).slice(0, 200)
          });

          let toolResult;
          try {
            // Execute the Braid tool
            toolResult = await executeBraidTool(
              toolName,
              toolArgs,
              tenantRecord,
              null, // userEmail - agent is executor
              null  // accessToken - using system context
            );

            // Emit tool call finished (success)
            emitToolCallFinished({
              run_id,
              trace_id: run_id,
              span_id: randomUUID(),
              tenant_id: tenantRecord.uuid,
              agent_id: assignee,
              tool_name: toolName,
              status: 'success',
              output_summary: JSON.stringify(toolResult).slice(0, 200)
            });

            logger.info(`[ExecuteTask] Tool ${toolName} succeeded`);
          } catch (toolError) {
            logger.error(`[ExecuteTask] Tool ${toolName} failed:`, toolError);
            toolResult = { error: toolError.message };

            // Emit tool call finished (error)
            emitToolCallFinished({
              run_id,
              trace_id: run_id,
              span_id: randomUUID(),
              tenant_id: tenantRecord.uuid,
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
        tenant_id: tenantRecord.uuid,
        agent_id: assignee,
        status: 'success',
        output_summary: finalResponse.slice(0, 200)
      });

      emitTaskCompleted({
        run_id,
        trace_id: run_id,
        span_id: randomUUID(),
        tenant_id: tenantRecord.uuid,
        agent_id: assignee,
        task_id,
        summary: finalResponse.slice(0, 200)
      });

      // 9. Update Task with result
      await pgPool.query(
        `UPDATE tasks SET status = 'COMPLETED', result = $1, updated_at = NOW() WHERE id = $2`,
        [finalResponse, task_id]
      );

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
