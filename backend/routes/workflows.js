/**
 * Workflow Routes
 * CRUD operations for workflows and workflow executions
 */

import express from 'express';
import crypto from 'crypto';
import Redis from 'ioredis';
import workflowQueue from '../services/workflowQueue.js';
import { initiateOutboundCall } from '../lib/outboundCallService.js';
import { executeWorkflowById as executeWorkflowByIdService } from '../services/workflowExecutionService.js';
import logger from '../lib/logger.js';

// Redis client for idempotency checks
const redisCache = new Redis(process.env.REDIS_CACHE_URL || 'redis://redis-cache:6380');

// Re-export the service function for backwards compatibility
export { executeWorkflowByIdService as executeWorkflowById };

/**
 * Helper: Sync CARE workflow configuration
 * When a workflow has a CARE Start trigger, create/update care_workflow_config entry
 */
async function syncCareWorkflowConfig(pgPool, workflow, nodes) {
  if (!nodes || !Array.isArray(nodes)) return;

  // Find CARE trigger node
  const careTrigger = nodes.find(node => node.type === 'care_trigger');
  if (!careTrigger) {
    // No CARE trigger - delete any existing config
    await pgPool.query(
      'DELETE FROM care_workflow_config WHERE workflow_id = $1',
      [workflow.id]
    );
    return;
  }

  const careConfig = careTrigger.config || {};
  const tenantId = careConfig.tenant_id || workflow.tenant_id;

  // Upsert care_workflow_config entry
  const upsertQuery = `
    INSERT INTO care_workflow_config (
      tenant_id,
      workflow_id,
      name,
      description,
      is_enabled,
      shadow_mode,
      state_write_enabled,
      webhook_timeout_ms,
      webhook_max_retries
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      workflow_id = EXCLUDED.workflow_id,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_enabled = EXCLUDED.is_enabled,
      shadow_mode = EXCLUDED.shadow_mode,
      state_write_enabled = EXCLUDED.state_write_enabled,
      webhook_timeout_ms = EXCLUDED.webhook_timeout_ms,
      webhook_max_retries = EXCLUDED.webhook_max_retries,
      updated_at = NOW()
    RETURNING *
  `;

  const values = [
    tenantId,
    workflow.id,
    workflow.name,
    workflow.description || 'CARE workflow',
    careConfig.is_enabled !== false, // Default true unless explicitly false
    careConfig.shadow_mode !== false, // Default true (safe mode)
    careConfig.state_write_enabled === true, // Default false
    careConfig.webhook_timeout_ms || 3000,
    careConfig.webhook_max_retries || 2
  ];

  try {
    const result = await pgPool.query(upsertQuery, values);
    logger.info(`[CARE Config] Synced care_workflow_config for workflow ${workflow.id}:`, result.rows[0]);
  } catch (error) {
    logger.error(`[CARE Config] Failed to sync care_workflow_config:`, error);
    throw error;
  }
}

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

  console.log(`[normalizeWorkflow] Processing workflow "${row.name}" (id: ${row.id})`);
  console.log(`[normalizeWorkflow] Metadata has nodes: ${!!meta.nodes}, length: ${meta.nodes?.length || 0}`);
  console.log(`[normalizeWorkflow] Metadata has connections: ${!!meta.connections}, length: ${meta.connections?.length || 0}`);

  // Log if nodes are missing but expected (debugging)
  if ((!meta.nodes || meta.nodes.length === 0) && row.name) {
    logger.debug(`[normalizeWorkflow] Workflow "${row.name}" (id: ${row.id}) has no nodes in metadata. Raw metadata type: ${typeof row.metadata}`);
    logger.debug(`[normalizeWorkflow] Metadata value:`, JSON.stringify(row.metadata).substring(0, 200));
  } else {
    logger.debug(`[normalizeWorkflow] Workflow "${row.name}" (id: ${row.id}) has ${meta.nodes?.length || 0} nodes, ${meta.connections?.length || 0} connections`);
  }

  const normalized = {
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

  console.log(`[normalizeWorkflow] Returning workflow with ${normalized.nodes.length} nodes, ${normalized.connections.length} connections`);
  console.log(`[normalizeWorkflow] Returning connections:`, JSON.stringify(normalized.connections));

  return normalized;
}

export default function createWorkflowRoutes(pgPool) {
  const router = express.Router();
  /**
   * @openapi
   * /api/workflows:
   *   get:
   *     summary: List workflows
   *     tags: [workflows]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema: { type: string, nullable: true }
   *       - in: query
   *         name: is_active
   *         schema: { type: boolean, nullable: true }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0 }
   *     responses:
   *       200:
   *         description: Workflows list
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   post:
   *     summary: Create workflow
   *     tags: [workflows]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, name]
   *     responses:
   *       201:
   *         description: Workflow created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */

  // Exported executor used by queue processor and test endpoint
  async function executeWorkflowById(workflow_id, triggerPayload) {
    const startTime = Date.now();
    const executionLog = [];
    let executionId = null;
    try {
      if (!workflow_id) {
        throw new Error('workflow_id is required');
      }

      // Load workflow
      const wfRes = await pgPool.query('SELECT * FROM workflow WHERE id = $1', [workflow_id]);
      if (wfRes.rows.length === 0) {
        return { status: 'error', httpStatus: 404, data: { message: 'Workflow not found' } };
      }
      const workflow = normalizeWorkflow(wfRes.rows[0]);
      if (workflow.is_active === false) {
        return { status: 'error', httpStatus: 400, data: { message: 'Workflow is not active' } };
      }

      // Create execution record (running)
      const exRes = await pgPool.query(
        `INSERT INTO workflow_execution (workflow_id, tenant_id, status, trigger_data, execution_log, started_at, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *`,
        [workflow.id, workflow.tenant_id, 'running', JSON.stringify(triggerPayload ?? {}), JSON.stringify([])]
      );
      const execution = exRes.rows[0];
      executionId = execution.id;

      // Execution context
      const context = { payload: triggerPayload ?? {}, variables: {} };

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
          if (context.payload && context.payload[trimmed] !== undefined) return context.payload[trimmed];
          const parts = trimmed.split('.');
          if (parts.length > 1) {
            let value = context.variables[parts[0]];
            for (let i = 1; i < parts.length; i++) {
              if (value && value[parts[i]] !== undefined) value = value[parts[i]]; else { value = undefined; break; }
            }
            if (value !== undefined) return value;
          } else if (context.variables && context.variables[trimmed] !== undefined) {
            return context.variables[trimmed];
          }
          return match;
        });
      }

      // Node executors using Postgres
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

              // Build headers
              const headers = { 'Content-Type': 'application/json' };
              if (cfg.headers && Array.isArray(cfg.headers)) {
                for (const h of cfg.headers) {
                  if (h.key && h.value) {
                    headers[h.key] = replaceVariables(h.value);
                  }
                }
              }

              // Build body based on configuration
              let requestBody = null;
              if (method !== 'GET' && method !== 'HEAD') {
                if (cfg.body_type === 'raw') {
                  requestBody = replaceVariables(cfg.body || '{}');
                  // Try to parse as JSON if it looks like JSON
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
                      // Don't include unresolved template variables
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

                // Mark as error if HTTP status >= 400
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

              const lead = context.variables.found_lead;
              const contact = context.variables.found_contact;
              const related_to = lead ? 'lead' : (contact ? 'contact' : null);
              const related_id = lead ? lead.id : (contact ? contact.id : null);

              const emailMeta = {
                created_by_workflow: workflow.id,
                email: {
                  to: toValue,
                  subject,
                  cc: cfg.cc ? replaceVariables(cfg.cc) : undefined,
                  bcc: cfg.bcc ? replaceVariables(cfg.bcc) : undefined,
                  from: cfg.from ? replaceVariables(cfg.from) : undefined
                }
              };

              const q = `
                INSERT INTO activities (
                  tenant_id, type, subject, body, status, related_id,
                  created_by, location, priority, due_date, due_time,
                  assigned_to, related_to, metadata, created_date, updated_date
                ) VALUES (
                  $1, $2, $3, $4, $5, $6,
                  NULL, NULL, NULL, NULL, NULL,
                  NULL, $7, $8, NOW(), NOW()
                ) RETURNING *
              `;
              const vals = [
                workflow.tenant_id,
                'email',
                subject || null,
                body || null,
                'queued',
                related_id,
                related_to,
                JSON.stringify(emailMeta)
              ];
              const r = await pgPool.query(q, vals);
              log.output = { email_queued: true, to: toValue, subject, activity_id: r.rows[0]?.id };
              break;
            }
            case 'find_lead': {
              const field = cfg.search_field || 'email';
              let value = replaceVariables(cfg.search_value || '{{email}}');
              if (typeof value === 'string') value = value.replace(/^["']|["']$/g, '').trim();
              const q = `SELECT * FROM leads WHERE tenant_id = $1 AND ${field} = $2 LIMIT 1`;
              const r = await pgPool.query(q, [workflow.tenant_id, value]);
              if (r.rows.length) {
                log.output = { lead: r.rows[0] };
                context.variables.found_lead = r.rows[0];
              } else {
                log.status = 'error';
                log.error = `No lead found with ${field} = ${value}`;
              }
              break;
            }
            case 'create_lead': {
              const mappings = cfg.field_mappings || [];
              if (!mappings.length) { log.status = 'error'; log.error = 'No field mappings configured'; break; }
              const cols = ['tenant_id', 'created_at', 'created_date'];
              const vals = [workflow.tenant_id];
              const ph = ['$1'];
              let idx = 2;
              // Add timestamp values
              vals.push(new Date().toISOString());
              ph.push(`$${idx++}`);
              vals.push(new Date().toISOString());
              ph.push(`$${idx++}`);
              for (const m of mappings) {
                if (m.lead_field && m.webhook_field) {
                  const v = replaceVariables(`{{${m.webhook_field}}}`);
                  if (v !== null && v !== undefined && v !== '') { cols.push(m.lead_field); vals.push(v); ph.push(`$${idx++}`); }
                }
              }
              const q = `INSERT INTO leads (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING *`;
              const r = await pgPool.query(q, vals);
              log.output = { lead: r.rows[0] };
              context.variables.found_lead = r.rows[0];
              break;
            }
            case 'update_lead': {
              const lead = context.variables.found_lead;
              if (!lead) { log.status = 'error'; log.error = 'No lead found in context'; break; }
              const mappings = cfg.field_mappings || [];
              const sets = [];
              const vals = [];
              let idx = 1;
              for (const m of mappings) {
                if (m.lead_field && m.webhook_field) {
                  const v = replaceVariables(`{{${m.webhook_field}}}`);
                  if (v !== `{{${m.webhook_field}}}` && v !== null && v !== undefined) { sets.push(`${m.lead_field} = $${idx++}`); vals.push(v); }
                }
              }
              if (!sets.length) { log.status = 'error'; log.error = 'No field mappings configured or no values to update'; break; }
              vals.push(lead.id);
              const q = `UPDATE leads SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
              const r = await pgPool.query(q, vals);
              log.output = { updatedLead: r.rows[0], applied_updates: Object.fromEntries(sets.map((s, i) => [s.split('=')[0].trim(), vals[i]])) };
              break;
            }
            case 'find_contact': {
              const field = cfg.search_field || 'email';
              let value = replaceVariables(cfg.search_value || '{{email}}');
              if (typeof value === 'string') value = value.replace(/^["']|["']$/g, '').trim();
              const q = `SELECT * FROM contacts WHERE tenant_id = $1 AND ${field} = $2 LIMIT 1`;
              const r = await pgPool.query(q, [workflow.tenant_id, value]);
              if (r.rows.length) {
                log.output = { contact: r.rows[0] };
                context.variables.found_contact = r.rows[0];
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
              const sets = [];
              const vals = [];
              let idx = 1;
              for (const m of mappings) {
                if (m.contact_field && m.webhook_field) {
                  const v = replaceVariables(`{{${m.webhook_field}}}`);
                  if (v !== `{{${m.webhook_field}}}` && v !== null && v !== undefined) { sets.push(`${m.contact_field} = $${idx++}`); vals.push(v); }
                }
              }
              if (!sets.length) { log.status = 'error'; log.error = 'No field mappings configured'; break; }
              vals.push(contact.id);
              const q = `UPDATE contacts SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
              const r = await pgPool.query(q, vals);
              log.output = { updatedContact: r.rows[0], applied_updates: Object.fromEntries(sets.map((s, i) => [s.split('=')[0].trim(), vals[i]])) };
              break;
            }
            case 'find_account': {
              const field = cfg.search_field || 'company';
              let value = replaceVariables(cfg.search_value || '{{company}}');
              if (typeof value === 'string') value = value.replace(/^["']|["']$/g, '').trim();
              const q = `SELECT * FROM accounts WHERE tenant_id = $1 AND ${field} = $2 LIMIT 1`;
              const r = await pgPool.query(q, [workflow.tenant_id, value]);
              if (r.rows.length) {
                log.output = { account: r.rows[0] };
                context.variables.found_account = r.rows[0];
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
              const sets = [];
              const vals = [];
              let idx = 1;
              for (const m of mappings) {
                if (m.account_field && m.webhook_field) {
                  const v = replaceVariables(`{{${m.webhook_field}}}`);
                  if (v !== `{{${m.webhook_field}}}` && v !== null && v !== undefined) { sets.push(`${m.account_field} = $${idx++}`); vals.push(v); }
                }
              }
              if (!sets.length) { log.status = 'error'; log.error = 'No field mappings configured or no values to update'; break; }
              vals.push(account.id);
              const q = `UPDATE accounts SET ${sets.join(', ')}, updated_date = NOW() WHERE id = $${idx} RETURNING *`;
              const r = await pgPool.query(q, vals);
              log.output = { updatedAccount: r.rows[0], applied_updates: Object.fromEntries(sets.map((s, i) => [s.split('=')[0].trim(), vals[i]])) };
              break;
            }
            case 'create_opportunity': {
              const mappings = cfg.field_mappings || [];
              if (!mappings.length) { log.status = 'error'; log.error = 'No field mappings configured'; break; }
              const cols = ['tenant_id'];
              const vals = [workflow.tenant_id];
              const ph = ['$1'];
              let idx = 2;
              for (const m of mappings) {
                if (m.opportunity_field && m.webhook_field) {
                  const v = replaceVariables(`{{${m.webhook_field}}}`);
                  if (v !== null && v !== undefined && v !== '') { cols.push(m.opportunity_field); vals.push(v); ph.push(`$${idx++}`); }
                }
              }
              // Try to associate to an account or lead if present
              const account = context.variables.found_account;
              const lead = context.variables.found_lead;
              if (account) { cols.push('account_id'); vals.push(account.id); ph.push(`$${idx++}`); }
              if (lead) { cols.push('lead_id'); vals.push(lead.id); ph.push(`$${idx++}`); }
              const q = `INSERT INTO opportunities (${cols.join(',')}) VALUES (${ph.join(',')}) RETURNING *`;
              const r = await pgPool.query(q, vals);
              log.output = { opportunity: r.rows[0] };
              context.variables.found_opportunity = r.rows[0];
              break;
            }
            case 'update_opportunity': {
              const opportunity = context.variables.found_opportunity;
              if (!opportunity) { log.status = 'error'; log.error = 'No opportunity found in context'; break; }
              const mappings = cfg.field_mappings || [];
              const sets = [];
              const vals = [];
              let idx = 1;
              for (const m of mappings) {
                if (m.opportunity_field && m.webhook_field) {
                  const v = replaceVariables(`{{${m.webhook_field}}}`);
                  if (v !== `{{${m.webhook_field}}}` && v !== null && v !== undefined) { sets.push(`${m.opportunity_field} = $${idx++}`); vals.push(v); }
                }
              }
              if (!sets.length) { log.status = 'error'; log.error = 'No field mappings configured'; break; }
              vals.push(opportunity.id);
              const q = `UPDATE opportunities SET ${sets.join(', ')}, updated_date = NOW() WHERE id = $${idx} RETURNING *`;
              const r = await pgPool.query(q, vals);
              log.output = { updatedOpportunity: r.rows[0], applied_updates: Object.fromEntries(sets.map((s, i) => [s.split('=')[0].trim(), vals[i]])) };
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
              const metadata = { created_by_workflow: workflow.id };
              const q = `
                INSERT INTO activities (
                  tenant_id, type, subject, body, status, related_id,
                  created_by, location, priority, due_date, due_time,
                  assigned_to, related_to, metadata, created_date, updated_date
                ) VALUES (
                  $1, $2, $3, $4, $5, $6,
                  NULL, NULL, NULL, NULL, NULL,
                  NULL, $7, $8, NOW(), NOW()
                ) RETURNING *
              `;
              const vals = [
                workflow.tenant_id,
                activityType,
                subject || null,
                description || null,
                'scheduled',
                related_id,
                related_to,
                JSON.stringify(metadata)
              ];
              const r = await pgPool.query(q, vals);
              log.output = { activity: r.rows[0] };
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
            // AI nodes via MCP-first, provider stubs
            case 'ai_classify_opportunity_stage': {
              const provider = (cfg.provider || 'mcp').toLowerCase();
              const _model = cfg.model || 'default';
              const text = String(replaceVariables(cfg.text || ''));
              let output = { stage: 'unknown', confidence: 0.0, provider };
              try {
                if (provider === 'mcp') {
                  // Placeholder: call MCP classification tool via internal adapter
                  // For now, use simple heuristics
                  const t = text.toLowerCase();
                  if (t.includes('closed won') || t.includes('signed')) output = { stage: 'Closed Won', confidence: 0.9, provider };
                  else if (t.includes('negotiation') || t.includes('proposal')) output = { stage: 'Negotiation', confidence: 0.7, provider };
                  else if (t.includes('qualified') || t.includes('meeting')) output = { stage: 'Qualified', confidence: 0.6, provider };
                  else if (t.includes('discovery') || t.includes('intro')) output = { stage: 'Discovery', confidence: 0.5, provider };
                } else {
                  // stubs for openai/anthropic/google
                  output = { stage: 'Qualified', confidence: 0.5, provider };
                }
                log.output = { ai_stage: output };
                context.variables.ai_stage = output;
              } catch (e) {
                log.status = 'error';
                log.error = `AI classify failed: ${e.message}`;
              }
              break;
            }
            case 'ai_generate_email': {
              const provider = (cfg.provider || 'mcp').toLowerCase();
              const prompt = String(replaceVariables(cfg.prompt || ''));
              let email = { subject: 'Hello', body: '...', provider };
              try {
                if (provider === 'mcp') {
                  // Placeholder generation
                  email = {
                    subject: 'Follow-up on our conversation',
                    body: `Hi there,\n\n${prompt}\n\nBest regards,\nAisha CRM`,
                    provider
                  };
                } else {
                  email = { subject: 'Follow-up', body: prompt || 'Draft body', provider };
                }
                log.output = { ai_email: email };
                context.variables.ai_email = email;
              } catch (e) {
                log.status = 'error';
                log.error = `AI email generation failed: ${e.message}`;
              }
              break;
            }
            case 'ai_enrich_account': {
              const provider = (cfg.provider || 'mcp').toLowerCase();
              const input = String(replaceVariables(cfg.input || ''));
              let enrichment = { company: input || null, website: null, industry: null, size: null, provider };
              try {
                if (provider === 'mcp') {
                  enrichment.website = input && input.includes('.') ? `https://${input}` : null;
                  enrichment.industry = 'Software';
                  enrichment.size = '51-200';
                } else {
                  enrichment.industry = 'Unknown';
                }
                log.output = { ai_enrichment: enrichment };
                context.variables.ai_enrichment = enrichment;
              } catch (e) {
                log.status = 'error';
                log.error = `AI enrichment failed: ${e.message}`;
              }
              break;
            }
            case 'ai_route_activity': {
              const provider = (cfg.provider || 'mcp').toLowerCase();
              const contextText = String(replaceVariables(cfg.context || ''));
              let route = { type: 'task', title: 'Next best action', details: contextText, priority: 'medium', provider };
              try {
                if (provider === 'mcp') {
                  const t = contextText.toLowerCase();
                  if (t.includes('call')) route = { ...route, type: 'call', title: 'Call the contact', priority: 'high' };
                  else if (t.includes('email')) route = { ...route, type: 'email', title: 'Send an email', priority: 'medium' };
                  else if (t.includes('meeting')) route = { ...route, type: 'task', title: 'Schedule a meeting', priority: 'high' };
                }
                log.output = { ai_route: route };
                context.variables.ai_route = route;
              } catch (e) {
                log.status = 'error';
                log.error = `AI routing failed: ${e.message}`;
              }
              break;
            }
            case 'initiate_call': {
              // Initiate outbound AI call via CallFluent or Thoughtly
              const provider = cfg.provider || 'callfluent';
              let phoneNumber = replaceVariables(cfg.phone_number || '{{phone}}');
              const purpose = replaceVariables(cfg.purpose || 'Follow-up call');
              const talkingPointsRaw = cfg.talking_points || [];
              const talkingPoints = talkingPointsRaw.map(tp => replaceVariables(tp));

              // Get contact info from context
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
            case 'wait': {
              // Wait/Delay node - pause execution for specified duration
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

              // Actually wait
              await new Promise(resolve => setTimeout(resolve, Math.min(delayMs, maxDelay)));

              break;
            }
            case 'send_sms': {
              // Send SMS node - requires SMS provider integration (Twilio, AWS SNS, etc.)
              const toRaw = cfg.to || '{{phone}}';
              const messageRaw = cfg.message || '';

              const toValue = String(replaceVariables(toRaw)).replace(/^['"']|['"']$/g, '').trim();
              const message = String(replaceVariables(messageRaw));

              // Validate phone number format
              if (!toValue || toValue === '{{phone}}') {
                log.status = 'error';
                log.error = 'No phone number provided';
                break;
              }

              // For now, log SMS as an activity (queued for external processing)
              const lead = context.variables.found_lead;
              const contact = context.variables.found_contact;
              const related_to = lead ? 'lead' : (contact ? 'contact' : null);
              const related_id = lead ? lead.id : (contact ? contact.id : null);

              const smsMeta = {
                created_by_workflow: workflow.id,
                sms: {
                  to: toValue,
                  message: message.substring(0, 160) // SMS limit
                },
                provider: cfg.provider || 'twilio'
              };

              const q = `
                INSERT INTO activities (
                  tenant_id, type, subject, body, status, related_id,
                  created_by, location, priority, due_date, due_time,
                  assigned_to, related_to, metadata, created_date, updated_date
                ) VALUES (
                  $1, $2, $3, $4, $5, $6,
                  NULL, NULL, NULL, NULL, NULL,
                  NULL, $7, $8, NOW(), NOW()
                ) RETURNING *
              `;
              const vals = [
                workflow.tenant_id,
                'sms',
                'SMS: ' + message.substring(0, 50),
                message,
                'queued',
                related_id,
                related_to,
                JSON.stringify(smsMeta)
              ];
              const r = await pgPool.query(q, vals);
              log.output = { sms_queued: true, to: toValue, message_length: message.length, activity_id: r.rows[0]?.id };
              break;
            }
            case 'assign_record': {
              // Assign Record node - assign leads/contacts/opportunities to users
              const method = cfg.method || 'specific_user';
              const lead = context.variables.found_lead;
              const contact = context.variables.found_contact;
              const opportunity = context.variables.found_opportunity;
              const account = context.variables.found_account;

              let targetRecord = null;
              let targetTable = null;

              // Determine which record to assign
              if (lead) { targetRecord = lead; targetTable = 'leads'; }
              else if (contact) { targetRecord = contact; targetTable = 'contacts'; }
              else if (opportunity) { targetRecord = opportunity; targetTable = 'opportunities'; }
              else if (account) { targetRecord = account; targetTable = 'accounts'; }

              if (!targetRecord || !targetTable) {
                log.status = 'error';
                log.error = 'No record found in context to assign';
                break;
              }

              let assigneeId = null;

              switch (method) {
                case 'specific_user':
                  assigneeId = replaceVariables(cfg.user_id || '');
                  break;

                case 'round_robin': {
                  // Round-robin assignment - get next user in rotation
                  const group = cfg.group || 'sales_team';

                  // Get all users in tenant (or group if we had that feature)
                  const usersRes = await pgPool.query(
                    'SELECT id FROM employees WHERE tenant_id = $1 AND status = $2 ORDER BY id',
                    [workflow.tenant_id, 'active']
                  );

                  if (usersRes.rows.length === 0) {
                    log.status = 'error';
                    log.error = 'No active users found for round-robin assignment';
                    break;
                  }

                  // Get assignment counter from workflow metadata
                  const currentMeta = workflow.metadata || {};
                  const assignmentCounters = currentMeta.assignment_counters || {};
                  const currentIndex = (assignmentCounters[group] || 0) % usersRes.rows.length;

                  assigneeId = usersRes.rows[currentIndex].id;

                  // Update counter
                  assignmentCounters[group] = currentIndex + 1;
                  await pgPool.query(
                    'UPDATE workflow SET metadata = metadata || $1 WHERE id = $2',
                    [JSON.stringify({ assignment_counters: assignmentCounters }), workflow.id]
                  );

                  log.output.round_robin_index = currentIndex;
                  break;
                }

                case 'least_assigned': {
                  // Assign to user with fewest assigned records of this type
                  const countQuery = `
                    SELECT assigned_to, COUNT(*) as count 
                    FROM ${targetTable} 
                    WHERE tenant_id = $1 AND assigned_to IS NOT NULL
                    GROUP BY assigned_to 
                    ORDER BY count ASC 
                    LIMIT 1
                  `;
                  const countRes = await pgPool.query(countQuery, [workflow.tenant_id]);

                  if (countRes.rows.length > 0) {
                    assigneeId = countRes.rows[0].assigned_to;
                  } else {
                    // No assignments yet, get first user
                    const firstUserRes = await pgPool.query(
                      'SELECT id FROM employees WHERE tenant_id = $1 AND status = $2 LIMIT 1',
                      [workflow.tenant_id, 'active']
                    );
                    if (firstUserRes.rows.length > 0) {
                      assigneeId = firstUserRes.rows[0].id;
                    }
                  }
                  break;
                }

                case 'record_owner':
                  // Keep current owner (no change)
                  assigneeId = targetRecord.assigned_to || targetRecord.owner_id;
                  break;
              }

              if (!assigneeId) {
                log.status = 'error';
                log.error = `Could not determine assignee for method: ${method}`;
                break;
              }

              // Update the record
              const updateQuery = `
                UPDATE ${targetTable} 
                SET assigned_to = $1, updated_at = NOW() 
                WHERE id = $2 
                RETURNING *
              `;
              const updateRes = await pgPool.query(updateQuery, [assigneeId, targetRecord.id]);

              log.output = {
                assignment_method: method,
                assigned_to: assigneeId,
                record_type: targetTable,
                record_id: targetRecord.id,
                updated_record: updateRes.rows[0]
              };

              // Update context
              if (lead) context.variables.found_lead = updateRes.rows[0];
              else if (contact) context.variables.found_contact = updateRes.rows[0];
              else if (opportunity) context.variables.found_opportunity = updateRes.rows[0];
              else if (account) context.variables.found_account = updateRes.rows[0];

              break;
            }
            case 'update_status': {
              // Update Status node - change record status/stage
              const recordType = cfg.record_type || 'lead';
              const newStatus = replaceVariables(cfg.new_status || '');

              if (!newStatus) {
                log.status = 'error';
                log.error = 'New status value is required';
                break;
              }

              const lead = context.variables.found_lead;
              const contact = context.variables.found_contact;
              const opportunity = context.variables.found_opportunity;
              const account = context.variables.found_account;

              let targetRecord = null;
              switch (recordType) {
                case 'lead':
                  targetRecord = lead;
                  break;
                case 'contact':
                  targetRecord = contact;
                  break;
                case 'opportunity':
                  targetRecord = opportunity;
                  break;
                case 'account':
                  targetRecord = account;
                  break;
              }

              if (!targetRecord) {
                log.status = 'error';
                log.error = `No ${recordType} found in context`;
                break;
              }

              // Determine which column to update (different tables use different column names)
              let statusColumn = 'status';
              if (recordType === 'opportunity') {
                statusColumn = 'stage'; // Opportunities use 'stage' instead of 'status'
              }

              const updateQuery = `
                UPDATE ${recordType}s 
                SET ${statusColumn} = $1, updated_at = NOW() 
                WHERE id = $2 
                RETURNING *
              `;

              const updateRes = await pgPool.query(updateQuery, [newStatus, targetRecord.id]);

              log.output = {
                record_type: recordType,
                record_id: targetRecord.id,
                old_status: targetRecord[statusColumn],
                new_status: newStatus,
                updated_record: updateRes.rows[0]
              };

              // Update context
              if (recordType === 'lead') context.variables.found_lead = updateRes.rows[0];
              else if (recordType === 'contact') context.variables.found_contact = updateRes.rows[0];
              else if (recordType === 'opportunity') context.variables.found_opportunity = updateRes.rows[0];
              else if (recordType === 'account') context.variables.found_account = updateRes.rows[0];

              break;
            }
            default:
              log.status = 'error';
              log.error = `Unknown node type: ${node.type}`;
          }
        } catch (err) {
          log.status = 'error';
          log.error = err.message;
        }
        return log;
      }

      // Execute workflow graph
      let current = (workflow.nodes || []).find(n => n.type === 'webhook_trigger') || (workflow.nodes || [])[0];
      if (!current) {
        throw new Error('Workflow has no nodes');
      }
      const visited = new Set();
      while (current) {
        if (visited.has(current.id)) { executionLog.push({ node_id: current.id, node_type: current.type, timestamp: new Date().toISOString(), status: 'error', error: 'Detected loop' }); break; }
        visited.add(current.id);
        const log = await execNode(current);
        executionLog.push(log);
        if (log.status === 'error' && current.type !== 'condition') break;
        current = getNextNode(current.id);
      }

      const finalStatus = executionLog.some(l => l.status === 'error') ? 'failed' : 'success';
      const duration = Date.now() - startTime;

      // Update execution record
      await pgPool.query(
        `UPDATE workflow_execution SET status = $1, execution_log = $2, completed_at = NOW() WHERE id = $3`,
        [finalStatus, JSON.stringify(executionLog), execution.id]
      );

      // Bump workflow metadata counters
      const currMetaRes = await pgPool.query('SELECT metadata FROM workflow WHERE id = $1', [workflow.id]);
      const meta = currMetaRes.rows[0]?.metadata && typeof currMetaRes.rows[0].metadata === 'object' ? currMetaRes.rows[0].metadata : {};
      const nextCount = (meta.execution_count || 0) + 1;
      const newMeta = { ...meta, execution_count: nextCount, last_executed: new Date().toISOString() };
      await pgPool.query('UPDATE workflow SET metadata = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(newMeta), workflow.id]);

      return { status: finalStatus, httpStatus: 200, data: { execution_id: execution.id, execution_log: executionLog, duration_ms: duration } };
    } catch (error) {
      // Try to mark execution as failed if we created one
      if (executionId) {
        try {
          await pgPool.query(
            `UPDATE workflow_execution SET status = 'failed', execution_log = $1, completed_at = NOW() WHERE id = $2`,
            [JSON.stringify(executionLog), executionId]
          );
        } catch {
          // ignore secondary failure
        }
      }
      return { status: 'error', httpStatus: 500, data: { message: error.message, execution_log: executionLog } };
    }
  }

  // GET /api/workflows - List workflows
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0, is_active } = req.query;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      let query = 'SELECT * FROM workflow WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (tenant_id) {
        query += ` AND tenant_id = $${paramCount}`;
        params.push(tenant_id);
        paramCount++;
      }

      if (is_active !== undefined) {
        query += ` AND is_active = $${paramCount}`;
        params.push(is_active === 'true');
        paramCount++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM workflow WHERE 1=1';
      const countParams = [];
      let countParamCount = 1;

      if (tenant_id) {
        countQuery += ` AND tenant_id = $${countParamCount}`;
        countParams.push(tenant_id);
        countParamCount++;
      }

      if (is_active !== undefined) {
        countQuery += ` AND is_active = $${countParamCount}`;
        countParams.push(is_active === 'true');
      }

      const countResult = await pgPool.query(countQuery, countParams);

      res.json({
        status: 'success',
        data: {
          workflows: result.rows.map(normalizeWorkflow),
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      logger.error('Error fetching workflows:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/workflows - Create new workflow
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, description, trigger, nodes, connections, is_active } = req.body;

      logger.debug('[Workflows POST] Received nodes:', nodes);
      logger.debug('[Workflows POST] Received connections:', connections);

      if (!tenant_id || !name) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id and name are required' 
        });
      }

      // Build metadata object containing nodes and connections
      const metadata = {
        nodes: nodes || [],
        connections: connections || [],
        webhook_url: null, // Will be set after creation
        execution_count: 0,
        last_executed: null
      };

      logger.debug('[Workflows POST] Metadata to store:', metadata);

      // Extract trigger type and config
      const trigger_type = trigger?.type || 'webhook';
      const trigger_config = trigger?.config || {};

      const query = `
        INSERT INTO workflow (tenant_id, name, description, trigger_type, trigger_config, is_active, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        tenant_id,
        name,
        description || null,
        trigger_type,
        trigger_config,
        is_active !== undefined ? is_active : true,
        metadata
      ];

      const result = await pgPool.query(query, values);
      const workflow = normalizeWorkflow(result.rows[0]);

      // Update webhook URL in metadata now that we have the ID
      if (trigger_type === 'webhook') {
        const webhookUrl = `/api/workflows/${workflow.id}/webhook`;
        await pgPool.query(
          `UPDATE workflow SET metadata = metadata || $1 WHERE id = $2`,
          [JSON.stringify({ webhook_url: webhookUrl }), workflow.id]
        );
        workflow.webhook_url = webhookUrl;
      }

      // Sync CARE workflow configuration if this workflow has a CARE trigger
      await syncCareWorkflowConfig(pgPool, workflow, nodes);

      res.status(201).json({
        status: 'success',
        data: workflow
      });
    } catch (error) {
      logger.error('Error creating workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/workflows/:id - Update existing workflow
  /**
   * @openapi
   * /api/workflows/{id}:
   *   put:
   *     summary: Update workflow
   *     tags: [workflows]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Workflow updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *   delete:
   *     summary: Delete workflow
   *     tags: [workflows]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Workflow deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, name, description, trigger, nodes, connections, is_active } = req.body;

      console.log('[Workflows PUT] Received nodes:', nodes ? `Array(${nodes.length})` : 'undefined', JSON.stringify(nodes || []).substring(0, 300));
      console.log('[Workflows PUT] Received connections:', connections ? `Array(${connections.length})` : 'undefined', JSON.stringify(connections || []));

      if (!tenant_id) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id is required' 
        });
      }

      // Verify workflow exists and belongs to tenant
      const checkResult = await pgPool.query(
        'SELECT * FROM workflow WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Workflow not found or access denied' 
        });
      }

      const existingWorkflow = checkResult.rows[0];
      let existingMetadata = existingWorkflow.metadata || {};

      logger.debug('[Workflows PUT] Existing metadata type:', typeof existingMetadata);
      logger.debug('[Workflows PUT] Existing metadata value:', JSON.stringify(existingMetadata));

      // Handle stringified JSON in database
      if (typeof existingMetadata === 'string') {
        try {
          existingMetadata = JSON.parse(existingMetadata);
        } catch (e) {
          logger.warn('[Workflows PUT] Failed to parse existing metadata:', e);
          existingMetadata = {};
        }
      }

      logger.debug('[Workflows PUT] Parsed existing metadata:', existingMetadata);
      logger.debug('[Workflows PUT] Incoming nodes:', nodes ? `Array(${nodes.length})` : 'undefined');
      logger.debug('[Workflows PUT] Incoming connections:', connections ? `Array(${connections.length})` : 'undefined');

      // Build updated metadata - use explicit property assignment to avoid TDZ issues
      const updatedNodes = nodes !== undefined ? nodes : (existingMetadata.nodes || []);
      const updatedConnections = connections !== undefined ? connections : (existingMetadata.connections || []);

      console.log('[Workflows PUT] Updated nodes:', updatedNodes ? `Array(${updatedNodes.length})` : 'undefined');
      console.log('[Workflows PUT] Updated connections:', updatedConnections ? `Array(${updatedConnections.length})` : 'undefined');

      const metadata = {
        ...existingMetadata,
        nodes: updatedNodes,
        connections: updatedConnections
      };

      console.log('[Workflows PUT] Final merged metadata nodes:', metadata.nodes?.length, 'connections:', metadata.connections?.length);
      console.log('[Workflows PUT] Metadata connections:', JSON.stringify(metadata.connections));

      logger.debug('[Workflows PUT] Metadata to store:', metadata);

      // Extract trigger type and config if provided
      const trigger_type = trigger?.type || existingWorkflow.trigger_type;
      const trigger_config = trigger?.config || existingWorkflow.trigger_config;

      const query = `
        UPDATE workflow 
        SET name = $1, 
            description = $2, 
            trigger_type = $3, 
            trigger_config = $4, 
            is_active = $5, 
            metadata = $6,
            updated_at = NOW()
        WHERE id = $7 AND tenant_id = $8
        RETURNING *
      `;

      const values = [
        name !== undefined ? name : existingWorkflow.name,
        description !== undefined ? description : existingWorkflow.description,
        trigger_type,
        trigger_config,
        is_active !== undefined ? is_active : existingWorkflow.is_active,
        metadata,
        id,
        tenant_id
      ];

      const result = await pgPool.query(query, values);
      const workflow = normalizeWorkflow(result.rows[0]);

      // Sync CARE workflow configuration if this workflow has a CARE trigger
      await syncCareWorkflowConfig(pgPool, workflow, updatedNodes);

      console.log('[Workflows PUT] Returning workflow nodes:', workflow.nodes?.length, 'connections:', workflow.connections?.length);
      console.log('[Workflows PUT] Returning connections:', JSON.stringify(workflow.connections));

      res.json({
        status: 'success',
        data: workflow
      });
    } catch (error) {
      logger.error('Error updating workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/workflows/:id - Delete workflow
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id is required' 
        });
      }

      const result = await pgPool.query(
        'DELETE FROM workflow WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [id, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Workflow not found or access denied' 
        });
      }

      res.json({
        status: 'success',
        data: { id: result.rows[0].id, deleted: true }
      });
    } catch (error) {
      logger.error('Error deleting workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PATCH /api/workflows/:id/status - Toggle workflow active status
  /**
   * @openapi
   * /api/workflows/{id}/status:
   *   patch:
   *     summary: Toggle workflow active status
   *     tags: [workflows]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, is_active]
   *             properties:
   *               tenant_id: { type: string }
   *               is_active: { type: boolean }
   *     responses:
   *       200:
   *         description: Workflow status updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.patch('/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, is_active } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id is required' 
        });
      }

      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ 
          status: 'error', 
          message: 'is_active must be a boolean' 
        });
      }

      const result = await pgPool.query(
        `UPDATE workflow 
         SET is_active = $1, updated_at = NOW() 
         WHERE id = $2 AND tenant_id = $3 
         RETURNING id, name, is_active`,
        [is_active, id, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          status: 'error', 
          message: 'Workflow not found or access denied' 
        });
      }

      res.json({
        status: 'success',
        message: `Workflow ${is_active ? 'activated' : 'deactivated'}`,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Error updating workflow status:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Execute workflow by ID (no internal HTTP)
  /**
   * @openapi
   * /api/workflows/execute:
   *   post:
   *     summary: Execute workflow by ID
   *     tags: [workflows]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               workflow_id: { type: string }
   *               payload: { type: object }
   *     responses:
   *       200:
   *         description: Execution result
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.post('/execute', async (req, res) => {
    try {
      const { workflow_id, payload, input_data } = req.body || {};
      const triggerPayload = payload ?? input_data ?? {};

      if (!workflow_id) {
        return res.status(400).json({ status: 'error', message: 'workflow_id is required' });
      }

      // Queue the workflow for async execution
      const job = await workflowQueue.add({
        workflow_id,
        trigger_data: triggerPayload
      });

      // Return immediately with 202 Accepted
      return res.status(202).json({
        status: 'queued',
        data: {
          job_id: job.id,
          workflow_id,
          message: 'Workflow queued for execution',
          check_status_at: `/api/workflows/executions?workflow_id=${workflow_id}`
        }
      });
    } catch (error) {
      logger.error('[Workflow Execute] Error queuing workflow:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/workflows/:id/webhook - Webhook endpoint to trigger workflow execution
  /**
   * @openapi
   * /api/workflows/{id}/webhook:
   *   post:
   *     summary: Trigger workflow execution via webhook
   *     tags: [workflows]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               payload: { type: object }
   *     responses:
   *       200:
   *         description: Execution result
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  router.post('/:id/webhook', async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body?.payload ?? req.body ?? {};
      
      // === BLOCKLIST FOR DELETED/PROBLEMATIC WORKFLOWS ===
      const BLOCKED_WORKFLOW_IDS = [
        'ad38e6cf-1454-48ac-a80d-0cfc79c5aa94' // C.A.R.E. Workflow Test (old deleted ID) - keep blocked permanently
      ];
      
      if (BLOCKED_WORKFLOW_IDS.includes(id)) {
        logger.warn(`[Webhook] Blocked webhook call to deleted/old workflow ${id}`);
        return res.status(410).json({ 
          status: 'error', 
          message: 'Workflow has been deleted or replaced',
          hint: 'Remove this webhook URL from external systems (n8n, cron, etc.)'
        });
      }
      
      // === CARE TRIGGER TENANT VALIDATION ===
      // Fetch workflow to check if it has a care_trigger node with tenant restriction
      const workflowResult = await pgPool.query(
        'SELECT id, nodes FROM workflow WHERE id = $1',
        [id]
      );
      
      if (workflowResult.rows.length === 0) {
        logger.warn(`[Webhook] Workflow ${id} not found`);
        return res.status(404).json({ status: 'error', message: 'Workflow not found' });
      }
      
      const workflowNodes = workflowResult.rows[0].nodes || [];
      const careTriggerNode = workflowNodes.find(n => n.type === 'care_trigger');
      
      // If workflow has a care_trigger node, enforce tenant isolation
      if (careTriggerNode) {
        const nodeConfig = careTriggerNode.config || {};
        const configuredTenantId = nodeConfig.tenant_id;
        const payloadTenantId = payload.tenant_id;
        
        // Check if CARE processing is disabled
        if (nodeConfig.is_enabled === false) {
          logger.info(`[Webhook] CARE workflow ${id} is disabled - logging event only`);
          return res.status(200).json({ 
            status: 'skipped', 
            message: 'CARE processing is disabled for this workflow',
            logged: true
          });
        }
        
        // Require tenant_id in care_trigger config
        if (!configuredTenantId) {
          logger.warn(`[Webhook] CARE workflow ${id} has no tenant_id configured - rejecting all events`);
          return res.status(403).json({ 
            status: 'error', 
            message: 'CARE workflow not configured: missing tenant_id in CARE Start node',
            hint: 'Configure the tenant_id in the CARE Start node to accept events'
          });
        }
        
        // Require tenant_id in payload
        if (!payloadTenantId) {
          logger.warn(`[Webhook] CARE event missing tenant_id in payload for workflow ${id}`);
          return res.status(400).json({ 
            status: 'error', 
            message: 'CARE event payload missing required tenant_id field'
          });
        }
        
        // Validate tenant_id matches
        if (configuredTenantId !== payloadTenantId) {
          logger.warn(`[Webhook] CARE tenant mismatch for workflow ${id}: expected ${configuredTenantId}, got ${payloadTenantId}`);
          return res.status(403).json({ 
            status: 'error', 
            message: 'Tenant mismatch: this CARE workflow is configured for a different tenant',
            expected_tenant: configuredTenantId.substring(0, 8) + '...',  // Partial for security
            received_tenant: payloadTenantId.substring(0, 8) + '...'
          });
        }
        
        logger.info(`[Webhook] CARE tenant validated: ${payloadTenantId} matches workflow ${id}`, {
          shadow_mode: nodeConfig.shadow_mode ?? true,
          state_write_enabled: nodeConfig.state_write_enabled ?? false,
          webhook_timeout_ms: nodeConfig.webhook_timeout_ms || 3000
        });
        
        // Pass CARE config to the workflow execution context
        payload._care_config = {
          shadow_mode: nodeConfig.shadow_mode ?? true,
          state_write_enabled: nodeConfig.state_write_enabled ?? false,
          webhook_timeout_ms: nodeConfig.webhook_timeout_ms || 3000,
          webhook_max_retries: nodeConfig.webhook_max_retries ?? 2
        };
      }
      // === END CARE TRIGGER TENANT VALIDATION ===
      
      // Compute idempotency key for deduplication
      // Hash the payload for deterministic jobId
      const payloadHash = crypto.createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex')
        .substring(0, 8);
      
      // CRITICAL: jobId should NOT include time - only workflow+payload hash
      // This ensures Bull rejects exact duplicates
      const jobId = `${id}:${payloadHash}`;
      const idempotencyKey = `webhook:${id}:${payloadHash}`;
      
      logger.info(`[Webhook] Received request for workflow ${id}`, { 
        payload,
        jobId,
        idempotencyKey,
        sourceIp: req.ip,
        requestId: req.headers['x-request-id'] || 'none'
      });
      
      // Check Redis for idempotency (prevents duplicate processing within 60s)
      const existing = await redisCache.get(idempotencyKey);
      if (existing) {
        logger.info(`[Webhook] Duplicate webhook detected (idempotency key exists) - returning cached response`, {
          workflow_id: id,
          idempotencyKey,
          cachedJobId: existing
        });
        return res.status(202).json({ 
          status: 'accepted', 
          message: 'Workflow already queued (duplicate prevented by idempotency)',
          workflow_id: id,
          job_id: existing
        });
      }
      
      // Queue workflow for async execution with deterministic jobId
      // If jobId already exists, Bull will reject the duplicate
      await workflowQueue.add('execute-workflow', {
        workflow_id: id,
        trigger_data: payload,  // Match what the processor expects
        trigger: 'webhook'
      }, {
        jobId // CRITICAL: Prevents duplicate enqueues
      });
      
      // Store idempotency key in Redis (60s TTL)
      await redisCache.setex(idempotencyKey, 60, jobId);
      
      logger.info(`[Webhook] Workflow ${id} queued for execution with jobId ${jobId}`);
      
      // Return 202 Accepted immediately
      return res.status(202).json({ 
        status: 'accepted', 
        message: 'Workflow queued for execution',
        workflow_id: id,
        job_id: jobId
      });
    } catch (error) {
      // If job already exists, Bull throws an error - this is OK (idempotency)
      if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
        logger.info(`[Webhook] Duplicate job detected by Bull - returning success (idempotent)`, {
          workflow_id: id,
          error: error.message
        });
        return res.status(202).json({ 
          status: 'accepted', 
          message: 'Workflow already queued (duplicate prevented by Bull)',
          workflow_id: id
        });
      }
      
      logger.error(`[Webhook] Error queueing workflow: ${error.message}`, error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
