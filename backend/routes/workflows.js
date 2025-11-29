/**
 * Workflow Routes
 * CRUD operations for workflows and workflow executions
 */

import express from 'express';
import workflowQueue from '../services/workflowQueue.js';

// Helper: lift workflow fields from metadata and align shape with frontend expectations
function normalizeWorkflow(row) {
  if (!row) return row;

  let meta = row.metadata;

  // Handle stringified JSON (common with some DB drivers or text columns)
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch (e) {
      console.warn('[normalizeWorkflow] Failed to parse metadata string:', e);
      meta = {};
    }
  }

  // Ensure meta is an object
  meta = meta && typeof meta === 'object' ? meta : {};

  // Log if nodes are missing but expected (debugging)
  if ((!meta.nodes || meta.nodes.length === 0) && row.name) {
    console.log(`[normalizeWorkflow] Workflow "${row.name}" (id: ${row.id}) has no nodes in metadata. Raw metadata type: ${typeof row.metadata}`);
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
              const cols = ['tenant_id'];
              const vals = [workflow.tenant_id];
              const ph = ['$1'];
              let idx = 2;
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
              const model = cfg.model || 'default';
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
      console.error('Error fetching workflows:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/workflows - Create new workflow
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, description, trigger, nodes, connections, is_active } = req.body;

      console.log('[Workflows POST] Received nodes:', nodes);
      console.log('[Workflows POST] Received connections:', connections);

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

      console.log('[Workflows POST] Metadata to store:', metadata);

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

      res.status(201).json({
        status: 'success',
        data: workflow
      });
    } catch (error) {
      console.error('Error creating workflow:', error);
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

      console.log('[Workflows PUT] Received nodes:', nodes);
      console.log('[Workflows PUT] Received connections:', connections);

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

      console.log('[Workflows PUT] Existing metadata type:', typeof existingMetadata);
      console.log('[Workflows PUT] Existing metadata value:', JSON.stringify(existingMetadata));

      // Handle stringified JSON in database
      if (typeof existingMetadata === 'string') {
        try {
          existingMetadata = JSON.parse(existingMetadata);
        } catch (e) {
          console.warn('[Workflows PUT] Failed to parse existing metadata:', e);
          existingMetadata = {};
        }
      }

      console.log('[Workflows PUT] Parsed existing metadata:', existingMetadata);
      console.log('[Workflows PUT] Incoming nodes:', nodes ? `Array(${nodes.length})` : 'undefined');

      // Build updated metadata
      const metadata = {
        ...existingMetadata,
        nodes: nodes !== undefined ? nodes : existingMetadata.nodes || [],
        connections: connections !== undefined ? connections : existingMetadata.connections || []
      };

      console.log('[Workflows PUT] Final merged metadata:', JSON.stringify(metadata));

      console.log('[Workflows PUT] Metadata to store:', metadata);

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

      res.json({
        status: 'success',
        data: workflow
      });
    } catch (error) {
      console.error('Error updating workflow:', error);
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
      console.error('Error deleting workflow:', error);
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
      console.error('[Workflow Execute] Error queuing workflow:', error);
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/workflows/:id/test - Convenience endpoint to execute a workflow by ID with payload
  /**
   * @openapi
   * /api/workflows/{id}/test:
   *   post:
   *     summary: Test-execute a workflow
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
  router.post('/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      const payload = req.body?.payload ?? req.body ?? {};
      // Directly execute without issuing an internal HTTP request (prevents SSRF)
      const result = await executeWorkflowById(id, payload);
      return res.status(result.httpStatus).json({ status: result.status, data: result.data });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
