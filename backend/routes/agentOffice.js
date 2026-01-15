/**
 * Agent Office Routes (non-breaking add-on)
 *
 * - GET /api/agent-office/roles - List all agent roles
 * - GET /api/agent-office/agents - List all agent profiles
 * - GET /api/agent-office/agents/:role - Get specific agent profile
 * - POST /api/agent-office/run
 *     Returns execution_id + routed role with full agent identity.
 *     Emits telemetry NDJSON events that sidecar can publish.
 *
 * This is scaffolding for the "office workers" visualization.
 */

import express from 'express';
import crypto from 'crypto';
import { emitRunStarted, emitTaskAssigned, emitAgentSpawned } from '../lib/telemetry/index.js';
import { routeRequest, listRoles } from '../lib/agents/agentRouter.js';
import { getAgentProfile, getAllAgentProfiles, AgentRoles } from '../lib/agents/agentRegistry.js';

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
    const tenant_id = req.body?.tenant_id || req.query?.tenant_id || null;
    const input = req.body?.input || req.body?.message || '';
    const force_role = req.query?.force_role || req.body?.force_role || null;

    const execution_id = crypto.randomUUID();
    const primary_task_id = `task:${execution_id}:primary`;

    // Emit run started from ops_manager (orchestrator)
    const opsAgent = await getAgentProfile({ tenant_id, role: AgentRoles.OPS_MANAGER });
    
    emitRunStarted({
      execution_id,
      agent_id: opsAgent.id,
      role: opsAgent.role,
      tenant_id,
      input_summary: input?.slice(0, 200),
      data: { 
        force_role: force_role || undefined,
        agent: {
          display_name: opsAgent.display_name,
          model: opsAgent.model,
        },
      },
    });

    // Route to appropriate agent
    const routed = await routeRequest({ tenant_id, input, force_role });

    // Emit agent spawned event
    emitAgentSpawned({
      execution_id,
      agent_id: routed.agent.id,
      role: routed.agent.role,
      tenant_id,
      data: {
        model: routed.agent.model,
        temperature: routed.agent.temperature,
        tool_allowlist: routed.agent.tool_allowlist,
        memory_namespace: routed.agent.memory_namespace,
        display_name: routed.agent.display_name,
        metadata: routed.agent.metadata,
      },
    });

    // Emit task assigned to routed agent
    emitTaskAssigned({
      execution_id,
      task_id: primary_task_id,
      agent_id: routed.agent.id,
      role: routed.agent.role,
      tenant_id,
      summary: `Routed to ${routed.agent.display_name}`,
      data: { 
        model: routed.agent.model,
        escalation_rules_count: routed.agent.escalation_rules?.length || 0,
      },
    });

    // MVP: respond with routing decision and full agent identity.
    // Next: enqueue to queue and return run id for streaming updates.
    res.json({
      ok: true,
      execution_id,
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
        office_viz: process.env.OFFICE_VIZ_BASE_URL ? `${process.env.OFFICE_VIZ_BASE_URL}/runs/${execution_id}` : null,
      },
    });
  });

  return router;
}
