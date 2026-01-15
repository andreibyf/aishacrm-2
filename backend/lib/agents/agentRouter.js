/**
 * Agent Router
 *
 * Single entrypoint routes requests to role agents.
 * Uses canonical agent roles from contracts.
 * Later: AiSHA LLM router outputs a task-plan graph + assignments.
 */

import { ROLES, AgentRoles, getAgentProfile } from './agentRegistry.js';

export function normalizeRole(role) {
  if (!role) return null;
  const r = String(role).trim().toLowerCase();
  const map = {
    ops: AgentRoles.OPS_MANAGER,
    aisha: AgentRoles.OPS_MANAGER,
    sales: AgentRoles.SALES_MANAGER,
    sdr: AgentRoles.SDR,
    pm: AgentRoles.PROJECT_MANAGER,
    marketing: AgentRoles.MARKETING_MANAGER,
    cs: AgentRoles.CUSTOMER_SERVICE_MANAGER,
    support: AgentRoles.CUSTOMER_SERVICE_MANAGER,
  };
  return map[r] || r;
}

export function listRoles() {
  return [...ROLES];
}

export async function routeRequest({ tenant_id, input, force_role }) {
  const role = normalizeRole(force_role) || ruleBasedRoute(input);
  const agent = await getAgentProfile({ tenant_id, role });
  return { role, agent };
}

function ruleBasedRoute(input) {
  const text = String(input || '').toLowerCase();
  if (/campaign|newsletter|broadcast|landing page|seo|ads|copy/.test(text)) return 'marketing_manager';
  if (/refund|complaint|issue|problem|support|ticket|cancel/.test(text)) return 'customer_service_manager';
  if (/schedule|deliver|project|milestone|timeline|kickoff/.test(text)) return 'project_manager';
  if (/prospect|cold|outreach|list build|enrich|find leads/.test(text)) return 'sdr';
  if (/deal|pipeline|close|proposal|quote|negotiate/.test(text)) return 'sales_manager';
  return 'ops_manager';
}
