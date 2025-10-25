/**
 * Workflow Routes
 * CRUD operations for workflows and workflow executions
 */

import express from 'express';

// Helper: lift workflow fields from metadata and align shape with frontend expectations
function normalizeWorkflow(row) {
  if (!row) return row;
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
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

  // GET /api/workflows/:id - Get single workflow
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const result = await pgPool.query('SELECT * FROM workflow WHERE id = $1', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Workflow not found' });
      }

  res.json({ status: 'success', data: normalizeWorkflow(result.rows[0]) });
    } catch (error) {
      console.error('Error fetching workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/workflows - Create workflow
  router.post('/', async (req, res) => {
    try {
  const workflow = req.body || {};

      if (!workflow.tenant_id || !workflow.name || !workflow.trigger_type) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'tenant_id, name, and trigger_type are required' 
        });
      }

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      // Merge non-schema fields into metadata for forward compatibility
      const meta = {
        ...(workflow.metadata || {}),
        nodes: workflow.nodes || [],
        connections: workflow.connections || [],
        webhook_url: workflow.webhook_url || null,
        execution_count: workflow.execution_count || 0,
        last_executed: workflow.last_executed || null,
      };

      const query = `
        INSERT INTO workflow (
          tenant_id, name, description, trigger_type, trigger_config, 
          actions, is_active, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        workflow.tenant_id,
        workflow.name,
        workflow.description || null,
        workflow.trigger_type || (workflow.trigger?.type ?? 'webhook'),
        JSON.stringify(workflow.trigger_config || workflow.trigger?.config || {}),
        JSON.stringify(workflow.actions || []),
        workflow.is_active !== undefined ? workflow.is_active : true,
        JSON.stringify(meta)
      ];

      const result = await pgPool.query(query, values);

      res.status(201).json({
        status: 'success',
        message: 'Workflow created successfully',
        data: normalizeWorkflow(result.rows[0])
      });
    } catch (error) {
      console.error('Error creating workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/workflows/:id - Update workflow
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      // Load current metadata so we can merge
      const currentRes = await pgPool.query('SELECT metadata FROM workflow WHERE id = $1', [id]);
      if (currentRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Workflow not found' });
      }
      const currentMeta = currentRes.rows[0]?.metadata && typeof currentRes.rows[0].metadata === 'object'
        ? currentRes.rows[0].metadata
        : {};

      // Pick schema fields
      const schemaUpdates = {
        name: updates.name,
        description: updates.description,
        trigger_type: updates.trigger_type ?? updates.trigger?.type,
        trigger_config: updates.trigger_config ?? updates.trigger?.config,
        actions: updates.actions,
        is_active: updates.is_active,
      };

      // Merge metadata updates
      const metaUpdates = {
        nodes: updates.nodes ?? currentMeta.nodes,
        connections: updates.connections ?? currentMeta.connections,
        webhook_url: updates.webhook_url ?? currentMeta.webhook_url,
        execution_count: updates.execution_count ?? currentMeta.execution_count,
        last_executed: updates.last_executed ?? currentMeta.last_executed,
        ...(updates.metadata || {}),
      };

      const setStatements = [];
      const values = [];
      let paramCount = 1;

      if (schemaUpdates.name !== undefined) { setStatements.push(`name = $${paramCount++}`); values.push(schemaUpdates.name); }
      if (schemaUpdates.description !== undefined) { setStatements.push(`description = $${paramCount++}`); values.push(schemaUpdates.description); }
      if (schemaUpdates.trigger_type !== undefined) { setStatements.push(`trigger_type = $${paramCount++}`); values.push(schemaUpdates.trigger_type); }
      if (schemaUpdates.trigger_config !== undefined) { setStatements.push(`trigger_config = $${paramCount++}`); values.push(JSON.stringify(schemaUpdates.trigger_config)); }
      if (schemaUpdates.actions !== undefined) { setStatements.push(`actions = $${paramCount++}`); values.push(JSON.stringify(schemaUpdates.actions)); }
      if (schemaUpdates.is_active !== undefined) { setStatements.push(`is_active = $${paramCount++}`); values.push(!!schemaUpdates.is_active); }

      // Always write merged metadata when any update arrives
      const newMeta = { ...currentMeta, ...metaUpdates };
      setStatements.push(`metadata = $${paramCount++}`);
      values.push(JSON.stringify(newMeta));

      setStatements.push(`updated_at = NOW()`);
      values.push(id);

      const query = `
        UPDATE workflow 
        SET ${setStatements.join(', ')} 
        WHERE id = $${paramCount} 
        RETURNING *
      `;

      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Workflow not found' });
      }

      res.json({
        status: 'success',
        message: 'Workflow updated successfully',
        data: normalizeWorkflow(result.rows[0])
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

      if (!pgPool) {
        return res.status(503).json({ status: 'error', message: 'Database not configured' });
      }

      const result = await pgPool.query('DELETE FROM workflow WHERE id = $1 RETURNING id', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Workflow not found' });
      }

      res.json({
        status: 'success',
        message: 'Workflow deleted successfully',
        data: { id: result.rows[0].id }
      });
    } catch (error) {
      console.error('Error deleting workflow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/workflows/execute - Execute workflow (server-side)
  router.post('/execute', async (req, res) => {
    const startTime = Date.now();
    const executionLog = [];
    let executionId = null;
    try {
      const { workflow_id, payload, input_data } = req.body || {};
      const triggerPayload = payload ?? input_data ?? {};

      if (!workflow_id) {
        return res.status(400).json({ status: 'error', message: 'workflow_id is required' });
      }

      // Load workflow
      const wfRes = await pgPool.query('SELECT * FROM workflow WHERE id = $1', [workflow_id]);
      if (wfRes.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Workflow not found' });
      }
      const workflow = normalizeWorkflow(wfRes.rows[0]);
      if (workflow.is_active === false) {
        return res.status(400).json({ status: 'error', message: 'Workflow is not active' });
      }

      // Create execution record (running)
      const exRes = await pgPool.query(
        `INSERT INTO workflow_execution (workflow_id, tenant_id, status, trigger_data, execution_log, started_at, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *`,
        [workflow.id, workflow.tenant_id, 'running', JSON.stringify(triggerPayload), JSON.stringify([])]
      );
      const execution = exRes.rows[0];
      executionId = execution.id;

      // Execution context
      const context = { payload: triggerPayload, variables: {} };

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
              log.output = { payload: triggerPayload };
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
            case 'create_activity': {
              const activityType = cfg.type || 'task';
              const subject = replaceVariables(cfg.subject || 'Workflow activity');
              const description = replaceVariables(cfg.description || '');
              const lead = context.variables.found_lead;
              const contact = context.variables.found_contact;
              const related_to = lead ? 'lead' : (contact ? 'contact' : null);
              const related_id = lead ? lead.id : (contact ? contact.id : null);
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

      return res.json({ status: finalStatus, data: { execution_id: execution.id, execution_log: executionLog, duration_ms: duration } });
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
      return res.status(500).json({ status: 'error', message: error.message, data: { execution_log: executionLog } });
    }
  });

  return router;
}
