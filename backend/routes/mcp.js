/**
 * MCP (Model Context Protocol) Routes
 * Server discovery, tool execution, resource management
 */

import express from "express";
import fetch from "node-fetch";
import { getSupabaseClient } from "../lib/supabase-db.js";
import { resolveLLMApiKey, pickModel, generateChatCompletion } from "../lib/aiEngine/index.js";

export default function createMCPRoutes(_pgPool) {
  const router = express.Router();
  const supa = getSupabaseClient();

  // API key resolution now handled by centralized lib/aiEngine/keyResolver.js

  // GET /api/mcp/servers - List available MCP servers
  router.get("/servers", async (req, res) => {
    try {
      const servers = [];

      // GitHub MCP server presence is inferred via env token. This is a lightweight proxy/health integration.
      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN ||
        null;
      if (githubToken) {
        // Attempt a fast health check against GitHub API
        let healthy = false;
        let identity = null;
        try {
          const resp = await fetch("https://api.github.com/user", {
            headers: {
              "Authorization": `Bearer ${githubToken}`,
              "Accept": "application/vnd.github+json",
              "User-Agent": "aishacrm-mcp-health",
            },
          });
          if (resp.ok) {
            const json = await resp.json();
            identity = { login: json.login, id: json.id };
            healthy = true;
          }
        } catch (e) {
          // leave healthy=false
          void e;
        }
        servers.push({
          id: "github",
          name: "GitHub MCP",
          type: "mcp",
          transport: "proxy",
          configured: true,
          healthy,
          identity,
          docs: "https://github.com/modelcontextprotocol/servers",
        });
      } else {
        servers.push({
          id: "github",
          name: "GitHub MCP",
          type: "mcp",
          transport: "proxy",
          configured: false,
          healthy: false,
          identity: null,
          missing: ["GITHUB_TOKEN"],
        });
      }

      // Add a lightweight CRM MCP to expose core CRM tools over MCP
      servers.push({
        id: "crm",
        name: "CRM MCP",
        type: "mcp",
        transport: "proxy",
        configured: true,
        healthy: true,
        capabilities: [
          "crm.search_accounts",
          "crm.search_contacts",
          "crm.search_leads",
          "crm.get_record",
          "crm.create_activity",
          "crm.get_tenant_stats",
          "crm.list_workflows",
          "crm.execute_workflow",
          "crm.update_workflow",
          "crm.toggle_workflow_status",
          "crm.list_workflow_templates",
          "crm.get_workflow_template",
          "crm.instantiate_workflow_template",
        ],
      });

      // Add a minimal Web Research MCP (Wikipedia only for now)
      servers.push({
        id: "web",
        name: "Web Research MCP",
        type: "mcp",
        transport: "proxy",
        configured: true,
        healthy: true,
        capabilities: ["web.search_wikipedia", "web.get_wikipedia_page"],
      });

      // Add LLM MCP facade
      servers.push({
        id: "llm",
        name: "LLM MCP",
        type: "mcp",
        transport: "proxy",
        configured: true,
        healthy: true,
        capabilities: ["llm.generate_json"],
      });

      res.json({ status: "success", data: { servers } });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // POST /api/mcp/execute-tool - Execute MCP tool
  router.post("/execute-tool", async (req, res) => {
    try {
      const { server_id, tool_name, parameters } = req.body || {};

      if (server_id === "github") {
        const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN ||
          null;
        if (!githubToken) {
          return res.status(400).json({
            status: "error",
            message: "GITHUB_TOKEN not configured",
          });
        }
        // Minimal demo tools to validate wiring without a full MCP gateway
        if (tool_name === "github.list_repos") {
          const per_page = Math.min(Number(parameters?.per_page) || 10, 100);
          const resp = await fetch(
            `https://api.github.com/user/repos?per_page=${per_page}`,
            {
              headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github+json",
                "User-Agent": "aishacrm-mcp-tools",
              },
            },
          );
          const json = await resp.json();
          return res.json({ status: "success", data: json });
        }
        if (tool_name === "github.get_user") {
          const resp = await fetch("https://api.github.com/user", {
            headers: {
              "Authorization": `Bearer ${githubToken}`,
              "Accept": "application/vnd.github+json",
              "User-Agent": "aishacrm-mcp-tools",
            },
          });
          const json = await resp.json();
          return res.json({ status: "success", data: json });
        }
        return res.status(400).json({
          status: "error",
          message: `Unknown tool for server 'github': ${tool_name}`,
        });
      }

      // CRM MCP toolset
      if (server_id === "crm") {
        // Workflow template read tools don't require tenant_id (system templates are public)
        if (tool_name === "crm.list_workflow_templates") {
          const { category, include_inactive = false } = parameters || {};
          
          let query = supa
            .from('workflow_template')
            .select('id, name, description, category, parameters, use_cases, is_active, is_system, created_at')
            .order('category', { ascending: true })
            .order('name', { ascending: true });

          if (!include_inactive) {
            query = query.eq('is_active', true);
          }
          if (category) {
            query = query.eq('category', category);
          }

          const { data, error } = await query;
          if (error) throw error;

          // Format for AI consumption with parameter summaries
          const templates = (data || []).map(t => ({
            ...t,
            parameter_summary: (t.parameters || []).map(p => 
              `${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`
            ).join('; '),
          }));

          return res.json({
            status: "success",
            data: templates,
            meta: {
              total: templates.length,
              categories: [...new Set(templates.map(t => t.category))],
            },
          });
        }

        if (tool_name === "crm.get_workflow_template") {
          const { template_id } = parameters || {};
          if (!template_id) {
            return res.status(400).json({
              status: "error",
              message: "template_id is required",
            });
          }

          const { data, error } = await supa
            .from('workflow_template')
            .select('*')
            .eq('id', template_id)
            .single();

          if (error) {
            if (error.code === 'PGRST116') {
              return res.status(404).json({
                status: "error",
                message: "Template not found",
              });
            }
            throw error;
          }

          return res.json({ status: "success", data });
        }

        // All other CRM tools require tenant_id
        const { tenant_id } = parameters || {};
        if (!tenant_id) {
          return res.status(400).json({
            status: "error",
            message: "tenant_id is required",
          });
        }

        // Helper: safe paging
        const limit = Math.min(Number(parameters?.limit) || 10, 100);
        const offset = Math.max(Number(parameters?.offset) || 0, 0);

        if (tool_name === "crm.search_accounts") {
          const q = String(parameters?.q || "").trim();
          const { data, error } = await supa
            .from('accounts')
            .select('*')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (error) throw error;

          // Client-side ILIKE filtering
          let filtered = data || [];
          if (q) {
            const qLower = q.toLowerCase();
            filtered = filtered.filter(row => {
              const name = (row.name || '').toLowerCase();
              const industry = (row.industry || '').toLowerCase();
              const website = (row.website || '').toLowerCase();
              return name.includes(qLower) || industry.includes(qLower) || website.includes(qLower);
            });
          }

          return res.json({ status: "success", data: filtered });
        }

        if (tool_name === "crm.search_contacts") {
          const q = String(parameters?.q || "").trim();
          const { data, error } = await supa
            .from('contacts')
            .select('*')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (error) throw error;

          // Client-side ILIKE filtering
          let filtered = data || [];
          if (q) {
            const qLower = q.toLowerCase();
            filtered = filtered.filter(row => {
              const first_name = (row.first_name || '').toLowerCase();
              const last_name = (row.last_name || '').toLowerCase();
              const email = (row.email || '').toLowerCase();
              return first_name.includes(qLower) || last_name.includes(qLower) || email.includes(qLower);
            });
          }

          return res.json({ status: "success", data: filtered });
        }

        if (tool_name === "crm.search_leads") {
          const q = String(parameters?.q || "").trim();
          const { data, error } = await supa
            .from('leads')
            .select('*')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (error) throw error;

          // Client-side ILIKE filtering
          let filtered = data || [];
          if (q) {
            const qLower = q.toLowerCase();
            filtered = filtered.filter(row => {
              const first_name = (row.first_name || '').toLowerCase();
              const last_name = (row.last_name || '').toLowerCase();
              const email = (row.email || '').toLowerCase();
              const company = (row.company || '').toLowerCase();
              return first_name.includes(qLower) || last_name.includes(qLower) || email.includes(qLower) || company.includes(qLower);
            });
          }

          return res.json({ status: "success", data: filtered });
        }

        if (tool_name === "crm.get_record") {
          const entity = String(parameters?.entity || "").toLowerCase();
          const id = String(parameters?.id || "").trim();
          const table = {
            account: "accounts",
            accounts: "accounts",
            contact: "contacts",
            contacts: "contacts",
            lead: "leads",
            leads: "leads",
            opportunity: "opportunities",
            opportunities: "opportunities",
            activity: "activities",
            activities: "activities",
          }[entity];
          if (!table) {
            return res.status(400).json({
              status: "error",
              message: `Unsupported entity: ${entity}`,
            });
          }
          const { data, error } = await supa
            .from(table)
            .select('*')
            .eq('id', id)
            .eq('tenant_id', tenant_id)
            .maybeSingle();

          if (error) throw error;

          return res.json({ status: "success", data: data || null });
        }

        if (tool_name === "crm.create_activity") {
          const { type, subject, body, related_id, metadata } = parameters ||
            {};
          if (!type) {
            return res.status(400).json({
              status: "error",
              message: "type is required",
            });
          }
          
          // Extract user email from authorization header
          const userEmail = req.user?.email || req.headers['x-user-email'] || null;
          
          // Build metadata with assigned_to defaulting to current user
          const activityMetadata = {
            ...metadata,
            assigned_to: metadata?.assigned_to || userEmail,
            status: metadata?.status || 'scheduled',
            description: body || null
          };
          
          const { data, error } = await supa
            .from('activities')
            .insert({
              tenant_id,
              type,
              subject: subject || null,
              body: body || null,
              related_id: related_id || null,
              metadata: activityMetadata,
              created_at: new Date().toISOString()
            })
            .select()
            .single();

          if (error) throw error;

          return res.json({ status: "success", data });
        }

        if (tool_name === "crm.get_tenant_stats") {
          const [accounts, contacts, leads, opps, activities] = await Promise
            .all([
              supa.from('accounts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
              supa.from('contacts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
              supa.from('leads').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
              supa.from('opportunities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
              supa.from('activities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
            ]);
          return res.json({
            status: "success",
            data: {
              accounts: accounts.count || 0,
              contacts: contacts.count || 0,
              leads: leads.count || 0,
              opportunities: opps.count || 0,
              activities: activities.count || 0,
            },
          });
        }

        if (tool_name === "crm.list_workflows") {
          const active_only = parameters?.active_only !== false;
          let query = supa
            .from('workflows')
            .select('id, name, description, trigger, is_active, created_at, updated_at')
            .eq('tenant_id', tenant_id)
            .order('updated_at', { ascending: false });
          
          if (active_only) {
            query = query.eq('is_active', true);
          }

          const { data, error } = await query;
          if (error) throw error;

          return res.json({ status: "success", data: data || [] });
        }

        if (tool_name === "crm.execute_workflow") {
          const { workflow_id, trigger_data } = parameters || {};
          if (!workflow_id) {
            return res.status(400).json({
              status: "error",
              message: "workflow_id is required",
            });
          }

          // Verify workflow exists and belongs to tenant
          const { data: workflow, error: wErr } = await supa
            .from('workflows')
            .select('id, name, is_active, trigger, nodes, connections')
            .eq('id', workflow_id)
            .eq('tenant_id', tenant_id)
            .maybeSingle();

          if (wErr) throw wErr;
          if (!workflow) {
            return res.status(404).json({
              status: "error",
              message: "Workflow not found",
            });
          }

          if (!workflow.is_active) {
            return res.status(400).json({
              status: "error",
              message: "Workflow is not active",
            });
          }

          // Execute workflow using the existing executor
          // Import executeWorkflowById dynamically to avoid circular dependencies
          const triggerPayload = trigger_data || {};
          
          // Create execution record
          const { data: execution, error: exErr } = await supa
            .from('workflow_executions')
            .insert({
              workflow_id,
              trigger_data: triggerPayload,
              status: 'running',
              execution_log: [],
              created_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (exErr) throw exErr;

          try {
            // Execute workflow nodes
            const context = {
              variables: {},
              payload: triggerPayload,
            };

            const nodes = workflow.nodes || [];
            const connections = workflow.connections || [];
            const executionLog = [];

            // Helper function to get next node
            const getNextNode = (currentNodeId, branchType = null) => {
              const conn = connections.find(c => 
                c.from === currentNodeId && 
                (!branchType || c.type === branchType)
              );
              return conn ? nodes.find(n => n.id === conn.to) : null;
            };

            // Execute nodes sequentially starting after trigger
            let currentNode = nodes.find(n => n.type !== 'webhook_trigger');
            
            while (currentNode) {
              executionLog.push({
                node_id: currentNode.id,
                node_type: currentNode.type,
                timestamp: new Date().toISOString(),
                status: 'executing',
              });

              try {
                // Execute based on node type (simplified version)
                if (currentNode.type === 'find_lead') {
                  const email = currentNode.config?.email || '';
                  const { data } = await supa
                    .from('leads')
                    .select('*')
                    .eq('tenant_id', tenant_id)
                    .eq('email', email)
                    .maybeSingle();
                  context.variables.found_lead = data || null;
                  executionLog[executionLog.length - 1].result = { found: !!data };
                } else if (currentNode.type === 'condition') {
                  const field = currentNode.config?.field || '';
                  const operator = currentNode.config?.operator || '==';
                  const value = currentNode.config?.value || '';
                  const fieldValue = context.variables[field] || context.payload[field];
                  let conditionMet = false;
                  
                  if (operator === '==' || operator === 'equals') conditionMet = fieldValue == value;
                  else if (operator === '!=' || operator === 'not_equals') conditionMet = fieldValue != value;
                  else if (operator === 'contains') conditionMet = String(fieldValue).includes(value);
                  else if (operator === 'exists') conditionMet = fieldValue != null;
                  
                  executionLog[executionLog.length - 1].result = { condition_met: conditionMet };
                  currentNode = getNextNode(currentNode.id, conditionMet ? 'TRUE' : 'FALSE');
                  continue;
                }

                executionLog[executionLog.length - 1].status = 'completed';
              } catch (nodeError) {
                executionLog[executionLog.length - 1].status = 'failed';
                executionLog[executionLog.length - 1].error = nodeError.message;
                throw nodeError;
              }

              currentNode = getNextNode(currentNode.id);
            }

            // Update execution record with success
            await supa
              .from('workflow_executions')
              .update({
                status: 'success',
                execution_log: executionLog,
                completed_at: new Date().toISOString(),
              })
              .eq('id', execution.id);

            return res.json({
              status: "success",
              data: {
                execution_id: execution.id,
                workflow_id,
                workflow_name: workflow.name,
                status: 'success',
                execution_log: executionLog,
              },
            });
          } catch (execError) {
            // Update execution record with failure
            await supa
              .from('workflow_executions')
              .update({
                status: 'failed',
                execution_log: executionLog,
                error_message: execError.message,
                completed_at: new Date().toISOString(),
              })
              .eq('id', execution.id);

            return res.status(500).json({
              status: "error",
              message: `Workflow execution failed: ${execError.message}`,
              execution_id: execution.id,
            });
          }
        }

        // crm.update_workflow - Update workflow configuration
        if (tool_name === "crm.update_workflow") {
          const { workflow_id, name, description, nodes, connections, is_active } = parameters || {};
          if (!workflow_id) {
            return res.status(400).json({
              status: "error",
              message: "workflow_id is required",
            });
          }

          // Verify workflow exists and belongs to tenant
          const { data: existing, error: checkErr } = await supa
            .from('workflow')
            .select('id, metadata')
            .eq('id', workflow_id)
            .eq('tenant_id', tenant_id)
            .maybeSingle();

          if (checkErr) throw checkErr;
          if (!existing) {
            return res.status(404).json({
              status: "error",
              message: "Workflow not found or access denied",
            });
          }

          // Build update object
          const updates = { updated_at: new Date().toISOString() };
          if (name !== undefined) updates.name = name;
          if (description !== undefined) updates.description = description;
          if (is_active !== undefined) updates.is_active = is_active;

          // Update metadata if nodes or connections provided
          if (nodes !== undefined || connections !== undefined) {
            const existingMeta = existing.metadata || {};
            updates.metadata = {
              ...existingMeta,
              ...(nodes !== undefined && { nodes }),
              ...(connections !== undefined && { connections }),
            };
          }

          const { data, error } = await supa
            .from('workflow')
            .update(updates)
            .eq('id', workflow_id)
            .eq('tenant_id', tenant_id)
            .select()
            .single();

          if (error) throw error;

          return res.json({
            status: "success",
            message: "Workflow updated successfully",
            data,
          });
        }

        // crm.toggle_workflow_status - Activate or deactivate a workflow
        if (tool_name === "crm.toggle_workflow_status") {
          const { workflow_id, is_active } = parameters || {};
          if (!workflow_id) {
            return res.status(400).json({
              status: "error",
              message: "workflow_id is required",
            });
          }
          if (typeof is_active !== 'boolean') {
            return res.status(400).json({
              status: "error",
              message: "is_active must be a boolean",
            });
          }

          const { data, error } = await supa
            .from('workflow')
            .update({ is_active, updated_at: new Date().toISOString() })
            .eq('id', workflow_id)
            .eq('tenant_id', tenant_id)
            .select('id, name, is_active')
            .single();

          if (error) {
            if (error.code === 'PGRST116') {
              return res.status(404).json({
                status: "error",
                message: "Workflow not found or access denied",
              });
            }
            throw error;
          }

          return res.json({
            status: "success",
            message: `Workflow ${is_active ? 'activated' : 'deactivated'}`,
            data,
          });
        }

        // crm.instantiate_workflow_template - Create a workflow from a template
        if (tool_name === "crm.instantiate_workflow_template") {
          const { template_id, name: workflowName, parameters: paramValues = {} } = parameters || {};
          if (!template_id) {
            return res.status(400).json({
              status: "error",
              message: "template_id is required",
            });
          }

          // Fetch template
          const { data: template, error: templateError } = await supa
            .from('workflow_template')
            .select('*')
            .eq('id', template_id)
            .eq('is_active', true)
            .single();

          if (templateError) {
            if (templateError.code === 'PGRST116') {
              return res.status(404).json({
                status: "error",
                message: "Template not found or inactive",
              });
            }
            throw templateError;
          }

          // Validate parameters
          const templateParams = template.parameters || [];
          const errors = [];
          const validated = {};

          for (const param of templateParams) {
            const value = paramValues[param.name];
            if (param.required && (value === undefined || value === null || value === '')) {
              if (param.default !== undefined && param.default !== '') {
                validated[param.name] = param.default;
              } else {
                errors.push(`Missing required parameter: ${param.name}`);
              }
            } else if (value !== undefined) {
              validated[param.name] = value;
            } else if (param.default !== undefined) {
              validated[param.name] = param.default;
            }
          }

          if (errors.length > 0) {
            return res.status(400).json({
              status: "error",
              message: "Parameter validation failed",
              errors,
            });
          }

          // Substitute parameters in template
          function substituteParams(obj) {
            if (typeof obj === 'string') {
              return obj.replace(/\{\{(\w+)\}\}/g, (match, paramName) => {
                if (Object.prototype.hasOwnProperty.call(validated, paramName)) {
                  return validated[paramName];
                }
                return match;
              });
            }
            if (Array.isArray(obj)) return obj.map(substituteParams);
            if (obj && typeof obj === 'object') {
              const result = {};
              for (const [key, value] of Object.entries(obj)) {
                result[key] = substituteParams(value);
              }
              return result;
            }
            return obj;
          }

          const nodes = substituteParams(template.template_nodes);
          const connections = substituteParams(template.template_connections);

          // Create workflow
          const finalName = workflowName || `${template.name} (from template)`;
          const metadata = {
            nodes,
            connections,
            webhook_url: null,
            execution_count: 0,
            last_executed: null,
            template_id: template.id,
            template_name: template.name,
            instantiated_parameters: validated,
          };

          const { data: workflow, error: workflowError } = await supa
            .from('workflow')
            .insert({
              tenant_id,
              name: finalName,
              description: template.description,
              trigger_type: template.trigger_type,
              trigger_config: template.trigger_config,
              is_active: true,
              metadata,
            })
            .select()
            .single();

          if (workflowError) throw workflowError;

          // Update webhook URL
          const webhookUrl = `/api/workflows/${workflow.id}/webhook`;
          await supa
            .from('workflow')
            .update({ metadata: { ...metadata, webhook_url: webhookUrl } })
            .eq('id', workflow.id);

          return res.status(201).json({
            status: "success",
            message: `Workflow "${finalName}" created from template "${template.name}"`,
            data: {
              workflow_id: workflow.id,
              workflow_name: finalName,
              webhook_url: webhookUrl,
              template_used: template.name,
              parameters_applied: validated,
            },
          });
        }

        return res.status(400).json({
          status: "error",
          message: `Unknown CRM tool: ${tool_name}`,
        });
      }

      // Web Research MCP (Wikipedia only, no external keys required)
      if (server_id === "web") {
        if (tool_name === "web.search_wikipedia") {
          const q = String(parameters?.q || "").trim();
          if (!q) {
            return res.status(400).json({
              status: "error",
              message: "q is required",
            });
          }
          const resp = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${
              encodeURIComponent(q)
            }`,
          );
          const json = await resp.json();
          return res.json({
            status: "success",
            data: json?.query?.search || [],
          });
        }
        if (tool_name === "web.get_wikipedia_page") {
          const pageid = String(parameters?.pageid || "").trim();
          if (!pageid) {
            return res.status(400).json({
              status: "error",
              message: "pageid is required",
            });
          }
          const resp = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&pageids=${
              encodeURIComponent(pageid)
            }`,
          );
          const json = await resp.json();
          return res.json({
            status: "success",
            data: json?.query?.pages?.[pageid] || null,
          });
        }
        return res.status(400).json({
          status: "error",
          message: `Unknown Web tool: ${tool_name}`,
        });
      }

      // LLM MCP facade
      if (server_id === "llm") {
        if (tool_name !== "llm.generate_json") {
          return res.status(400).json({ status: "error", message: `Unknown LLM tool: ${tool_name}` });
        }

        const {
          prompt = "",
          schema = {},
          context = null,
          model,
          temperature = 0.2,
          api_key,
          tenant_id: tenantIdParam,
          provider: providerParam,
        } = parameters || {};

        // Multi-provider support: resolve provider from param or env
        const provider = providerParam || process.env.LLM_JSON_PROVIDER || process.env.LLM_PROVIDER || "openai";
        const defaultJsonModel = pickModel({ capability: "json_strict" });
        const finalModel = model || defaultJsonModel;

        // Resolve key using centralized aiEngine key resolver with provider awareness
        const apiKey = await resolveLLMApiKey({
          explicitKey: api_key,
          tenantSlugOrId: tenantIdParam,
          provider,
        });
        if (!apiKey) {
          return res.status(501).json({ status: "error", message: `API key not configured for provider: ${provider}` });
        }

        const SYSTEM_INSTRUCTIONS = `You are a strict JSON generator. Produce ONLY valid JSON that exactly matches the provided JSON Schema.\n- Do not include any commentary or code fences.\n- If you are unsure, return the closest valid JSON.\n`;

        const userContentParts = [];
        if (prompt) userContentParts.push(String(prompt));
        if (context) {
          if (typeof context === "string") userContentParts.push(context);
          else if (Array.isArray(context)) userContentParts.push(context.map((c) => (typeof c === "string" ? c : JSON.stringify(c))).join("\n\n"));
          else userContentParts.push(JSON.stringify(context));
        }
        if (schema && Object.keys(schema || {}).length) {
          userContentParts.push(`JSON Schema:\n${JSON.stringify(schema)}`);
        }

        const messages = [
          { role: "system", content: SYSTEM_INSTRUCTIONS },
          { role: "user", content: userContentParts.join("\n\n") || "Generate JSON." },
        ];

        const result = await generateChatCompletion({
          provider,
          model: finalModel,
          messages,
          temperature,
          apiKey,
        });

        if (result.status === "error") {
          const http = /api key|not configured/i.test(result.error || '') ? 501 : 500;
          return res.status(http).json({ status: "error", message: result.error });
        }
        let jsonOut = null;
        try {
          jsonOut = JSON.parse(result.content || "null");
        } catch {
          // try to extract JSON block heuristically
          const match = (result.content || "").match(/\{[\s\S]*\}\s*$/);
          if (match) {
            try { jsonOut = JSON.parse(match[0]); } catch { jsonOut = null; }
          }
        }
        return res.json({
          status: "success",
          data: {
            json: jsonOut,
            raw: result.content,
            model: result.raw?.model || finalModel,
            provider,
            usage: result.raw?.usage || null,
          },
        });
      }

      // Default stub
      res.json({
        status: "success",
        message: "MCP tool execution not yet implemented",
        data: { server_id, tool_name, parameters },
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // GET /api/mcp/resources - Get MCP resources
  router.get("/resources", async (req, res) => {
    try {
      res.json({ status: "success", data: { resources: [] } });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // GET /api/mcp/github/health - explicit health endpoint for GitHub MCP
  router.get("/github/health", async (req, res) => {
    try {
      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN ||
        null;
      if (!githubToken) {
        return res.json({
          status: "success",
          data: {
            configured: false,
            healthy: false,
            reason: "Missing GITHUB_TOKEN",
          },
        });
      }
      const resp = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Accept": "application/vnd.github+json",
          "User-Agent": "aishacrm-mcp-health",
        },
      });
      if (!resp.ok) {
        const text = await resp.text();
        return res.json({
          status: "success",
          data: {
            configured: true,
            healthy: false,
            http: resp.status,
            message: text,
          },
        });
      }
      const json = await resp.json();
      return res.json({
        status: "success",
        data: {
          configured: true,
          healthy: true,
          identity: { login: json.login, id: json.id },
        },
      });
    } catch (err) {
      return res.json({
        status: "success",
        data: { configured: true, healthy: false, error: String(err) },
      });
    }
  });

  // POST /api/mcp/market-insights - Orchestrate web + CRM tools and summarize via LLM into JSON schema
  router.post("/market-insights", async (req, res) => {
    try {
      const body = req.body || {};
      const tenantId = req.headers["x-tenant-id"] || body.tenant_id || body.tenantId || null;
      if (!tenantId) {
        return res.status(400).json({ status: "error", message: "tenant_id required" });
      }

      // Load tenant profile for context
      const { data: tenantRows, error: tErr } = await supa
        .from("tenant")
        .select("id, tenant_id, name, industry, business_model, geographic_focus, country, major_city")
        .or(`tenant_id.eq.${tenantId},id.eq.${tenantId}`)
        .limit(1);
      if (tErr) throw tErr;
      const tenant = tenantRows?.[0] || { tenant_id: tenantId, name: tenantId };

      const INDUSTRY = tenant.industry || body.industry || "SaaS & Cloud Services";
      const BUSINESS_MODEL = tenant.business_model || body.business_model || "B2B";
      const GEO = tenant.geographic_focus || body.geographic_focus || "North America";
      const LOCATION = tenant.major_city && tenant.country ? `${tenant.major_city}, ${tenant.country}` : (tenant.country || GEO);

      // CRM stats (reuse logic from crm.get_tenant_stats)
      const [accounts, contacts, leads, opps, activities] = await Promise.all([
        supa.from('accounts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.tenant_id || tenantId),
        supa.from('contacts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.tenant_id || tenantId),
        supa.from('leads').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.tenant_id || tenantId),
        supa.from('opportunities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.tenant_id || tenantId),
        supa.from('activities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.tenant_id || tenantId),
      ]);
      const tenantStats = {
        accounts: accounts.count || 0,
        contacts: contacts.count || 0,
        leads: leads.count || 0,
        opportunities: opps.count || 0,
        activities: activities.count || 0,
      };

      // Wikipedia context (reuse logic from web tools)
      const searchQ = `${INDUSTRY} market ${LOCATION}`;
      const searchResp = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(searchQ)}`);
      const searchJson = await searchResp.json();
      const searchResults = searchJson?.query?.search || [];
      let overview = "";
      if (searchResults.length) {
        const first = searchResults[0];
        const pageid = String(first.pageid);
        try {
          const pageResp = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&pageids=${encodeURIComponent(pageid)}`);
          const pageJson = await pageResp.json();
          overview = pageJson?.query?.pages?.[pageid]?.extract || "";
        } catch {
          overview = "";
        }
      }

      // Build JSON schema for insights
      const schema = {
        type: "object",
        properties: {
          market_overview: { type: "string" },
          swot_analysis: {
            type: "object",
            properties: {
              strengths: { type: "array", items: { type: "string" } },
              weaknesses: { type: "array", items: { type: "string" } },
              opportunities: { type: "array", items: { type: "string" } },
              threats: { type: "array", items: { type: "string" } },
            },
            required: ["strengths", "weaknesses", "opportunities", "threats"],
          },
          competitive_landscape: {
            type: "object",
            properties: {
              overview: { type: "string" },
              major_competitors: { type: "array", items: { type: "string" } },
              market_dynamics: { type: "string" },
            },
            required: ["overview", "major_competitors"],
          },
          major_news: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                date: { type: "string" },
                impact: { type: "string", enum: ["positive", "negative", "neutral"] },
              },
              required: ["title", "description", "date", "impact"],
            },
          },
          recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                priority: { type: "string", enum: ["high", "medium", "low"] },
              },
              required: ["title", "description", "priority"],
            },
          },
          economic_indicators: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                current_value: { type: "number" },
                trend: { type: "string", enum: ["up", "down", "stable"] },
                unit: { type: "string" },
              },
              required: ["name", "current_value", "trend", "unit"],
            },
          },
        },
        required: ["market_overview", "swot_analysis", "competitive_landscape", "major_news", "recommendations", "economic_indicators"],
      };

      // Compose prompt and context for the LLM
      const prompt = `Generate a concise JSON market insight for a company in ${INDUSTRY} (${BUSINESS_MODEL}) focused on ${LOCATION}. Use the schema provided. Use tenant CRM stats to tailor recommendations.`;
      const context = [
        `Tenant: ${tenant.name || tenant.tenant_id}`,
        `Industry: ${INDUSTRY}`,
        `Business Model: ${BUSINESS_MODEL}`,
        `Location: ${LOCATION}`,
        `CRM Stats: ${JSON.stringify(tenantStats)}`,
        `Market Overview Seed: ${overview?.slice(0, 1200) || ""}`,
        `News: ${(searchResults || []).map(r => `${r.title}: ${r.snippet || ''}`).join(" | ").slice(0, 1500)}`,
      ];

      // Multi-provider support: resolve provider from body or env
      const provider = body.provider || process.env.MARKET_INSIGHTS_LLM_PROVIDER || process.env.LLM_PROVIDER || "openai";

      // Generate JSON via LLM MCP tool using centralized key resolver with provider
      const apiKey = await resolveLLMApiKey({
        explicitKey: body.api_key || null,
        tenantSlugOrId: tenantId,
        provider,
      });
      if (!apiKey) {
        // Fallback: return a baseline insights object without LLM
        const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').trim();
        const baseline = {
          market_overview: overview || `Market context for ${INDUSTRY} in ${LOCATION}.`,
          swot_analysis: {
            strengths: [
              `${INDUSTRY} demand resilience in ${LOCATION}`,
              `Growing digital adoption in ${LOCATION}`,
            ],
            weaknesses: [
              `Operational costs volatility`,
              `Talent acquisition challenges`,
            ],
            opportunities: [
              `Niche positioning within ${INDUSTRY}`,
              `Automation and AI-driven efficiency`,
            ],
            threats: [
              `Competitive pressure from incumbents and startups`,
              `Regulatory uncertainty`,
            ],
          },
          competitive_landscape: {
            overview: `Competitive environment in ${LOCATION} features both established players and challengers. Differentiate on niche focus and velocity.`,
            major_competitors: (searchResults || []).slice(0, 3).map((r) => r?.title || 'Key competitor'),
            market_dynamics: `Monitor pricing pressure and emerging substitutes; emphasize speed-to-value.`,
          },
          major_news: (searchResults || []).slice(0, 5).map((r) => ({
            title: r?.title || 'Industry update',
            description: strip(r?.snippet || ''),
            date: new Date().toISOString().slice(0, 10),
            impact: 'neutral',
          })),
          recommendations: [
            {
              title: 'Tighten ICP and messaging',
              description: `Focus on segments with strong fit in ${LOCATION}; align outreach with ${INDUSTRY} pain points.`,
              priority: 'high',
            },
            {
              title: 'Double down on pipeline hygiene',
              description: `Improve conversion tracking and deal reviews to increase forecast accuracy.`,
              priority: 'medium',
            },
            ...(tenantStats.activities < 10 ? [{
              title: 'Increase sales activity',
              description: 'Low recent activity detected; run outreach sprints to boost top-of-funnel.',
              priority: 'high',
            }] : []),
            ...(tenantStats.opportunities === 0 ? [{
              title: 'Kickstart opportunities',
              description: 'No active pipeline found; run targeted campaigns and warm intros to seed opportunities.',
              priority: 'high',
            }] : []),
          ],
          economic_indicators: [
            { name: 'GDP Growth', current_value: 2.2, trend: 'up', unit: 'percent' },
            { name: 'Inflation', current_value: 3.1, trend: 'down', unit: 'percent' },
            { name: 'Unemployment', current_value: 4.0, trend: 'stable', unit: 'percent' },
            { name: 'Venture Funding', current_value: 12.5, trend: 'up', unit: 'USD (B)' },
            { name: 'Industry Index', current_value: 108, trend: 'up', unit: 'index' },
          ],
        };
        return res.json({ status: 'success', data: { insights: baseline, model: null, provider: null, usage: null, fallback: true } });
      }

      // API key was resolved successfully - proceed with LLM call
      const SYSTEM = `You are a strict JSON generator. Output ONLY JSON matching the schema. No commentary.`;
      const messages = [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${prompt}\n\nSchema:\n${JSON.stringify(schema)}\n\nContext:\n${context.join("\n")}` },
      ];
      const defaultInsightsModel = pickModel({ capability: "brain_read_only" });
      const model = body.model || defaultInsightsModel;
      const temperature = typeof body.temperature === "number" ? body.temperature : 0.2;

      const result = await generateChatCompletion({
        provider,
        model,
        messages,
        temperature,
        apiKey,
      });

      if (result.status === "error") {
        const http = /api key|not configured/i.test(result.error || '') ? 501 : 500;
        return res.status(http).json({ status: "error", message: result.error });
      }
      let insights = null;
      try { insights = JSON.parse(result.content || "null"); } catch { insights = null; }
      if (!insights) {
        // fallback minimal object
        insights = {
          market_overview: overview || `Market context for ${INDUSTRY} in ${LOCATION}.`,
          swot_analysis: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
          competitive_landscape: { overview: "", major_competitors: [], market_dynamics: "" },
          major_news: [],
          recommendations: [],
          economic_indicators: [],
        };
      }

      return res.json({
        status: "success",
        data: {
          insights,
          model: result.raw?.model || model,
          provider,
          usage: result.raw?.usage || null,
        },
      });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // GET /api/mcp/health-proxy - Backend-mediated health check for external Braid MCP server
  // Provides a stable path for the frontend when direct localhost access is blocked.
  router.get('/health-proxy', async (req, res) => {
    const candidates = [
      // Preferred explicit override
      process.env.MCP_NODE_HEALTH_URL,
      // Common container DNS names (if MCP added to compose or external network)
      'http://braid-mcp-node-server:8000/health',
      'http://braid-mcp-1:8000/health',
      'http://braid-mcp:8000/health',
      // Host gateway (works from inside Docker to host-mapped port)
      'http://host.docker.internal:8000/health',
      // Direct localhost fallback (works when MCP server runs on same host)
      'http://localhost:8000/health',
      'http://127.0.0.1:8000/health',
    ].filter(Boolean);

    const withTimeout = (p, ms) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);

    // Track individual errors for better diagnostics
    const errors = [];
    const attempts = candidates.map(url => (async () => {
      try {
      const t0 = performance.now ? performance.now() : Date.now();
      const resp = await withTimeout(fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }), 3000);
      const dt = (performance.now ? performance.now() : Date.now()) - t0;
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      let data;
      try {
        data = await resp.json();
      } catch {
        throw new Error('invalid_json');
      }
      if (!data || (data.status !== 'ok' && data.status !== 'healthy')) {
        throw new Error('invalid_health_payload');
      }
      return { url, latency_ms: Math.round(dt), data };
      } catch (error) {
        errors.push({ url, error: error.message });
        throw error;
      }
    })());

    try {
      const first = await Promise.any(attempts);
      return res.json({
        status: 'success',
        data: {
          reachable: true,
          url: first.url,
          latency_ms: first.latency_ms,
          raw: first.data,
          attempted: candidates.length
        }
      });
    } catch (err) {
      // Collect all errors for debugging
      const aggregateErrors = err.errors ? err.errors.map(e => ({ message: e.message, stack: e.stack?.split('\n')[0] })) : [];
      console.log('[MCP Health Proxy] All attempts failed:', JSON.stringify(aggregateErrors, null, 2));
      return res.json({
        status: 'success',
        data: {
          reachable: false,
          error: err.message || 'unreachable',
          attempted: candidates.length,
          diagnostics: {
            candidates: candidates,
            errors: aggregateErrors,
            hint: 'Set MCP_NODE_HEALTH_URL env var or ensure one of the default endpoints is reachable'
          }
        }
      });
    }
  });

  // User-Agent for Wikipedia API requests (required by MediaWiki API)
  const WIKIPEDIA_USER_AGENT = 'AishaCRM/1.0 (backend-fallback)';

  // Inline fallback handler for web adapter actions when MCP server is unreachable
  const handleWebActionFallback = async (action) => {
    const resource = action.resource || {};
    const kind = (resource.kind || '').toLowerCase();
    const payload = action.payload || {};

    if (kind === 'wikipedia-search' || kind === 'search_wikipedia') {
      const q = String(payload.q || payload.query || '').trim();
      if (!q) {
        return {
          actionId: action.id,
          status: 'error',
          resource: action.resource,
          errorCode: 'MISSING_QUERY',
          errorMessage: "Query parameter 'q' or 'query' is required",
        };
      }
      try {
        const resp = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(q)}`,
          {
            headers: {
              'User-Agent': WIKIPEDIA_USER_AGENT,
              'Accept': 'application/json'
            }
          }
        );
        const json = await resp.json();
        return {
          actionId: action.id,
          status: 'success',
          resource: action.resource,
          data: json?.query?.search || [],
        };
      } catch (err) {
        return {
          actionId: action.id,
          status: 'error',
          resource: action.resource,
          errorCode: 'WIKIPEDIA_API_ERROR',
          errorMessage: err?.message || String(err),
        };
      }
    }

    if (kind === 'wikipedia-page' || kind === 'get_wikipedia_page') {
      const pageid = String(payload.pageid || payload.pageId || '').trim();
      if (!pageid) {
        return {
          actionId: action.id,
          status: 'error',
          resource: action.resource,
          errorCode: 'MISSING_PAGEID',
          errorMessage: "Parameter 'pageid' is required",
        };
      }
      try {
        const resp = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&pageids=${encodeURIComponent(pageid)}`,
          {
            headers: {
              'User-Agent': WIKIPEDIA_USER_AGENT,
              'Accept': 'application/json'
            }
          }
        );
        const json = await resp.json();
        return {
          actionId: action.id,
          status: 'success',
          resource: action.resource,
          data: json?.query?.pages?.[pageid] || null,
        };
      } catch (err) {
        return {
          actionId: action.id,
          status: 'error',
          resource: action.resource,
          errorCode: 'WIKIPEDIA_API_ERROR',
          errorMessage: err?.message || String(err),
        };
      }
    }

    return null; // Not a web action we can handle
  };

  // POST /api/mcp/run-proxy - Forward MCP action envelope to Braid MCP server from backend (browser-safe)
  router.post('/run-proxy', async (req, res) => {
    const envelope = req.body || {};
    
    // Validate request envelope
    if (!envelope || !envelope.requestId || !envelope.actor || !Array.isArray(envelope.actions)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request envelope: missing requestId, actor, or actions array',
        details: {
          hasRequestId: !!envelope?.requestId,
          hasActor: !!envelope?.actor,
          hasActions: Array.isArray(envelope?.actions),
        }
      });
    }
    
    // Reuse candidates from health proxy for base URL discovery
    const healthCandidates = [
      process.env.MCP_NODE_HEALTH_URL,
      'http://braid-mcp-node-server:8000/health',
      'http://braid-mcp-1:8000/health',
      'http://braid-mcp:8000/health',
      // Host gateway (works from inside Docker to host-mapped port)
      'http://host.docker.internal:8000/health',
      // Direct localhost fallback (works when MCP server runs on same host)
      'http://localhost:8000/health',
      'http://127.0.0.1:8000/health',
    ].filter(Boolean);
    const baseCandidates = healthCandidates.map(u => u.replace(/\/health$/,'')).concat(
      process.env.MCP_NODE_BASE_URL ? [process.env.MCP_NODE_BASE_URL] : []
    );
    const withTimeout = (p, ms) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ]);
    
    const attempts = baseCandidates.map(base => (async () => {
      const url = base.replace(/\/$/, '') + '/mcp/run';
      const t0 = performance.now ? performance.now() : Date.now();
      const resp = await withTimeout(fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope)
      }), 5000);
      const dt = Math.round((performance.now ? performance.now() : Date.now()) - t0);
      if (!resp.ok) throw new Error('bad_status_' + resp.status);
      let json;
      try { json = await resp.json(); } catch { throw new Error('invalid_json'); }
      if (!json || !Array.isArray(json.results)) throw new Error('invalid_mcp_response');
      return { base, duration_ms: dt, response: json };
    })());
    try {
      const first = await Promise.any(attempts);
      return res.json({ status: 'success', data: { base: first.base, duration_ms: first.duration_ms, results: first.response.results } });
    } catch (err) {
      // MCP server unreachable - try inline fallback for supported adapters
      const actions = Array.isArray(envelope.actions) ? envelope.actions : [];
      const fallbackResults = [];
      let allHandled = true;

      for (const action of actions) {
        const system = (action.resource?.system || '').toLowerCase();
        
        if (system === 'web') {
          const result = await handleWebActionFallback(action);
          if (result) {
            fallbackResults.push(result);
          } else {
            allHandled = false;
            break;
          }
        } else {
          // Cannot handle this adapter inline
          allHandled = false;
          break;
        }
      }

      if (allHandled && fallbackResults.length > 0) {
        return res.json({
          status: 'success',
          data: {
            base: 'inline-fallback',
            duration_ms: 0,
            results: fallbackResults,
            fallback: true
          }
        });
      }

      // No fallback available - return original error
      return res.status(502).json({ status: 'error', message: 'MCP run-proxy failed', error: err.message, attempted: baseCandidates });
    }
  });

  return router;
}
