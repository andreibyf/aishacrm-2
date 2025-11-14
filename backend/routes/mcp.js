/**
 * MCP (Model Context Protocol) Routes
 * Server discovery, tool execution, resource management
 */

import express from "express";
import fetch from "node-fetch";
import { getSupabaseClient } from "../lib/supabase-db.js";
import { createChatCompletion } from "../lib/aiProvider.js";

export default function createMCPRoutes(pgPool) {
  const router = express.Router();
  const supa = getSupabaseClient();

  // Minimal OpenAI API key resolution for LLM MCP tools
  const resolveOpenAIKey = async ({ explicitKey, tenantId }) => {
    if (explicitKey) return explicitKey;
    // Try tenant integration first (openai_llm)
    if (tenantId) {
      try {
        const { data: ti, error } = await supa
          .from("tenant_integrations")
          .select("api_credentials, integration_type")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .in("integration_type", ["openai_llm"])
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw error;
        if (ti?.length) {
          const creds = ti[0].api_credentials || {};
          const k = creds.api_key || creds.apiKey || null;
          if (k) return k;
        }
      } catch (e) {
        // non-fatal
        void e;
      }
    }
    // Fallback to system settings table
    try {
      const { data, error } = await supa
        .from("system_settings")
        .select("settings")
        .not("settings", "is", null)
        .limit(1);
      if (error) throw error;
      if (data?.length) {
        const settings = data[0].settings;
        const systemOpenAI = typeof settings === "object"
          ? settings.system_openai_settings
          : JSON.parse(settings || "{}").system_openai_settings;
        if (systemOpenAI?.enabled && systemOpenAI?.openai_api_key) {
          return systemOpenAI.openai_api_key;
        }
      }
    } catch (e) {
      void e;
    }
    return null;
  };

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
          const { data, error } = await supa
            .from('activities')
            .insert({
              tenant_id,
              type,
              subject: subject || null,
              body: body || null,
              related_id: related_id || null,
              metadata: metadata || {},
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
          model = process.env.DEFAULT_OPENAI_MODEL || "gpt-4o-mini",
          temperature = 0.2,
          api_key,
          tenant_id: tenantIdParam,
        } = parameters || {};

        // Resolve key: explicit > tenant integration > system settings
        const apiKey = await resolveOpenAIKey({ explicitKey: api_key, tenantId: tenantIdParam });
        if (!apiKey) {
          return res.status(501).json({ status: "error", message: "OpenAI API key not configured" });
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

        const result = await createChatCompletion({ messages, model, temperature, apiKey });
        if (result.status === "error") {
          const http = /OPENAI_API_KEY|not configured/i.test(result.error || '') ? 501 : 500;
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
        return res.json({ status: "success", data: { json: jsonOut, raw: result.content, model: result.model, usage: result.usage } });
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

      // Generate JSON via LLM MCP tool (internally call our facade directly)
      const apiKey = await resolveOpenAIKey({ explicitKey: body.api_key || null, tenantId });
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
        return res.json({ status: 'success', data: { insights: baseline, model: null, usage: null, fallback: true } });
      }

      const SYSTEM = `You are a strict JSON generator. Output ONLY JSON matching the schema. No commentary.`;
      const messages = [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${prompt}\n\nSchema:\n${JSON.stringify(schema)}\n\nContext:\n${context.join("\n")}` },
      ];
      const model = body.model || process.env.DEFAULT_OPENAI_MODEL || "gpt-4o-mini";
      const temperature = typeof body.temperature === "number" ? body.temperature : 0.2;
      const result = await createChatCompletion({ messages, model, temperature, apiKey });
      if (result.status === "error") {
        const http = /OPENAI_API_KEY|not configured/i.test(result.error || '') ? 501 : 500;
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

      return res.json({ status: "success", data: { insights, model: result.model, usage: result.usage } });
    } catch (error) {
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  return router;
}
