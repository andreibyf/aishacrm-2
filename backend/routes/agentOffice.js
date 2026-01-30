/**
 * Agent Office Routes (non-breaking add-on)
 *
 * - GET /api/agent-office/roles - List all agent roles
 * - GET /api/agent-office/agents - List all agent profiles
 * - GET /api/agent-office/agents/:role - Get specific agent profile
 * - POST /api/agent-office/run
 *     Returns run_id + routed role with full agent identity.
 *     Emits telemetry NDJSON events with full correlation IDs.
 *
 * This is scaffolding for the "office workers" visualization.
 */

import express from 'express';
import { 
  createCorrelationContext,
  createChildSpan,
  emitRunStarted, 
  emitTaskAssigned, 
  emitAgentSpawned,
} from '../lib/telemetry/index.js';
import { routeRequest, listRoles } from '../lib/agents/agentRouter.js';
import { getAgentProfile, getAllAgentProfiles, AgentRoles } from '../lib/agents/agentRegistry.js';
import { taskQueue } from '../services/taskQueue.js';

export function createAgentOfficeRoutes(measuredPgPool) {
  void measuredPgPool;
  const router = express.Router();

  // List all role names
  router.get('/roles', (req, res) => {
    res.json({ roles: listRoles() });
  });

  // List all agent profiles
  router.get('/agents', async (req, res) => {
    const tenant_id = req.query?.tenant_id || null;
    const agents = await getAllAgentProfiles(tenant_id);
    res.json({ agents });
  });

  // Get specific agent profile
  router.get('/agents/:role', async (req, res) => {
    const { role } = req.params;
    const tenant_id = req.query?.tenant_id || null;
    
    if (!Object.values(AgentRoles).includes(role)) {
      return res.status(404).json({ error: 'Agent role not found', valid_roles: Object.values(AgentRoles) });
    }
    
    const agent = await getAgentProfile({ tenant_id, role });
    res.json({ agent });
  });

  router.post('/run', async (req, res) => {
    // Resolve tenant_id from header, body, or query (header takes precedence for consistency with other routes)
    const tenant_id = req.headers['x-tenant-id'] || req.body?.tenant_id || req.query?.tenant_id || null;
    const input = req.body?.input || req.body?.message || req.body?.task || '';
    const force_role = req.query?.force_role || req.body?.force_role || null;

    // Create correlation context for this run
    const ctx = createCorrelationContext();
    const primary_task_id = ctx.run_id; // Use plain UUID - no prefix

    // Get ops_manager agent (orchestrator)
    const opsAgent = await getAgentProfile({ tenant_id, role: AgentRoles.OPS_MANAGER });
    
    // Emit run_started from ops_manager (orchestrator)
    emitRunStarted({
      ...ctx,
      tenant_id,
      agent_id: opsAgent.id,
      entrypoint: 'api:/api/agent-office/run',
      input_summary: input?.slice(0, 200) || 'No input',
      force_role: force_role || null,
    });

    // Route to appropriate agent
    const routed = await routeRequest({ tenant_id, input, force_role });

    // Create child span for agent spawn
    const spawnCtx = createChildSpan(ctx);
    
    // Emit agent_spawned event
    emitAgentSpawned({
      ...spawnCtx,
      tenant_id,
      agent_id: routed.agent.id,
      agent_name: routed.agent.display_name,
      model: routed.agent.model,
      tools: routed.agent.tool_allowlist,
    });

    // Create child span for task assignment
    const taskCtx = createChildSpan(ctx);

    // Emit task_assigned to routed agent
    emitTaskAssigned({
      ...taskCtx,
      tenant_id,
      agent_id: opsAgent.id,
      task_id: primary_task_id,
      to_agent_id: routed.agent.id,
      queue: `${routed.agent.role}:primary`,
      reason: `Intent routing: matched ${routed.role}`,
    });

    // Actually enqueue the task for execution
    await taskQueue.add('execute-task', {
      task_id: primary_task_id,
      run_id: ctx.run_id,
      tenant_id,
      assignee: `${routed.agent.role}:${process.env.NODE_ENV || 'dev'}`,
      description: input,
      context: {
        source: 'agent-office',
        routed_from: 'ops_manager',
      }
    });

    console.log(`[AgentOffice] Task ${primary_task_id} enqueued for agent ${routed.agent.role}`);

    // Respond with routing decision and full agent identity
    res.json({
      ok: true,
      run_id: ctx.run_id,
      trace_id: ctx.trace_id,
      routed_role: routed.role,
      agent: {
        id: routed.agent.id,
        role: routed.agent.role,
        display_name: routed.agent.display_name,
        model: routed.agent.model,
        temperature: routed.agent.temperature,
        tool_allowlist: routed.agent.tool_allowlist,
        memory_namespace: routed.agent.memory_namespace,
        escalation_rules: routed.agent.escalation_rules,
        metadata: routed.agent.metadata,
      },
      next: {
        office_viz: process.env.OFFICE_VIZ_BASE_URL ? `${process.env.OFFICE_VIZ_BASE_URL}/runs/${ctx.run_id}` : null,
      },
    });
  });

  return router;
}
