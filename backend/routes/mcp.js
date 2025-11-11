/**
 * MCP (Model Context Protocol) Routes
 * Server discovery, tool execution, resource management
 */

import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

export default function createMCPRoutes(pgPool, braidModules = []) {
  const router = express.Router();

  // Initialize Supabase client for direct DB queries
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

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

      // Add Braid MCP server - exposes all loaded Braid functions
      const braidTools = [];
      const braidFunctions = [];
      for (const mod of braidModules) {
        if (mod.error || !mod.hir || !mod.hir.functions) continue;
        for (const fn of mod.hir.functions) {
          const toolName = `braid.${fn.name}`;
          braidTools.push(toolName);
          braidFunctions.push({
            name: fn.name,
            params: fn.params,
            returnType: fn.returnType,
            effects: fn.effects || [],
            module: mod.file
          });
        }
      }
      
      servers.push({
        id: "braid",
        name: "Braid MCP",
        type: "mcp",
        transport: "proxy",
        configured: true,
        healthy: true,
        capabilities: braidTools,
        functions: braidFunctions,
        modules: braidModules.length
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
          const like = `%${q}%`;
          const rows = await pgPool.query(
            `SELECT * FROM accounts WHERE tenant_id = $1 AND ($2 = '' OR name ILIKE $3 OR industry ILIKE $3 OR website ILIKE $3)
             ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
            [tenant_id, q, like, limit, offset],
          );
          return res.json({ status: "success", data: rows.rows });
        }

        if (tool_name === "crm.search_contacts") {
          const q = String(parameters?.q || "").trim();
          const like = `%${q}%`;
          const rows = await pgPool.query(
            `SELECT * FROM contacts WHERE tenant_id = $1 AND ($2 = '' OR first_name ILIKE $3 OR last_name ILIKE $3 OR email ILIKE $3)
             ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
            [tenant_id, q, like, limit, offset],
          );
          return res.json({ status: "success", data: rows.rows });
        }

        if (tool_name === "crm.search_leads") {
          const q = String(parameters?.q || "").trim();
          const like = `%${q}%`;
          const rows = await pgPool.query(
            `SELECT * FROM leads WHERE tenant_id = $1 AND ($2 = '' OR first_name ILIKE $3 OR last_name ILIKE $3 OR email ILIKE $3 OR company ILIKE $3)
             ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
            [tenant_id, q, like, limit, offset],
          );
          return res.json({ status: "success", data: rows.rows });
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
          const row = await pgPool.query(
            `SELECT * FROM ${table} WHERE id = $1 AND tenant_id = $2`,
            [id, tenant_id],
          );
          return res.json({ status: "success", data: row.rows?.[0] || null });
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
          const row = await pgPool.query(
            `INSERT INTO activities (tenant_id, type, subject, body, related_id, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
            [
              tenant_id,
              type,
              subject || null,
              body || null,
              related_id || null,
              metadata ? JSON.stringify(metadata) : "{}",
            ],
          );
          return res.json({ status: "success", data: row.rows?.[0] });
        }

        if (tool_name === "crm.get_tenant_stats") {
          // Use Supabase client API for accurate counts (bypasses pgPool RLS issues)
          const [accounts, contacts, leads, opps, activities] = await Promise
            .all([
              supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
              supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
              supabase.from('leads').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
              supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
              supabase.from('activities').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant_id),
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

      // Braid MCP - Execute transpiled Braid functions
      if (server_id === "braid") {
        // Extract function name from tool_name (e.g., "braid.score_lead" -> "score_lead")
        const functionName = tool_name.replace(/^braid\./, '');
        
        // Find the module containing this function
        let targetModule = null;
        let targetFunction = null;
        
        for (const mod of braidModules) {
          if (mod.error || !mod.hir || !mod.hir.functions) continue;
          const fn = mod.hir.functions.find(f => f.name === functionName);
          if (fn) {
            targetModule = mod;
            targetFunction = fn;
            break;
          }
        }
        
        if (!targetModule || !targetFunction) {
          return res.status(404).json({
            status: "error",
            message: `Braid function not found: ${functionName}`,
          });
        }
        
        // Import the transpiled module
        try {
          const { pathToFileURL } = await import('url');
          const jsModule = await import(pathToFileURL(targetModule.jsPath).href);
          const transpiledFn = jsModule[functionName];
          
          if (!transpiledFn) {
            return res.status(501).json({
              status: "error",
              message: `Braid function '${functionName}' not transpiled`,
            });
          }
          
          // Parse parameters and call function
          const args = [];
          if (targetFunction.params && targetFunction.params.length > 0) {
            const paramNames = targetFunction.params
              .split(',')
              .map(p => p.trim().split(':')[0].trim())
              .filter(name => name.length > 0);
            
            for (const paramName of paramNames) {
              const value = parameters?.[paramName];
              args.push(value);
            }
          }
          
          console.log(`[MCP Braid] Calling ${functionName} with args:`, args);
          const result = await transpiledFn(...args);
          console.log(`[MCP Braid] Result from ${functionName}:`, result);
          
          return res.json({
            status: "success",
            data: result,
            function: functionName,
            module: targetModule.file
          });
        } catch (err) {
          console.error(`[MCP Braid] Error executing ${functionName}:`, err);
          return res.status(500).json({
            status: "error",
            message: err.message,
            function: functionName
          });
        }
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

  return router;
}
