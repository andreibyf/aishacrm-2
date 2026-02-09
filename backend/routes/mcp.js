/**
 * MCP (Model Context Protocol) Routes
 * Server discovery, tool execution, resource management
 */

import express from "express";
import fetch from "node-fetch";
import { getSupabaseClient } from "../lib/supabase-db.js";
// Import auth middleware to require an authenticated user for admin routes.
import { requireAuthCookie } from "../middleware/authCookie.js";
import { authenticateRequest } from "../middleware/authenticate.js";
import { requireSuperAdminRole } from "../middleware/validateTenant.js";
import { resolveLLMApiKey, generateChatCompletion, selectLLMConfigForTenant } from "../lib/aiEngine/index.js";
import { logLLMActivity } from "../lib/aiEngine/activityLogger.js";
import { executeMcpToolViaBraid, getExecutionStrategy } from "../lib/braidMcpBridge.js";
import logger from '../lib/logger.js';

// Admin helper: restrict access to users with emails defined in ADMIN_EMAILS env variable.
// Requires req.user to be set by requireAuthCookie middleware
function _requireAdmin(req, res, next) {
  // Check if user is authenticated (requireAuthCookie should set req.user)
  if (!req.user || !req.user.email) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized - authentication required"
    });
  }

  const userEmail = req.user.email;

  // Parse allowlist from env; split by comma, trim whitespace, lowercase.
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Debug logging
  logger.debug('[MCP Admin] Auth check:', {
    userEmail,
    isInAdminList: allow.includes(userEmail.toLowerCase()),
    adminEmailsCount: allow.length
  });

  // If no allowlist configured, deny by default.
  if (allow.length === 0) {
    return res.status(403).json({
      status: "error",
      message: "Admin access not configured (ADMIN_EMAILS missing)"
    });
  }

  const email = String(userEmail).toLowerCase();
  if (!allow.includes(email)) {
    return res.status(403).json({
      status: "error",
      message: "Forbidden - not authorized as admin"
    });
  }

  return next();
}

// Helper to resolve the MCP base URL. Falls back to localhost for local MCP.
function getMcpBaseUrl() {
  return process.env.BRAID_MCP_URL || "http://127.0.0.1:8000";
}

/**
 * callLLMWithFailover
 * 
 * Attempts to call the LLM with automatic failover between providers.
 * Primary provider is tried first; on failure, falls back to secondary.
 * 
 * Failover logic:
 * - If primary = "anthropic" -> secondary = "openai"
 * - Otherwise -> secondary = "anthropic"
 * 
 * @param {Object} opts
 * @param {string} [opts.tenantId] - Tenant identifier for key/model resolution
 * @param {Array} opts.messages - OpenAI-style messages
 * @param {string} [opts.capability] - Model capability ("json_strict", "chat_tools", etc.)
 * @param {number} [opts.temperature] - Temperature for completion
 * @param {string} [opts.explicitModel] - Override model
 * @param {string} [opts.explicitProvider] - Override provider
 * @param {string} [opts.explicitApiKey] - Override API key
 * @returns {Promise<{ ok: boolean, result?: object, provider?: string, model?: string, error?: string }>}
 */
async function callLLMWithFailover({
  tenantId,
  messages,
  capability = "json_strict",
  temperature = 0.2,
  explicitModel = null,
  explicitProvider = null,
  explicitApiKey = null,
} = {}) {
  // Get base config from tenant settings
  const baseConfig = selectLLMConfigForTenant({
    capability,
    tenantSlugOrId: tenantId,
    overrideModel: explicitModel,
    providerOverride: explicitProvider,
  });

  // Determine primary and secondary providers
  const primaryProvider = explicitProvider || baseConfig.provider || process.env.LLM_PROVIDER || "openai";
  const secondaryProvider = primaryProvider === "anthropic" ? "openai" : "anthropic";

  // Build candidate list: primary first, then secondary
  const candidates = [
    { provider: primaryProvider, model: explicitModel || baseConfig.model },
    { provider: secondaryProvider, model: null }, // Will use default for this provider
  ];

  const errors = [];

  const totalAttempts = candidates.length;

  for (let attemptIndex = 0; attemptIndex < candidates.length; attemptIndex++) {
    const candidate = candidates[attemptIndex];
    const provider = candidate.provider;
    const attempt = attemptIndex + 1;

    // Get model for this provider
    let model = candidate.model;
    if (!model) {
      const cfg = selectLLMConfigForTenant({
        capability,
        tenantSlugOrId: tenantId,
        providerOverride: provider,
      });
      model = cfg.model;
    }

    // Resolve API key for this provider
    const apiKey = await resolveLLMApiKey({
      explicitKey: explicitApiKey,
      tenantSlugOrId: tenantId,
      provider,
    });

    if (!apiKey) {
      errors.push({ provider, error: `No API key for provider ${provider}` });
      // Log missing key with structured format
      logLLMActivity({
        tenantId,
        capability,
        provider,
        model,
        nodeId: "mcp:callLLMWithFailover",
        status: "error",
        error: `No API key for provider ${provider}`,
        attempt,
        totalAttempts,
      });
      continue;
    }

    // Attempt the call
    const startTime = Date.now();
    const result = await generateChatCompletion({
      provider,
      model,
      messages,
      temperature,
      apiKey,
    });
    const durationMs = Date.now() - startTime;

    if (result.status === "success") {
      // Log successful LLM activity with attempt info
      logLLMActivity({
        tenantId,
        capability,
        provider,
        model: result.raw?.model || model,
        nodeId: "mcp:callLLMWithFailover",
        status: errors.length > 0 ? "failover" : "success",
        durationMs,
        usage: result.raw?.usage || null,
        attempt,
        totalAttempts,
      });

      return {
        ok: true,
        result,
        provider,
        model: result.raw?.model || model,
        usage: result.raw?.usage || null,
      };
    }

    // Log failure and continue to next candidate
    errors.push({ provider, error: result.error });

    // Log failed attempt with structured format
    logLLMActivity({
      tenantId,
      capability,
      provider,
      model,
      nodeId: "mcp:callLLMWithFailover",
      status: "error",
      durationMs,
      error: result.error,
      attempt,
      totalAttempts,
    });
  }

  // All candidates failed
  return {
    ok: false,
    error: errors.map((e) => `${e.provider}: ${e.error}`).join("; "),
    errors,
  };
}

export default function createMCPRoutes(_pgPool) {
  const router = express.Router();
  
  // Lazy-load Supabase client to avoid initialization errors when credentials not configured
  const getSupa = () => getSupabaseClient();

  // API key resolution now handled by centralized lib/aiEngine/keyResolver.js

  /**
   * @openapi
   * /api/mcp/servers:
   *   get:
   *     summary: List available MCP servers
   *     tags: [integrations]
   *     description: Returns list of registered MCP (Model Context Protocol) servers with their capabilities
   *     responses:
   *       200:
   *         description: List of MCP servers
   * /api/mcp/execute-tool:
   *   post:
   *     summary: Execute MCP tool
   *     tags: [integrations]
   *     description: Execute a tool on an MCP server. Routes through Braid bridge for orchestration.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [serverName, toolName, arguments]
   *             properties:
   *               serverName: { type: string, example: aishadb }
   *               toolName: { type: string, example: find_accounts }
   *               arguments: { type: object }
   *     responses:
   *       200:
   *         description: Tool execution result
   *       400:
   *         description: Invalid request
   *       500:
   *         description: Tool execution failed
   * /api/mcp/resources:
   *   get:
   *     summary: List MCP resources
   *     tags: [integrations]
   *     description: Returns available resources from MCP servers
   *     responses:
   *       200:
   *         description: List of MCP resources
   * /api/mcp/config-status:
   *   get:
   *     summary: Get MCP configuration status
   *     tags: [integrations]
   *     description: Returns status of MCP servers and configuration
   *     responses:
   *       200:
   *         description: Configuration status
   * /api/mcp/admin/status:
   *   get:
   *     summary: Get MCP admin status (superadmin only)
   *     tags: [integrations]
   *     security:\n   *       - bearerAuth: []\n   *     description: Get detailed MCP server status and health - requires superadmin role
   *     responses:
   *       200:
   *         description: Admin status details
   *       403:
   *         description: Forbidden - superadmin required
   * /api/mcp/market-insights:
   *   post:
   *     summary: Get market insights using MCP tools
   *     tags: [integrations]
   *     description: Fetches market insights for accounts using MCP AI tools
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               accountId: { type: string }\n   *               company: { type: string }
   *     responses:
   *       200:
   *         description: Market insights data
   */

  // GET /api/mcp/servers - List available MCP servers
  router.get("/servers", async (req, res) => {
    try {
      const _supa = getSupa();
      const servers = [];

      // GitHub MCP server presence is inferred via env token. This is a lightweight proxy/health integration.
      const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN ||
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

  // Admin: consolidated MCP status (health + memory + queue + adapters)
  // Requires authentication (Supabase JWT or cookie) and superadmin role
  router.get("/admin/status", authenticateRequest, requireSuperAdminRole, async (_req, res) => {
    const base = getMcpBaseUrl();
    try {
      // Concurrently fetch health, memory, queue stats, and adapter list from MCP.
      const [health, memory, queue, adapters] = await Promise.all([
        fetch(`${base}/health`).then((r) => r.json()),
        fetch(`${base}/memory/status`).then((r) => r.json()),
        fetch(`${base}/queue/stats`).then((r) => r.json()).catch(() => ({ status: 'error' })),
        fetch(`${base}/adapters`).then((r) => r.json()),
      ]);
      return res.json({
        status: "ok",
        mcpBaseUrl: base,
        health,
        memory,
        queue,
        adapters,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      return res.status(502).json({
        status: "error",
        message: "Failed to reach MCP locally",
        detail: e?.message || String(e),
        mcpBaseUrl: base,
      });
    }
  });

  // GET /api/mcp/config-status - Get MCP configuration status
  // Returns status of required secrets without exposing actual values
  router.get("/config-status", async (req, res) => {
    try {
      // Required secrets for MCP server
      const requiredSecrets = [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_ANON_KEY',
        'OPENAI_API_KEY',
        'DEFAULT_OPENAI_MODEL',
        'DEFAULT_TENANT_ID'
      ];

      // Optional secrets (warn if missing, but not critical)
      const optionalSecrets = [
        'CRM_BACKEND_URL',
        'GITHUB_TOKEN',
        'GH_TOKEN'
      ];

      // Check if Doppler is enabled (optional - not required for production)
      const dopplerEnabled = !!process.env.DOPPLER_TOKEN;
      const dopplerInfo = dopplerEnabled ? {
        enabled: true,
        project: process.env.DOPPLER_PROJECT || 'unknown',
        config: process.env.DOPPLER_CONFIG || 'unknown'
      } : {
        enabled: false,
        note: 'Doppler is optional - production can use environment variables directly'
      };

      // Helper function to safely mask secret values
      const maskSecret = (value) => {
        if (!value) return null;
        // Show first 4 chars for secrets 8+ chars, otherwise just show asterisks
        if (value.length >= 8) {
          return `${value.substring(0, 4)}${'*'.repeat(Math.min(value.length - 4, 20))}`;
        }
        return '*'.repeat(5); // Don't expose short secrets
      };

      // Build status for each secret
      const secrets = {};
      
      for (const secretName of requiredSecrets) {
        const value = process.env[secretName];
        secrets[secretName] = {
          configured: !!value,
          source: value ? (dopplerEnabled ? 'doppler' : 'env') : 'missing',
          masked: maskSecret(value),
          required: true
        };
      }

      for (const secretName of optionalSecrets) {
        const value = process.env[secretName];
        secrets[secretName] = {
          configured: !!value,
          source: value ? (dopplerEnabled ? 'doppler' : 'env') : 'missing',
          masked: maskSecret(value),
          required: false
        };
      }

      // Calculate summary
      const totalRequired = requiredSecrets.length;
      const configuredRequired = requiredSecrets.filter(s => !!process.env[s]).length;
      const missingRequired = requiredSecrets.filter(s => !process.env[s]);

      res.json({
        status: 'success',
        data: {
          environment: process.env.NODE_ENV || 'development',
          doppler: dopplerInfo,
          secrets,
          summary: {
            totalRequired,
            configuredRequired,
            missingRequired,
            allConfigured: missingRequired.length === 0
          },
          notes: {
            doppler: 'Doppler is optional - environment variables can be managed directly in production',
            redisPolicy: 'Redis eviction policy "allkeys-lru" is expected for cache workloads'
          }
        }
      });
    } catch (error) {
      res.status(500).json({ 
        status: "error", 
        message: error.message 
      });
    }
  });

  // POST /api/mcp/execute-tool - Execute MCP tool
  router.post("/execute-tool", async (req, res) => {
    const supa = getSupa();
    try {
      const { server_id, tool_name, parameters } = req.body || {};

      if (server_id === "github") {
        const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN ||
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
        // ========== BRAID BRIDGE ROUTING ==========
        // Route eligible CRM tools through Braid for unified policy enforcement,
        // caching, and audit logging. Native implementations below are kept for
        // tools not yet migrated to Braid (workflows, templates, etc.)
        const executionStrategy = getExecutionStrategy(tool_name);
        
        if (executionStrategy === 'braid') {
          const { tenant_id } = parameters || {};
          if (!tenant_id) {
            return res.status(400).json({
              status: "error",
              message: "tenant_id is required",
            });
          }
          
          // Build tenant record for Braid execution
          const tenantRecord = { id: tenant_id, tenant_id };
          const userId = req.user?.id || req.headers['x-user-id'] || null;
          
          logger.debug('[MCP→Braid] Routing through Braid bridge', {
            tool: tool_name,
            strategy: executionStrategy,
            tenantId: tenant_id?.substring(0, 8),
          });
          
          const result = await executeMcpToolViaBraid(tool_name, parameters, tenantRecord, userId);
          
          if (result.status === 'success') {
            return res.json(result);
          } else {
            return res.status(400).json(result);
          }
        }
        // ========== END BRAID BRIDGE ROUTING ==========
        
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

        // Use callLLMWithFailover for automatic provider failover
        const failoverResult = await callLLMWithFailover({
          tenantId: tenantIdParam,
          messages,
          capability: "json_strict",
          temperature,
          explicitModel: model,
          explicitProvider: providerParam,
          explicitApiKey: api_key,
        });

        if (!failoverResult.ok) {
          const isKeyError = /api key|not configured/i.test(failoverResult.error || '');
          return res.status(isKeyError ? 501 : 500).json({ status: "error", message: failoverResult.error });
        }

        // Parse JSON from result
        let jsonOut = null;
        try {
          jsonOut = JSON.parse(failoverResult.result.content || "null");
        } catch {
          // try to extract JSON block heuristically
          const match = (failoverResult.result.content || "").match(/\{[\s\S]*\}\s*$/);
          if (match) {
            try { jsonOut = JSON.parse(match[0]); } catch { jsonOut = null; }
          }
        }

        return res.json({
          status: "success",
          data: {
            json: jsonOut,
            raw: failoverResult.result.content,
            model: failoverResult.model,
            provider: failoverResult.provider,
            usage: failoverResult.usage,
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
      const githubToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN ||
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
    const supa = getSupa();
    try {
      // User-Agent required by Wikipedia/MediaWiki API policy
      const WIKIPEDIA_USER_AGENT = 'AishaCRM/1.0 (market-insights; contact@aishacrm.com)';

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

      // Human-readable label maps (mirrors frontend AIMarketInsights.jsx)
      const INDUSTRY_LABELS = {
        accounting_and_finance: "Accounting & Finance", aerospace_and_defense: "Aerospace & Defense",
        agriculture_and_farming: "Agriculture & Farming", automotive_and_transportation: "Automotive & Transportation",
        banking_and_financial_services: "Banking & Financial Services", biotechnology_and_pharmaceuticals: "Biotechnology & Pharmaceuticals",
        chemicals_and_materials: "Chemicals & Materials", construction_and_engineering: "Construction & Engineering",
        consulting_and_professional_services: "Consulting & Professional Services", consumer_goods_and_retail: "Consumer Goods & Retail",
        cybersecurity: "Cybersecurity", data_analytics_and_business_intelligence: "Data Analytics & Business Intelligence",
        education_and_training: "Education & Training", energy_oil_and_gas: "Energy, Oil & Gas",
        entertainment_and_media: "Entertainment & Media", environmental_services: "Environmental Services",
        event_management: "Event Management", fashion_and_apparel: "Fashion & Apparel",
        food_and_beverage: "Food & Beverage", franchising: "Franchising",
        gaming_and_esports: "Gaming & Esports", government_and_public_sector: "Government & Public Sector",
        green_energy_and_solar: "Green Energy & Solar", healthcare_and_medical_services: "Healthcare & Medical Services",
        hospitality_and_tourism: "Hospitality & Tourism", human_resources_and_staffing: "Human Resources & Staffing",
        information_technology_and_software: "Information Technology & Software", insurance: "Insurance",
        interior_design_and_architecture: "Interior Design & Architecture", legal_services: "Legal Services",
        logistics_and_supply_chain: "Logistics & Supply Chain", manufacturing_industrial: "Manufacturing (Industrial)",
        marketing_advertising_and_pr: "Marketing, Advertising & PR", mining_and_metals: "Mining & Metals",
        nonprofit_and_ngos: "Nonprofit & NGOs", packaging_and_printing: "Packaging & Printing",
        pharmaceuticals: "Pharmaceuticals", real_estate_and_property_management: "Real Estate & Property Management",
        renewable_energy: "Renewable Energy", research_and_development: "Research & Development",
        retail_and_wholesale: "Retail & Wholesale", robotics_and_automation: "Robotics & Automation",
        saas_and_cloud_services: "SaaS & Cloud Services", security_services: "Security Services",
        social_media_and_influencer: "Social Media & Influencer", sports_and_recreation: "Sports & Recreation",
        telecommunications: "Telecommunications", textiles_and_apparel: "Textiles & Apparel",
        transportation_and_delivery: "Transportation & Delivery", utilities_water_and_waste: "Utilities (Water & Waste)",
        veterinary_services: "Veterinary Services", warehousing_and_distribution: "Warehousing & Distribution",
        wealth_management: "Wealth Management", other: "Other",
      };
      const GEOGRAPHIC_LABELS = {
        north_america: "North America", europe: "Europe", asia: "Asia",
        south_america: "South America", africa: "Africa", oceania: "Oceania", global: "Global",
      };
      // Fallback: convert snake_case to Title Case if not in label map
      const humanize = (val, labels) => {
        if (!val) return null;
        if (labels[val]) return labels[val];
        // Check if body already sent a human-readable label
        if (val.includes(' ') || /[A-Z]/.test(val)) return val;
        return val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      };

      const rawIndustry = tenant.industry || body.industry || "saas_and_cloud_services";
      const rawGeo = tenant.geographic_focus || body.geographic_focus || "north_america";
      const INDUSTRY = humanize(rawIndustry, INDUSTRY_LABELS) || "SaaS & Cloud Services";
      const BUSINESS_MODEL = (tenant.business_model || body.business_model || "B2B").toUpperCase();
      const GEO = humanize(rawGeo, GEOGRAPHIC_LABELS) || "North America";
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
      let searchResults = [];
      let overview = "";

      try {
        const searchResp = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(searchQ)}`,
          {
            headers: {
              'User-Agent': WIKIPEDIA_USER_AGENT,
              'Accept': 'application/json'
            }
          }
        );
        if (searchResp.ok) {
          const searchJson = await searchResp.json();
          searchResults = searchJson?.query?.search || [];
        }
      } catch (wikiErr) {
        logger.warn('[market-insights] Wikipedia search failed:', wikiErr?.message);
        // Continue with empty results - LLM will generate baseline content
      }

      if (searchResults.length) {
        const first = searchResults[0];
        const pageid = String(first.pageid);
        try {
          const pageResp = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&format=json&pageids=${encodeURIComponent(pageid)}`,
            {
              headers: {
                'User-Agent': WIKIPEDIA_USER_AGENT,
                'Accept': 'application/json'
              }
            }
          );
          if (pageResp.ok) {
            const pageJson = await pageResp.json();
            overview = pageJson?.query?.pages?.[pageid]?.extract || "";
          }
        } catch {
          overview = "";
        }
      }

      // Build JSON schema for insights
      const schema = {
        type: "object",
        properties: {
          executive_summary: { type: "string", description: "3-4 sentence executive summary with critical insights and recommended immediate actions" },
          market_overview: { type: "string", description: "Detailed 2-3 paragraph market overview with size, growth trajectory, and dynamics" },
          swot_analysis: {
            type: "object",
            properties: {
              strengths: { type: "array", items: { type: "string" }, minItems: 4 },
              weaknesses: { type: "array", items: { type: "string" }, minItems: 4 },
              opportunities: { type: "array", items: { type: "string" }, minItems: 4 },
              threats: { type: "array", items: { type: "string" }, minItems: 4 },
            },
            required: ["strengths", "weaknesses", "opportunities", "threats"],
          },
          competitive_landscape: {
            type: "object",
            properties: {
              overview: { type: "string" },
              major_competitors: { type: "array", items: { type: "string" } },
              market_dynamics: { type: "string" },
              competitive_advantages: { type: "string", description: "How this company can differentiate" },
            },
            required: ["overview", "major_competitors", "market_dynamics"],
          },
          industry_trends: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                impact: { type: "string", enum: ["high", "medium", "low"] },
                timeframe: { type: "string" },
              },
              required: ["name", "description", "impact"],
            },
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
                action_items: { type: "array", items: { type: "string" }, description: "2-3 concrete steps to execute this recommendation" },
                timeline: { type: "string", description: "One of: immediate, short-term (1-3 months), medium-term (3-6 months), long-term (6-12 months)" },
                expected_impact: { type: "string", description: "Specific expected business outcome with metrics where possible" },
              },
              required: ["title", "description", "priority", "action_items", "timeline", "expected_impact"],
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
        required: ["executive_summary", "market_overview", "swot_analysis", "competitive_landscape", "industry_trends", "major_news", "recommendations", "economic_indicators"],
      };

      // Compose prompt and context for the LLM
      const prompt = `Generate a comprehensive, data-driven market intelligence report in JSON format for a company operating in ${INDUSTRY} (${BUSINESS_MODEL} model) in ${LOCATION}.

Requirements:
1. EXECUTIVE SUMMARY: Write a 3-4 sentence executive summary highlighting the most critical market insights and recommended immediate actions specific to ${INDUSTRY}.
2. MARKET OVERVIEW: Provide a detailed 2-3 paragraph overview of current market conditions, estimated market size, growth trajectory, and key dynamics specific to ${INDUSTRY} in ${LOCATION}. Include approximate market size figures where possible.
3. SWOT ANALYSIS: Provide 4-5 specific, actionable items per quadrant. Reference actual market conditions, real competitors, and concrete trends. Avoid generic business platitudes.
4. COMPETITIVE LANDSCAPE: Name real companies operating in ${INDUSTRY} in ${LOCATION}. Describe specific competitive positioning and differentiation strategies.
5. INDUSTRY TRENDS: Identify 4-5 major trends reshaping ${INDUSTRY} with specific implications and timeframes.
6. MAJOR NEWS: Reference realistic recent industry events with specific impact assessments.
7. ECONOMIC INDICATORS: Provide realistic economic indicators specifically relevant to ${INDUSTRY} and ${LOCATION}.
8. STRATEGIC RECOMMENDATIONS: Provide 4-6 highly specific, actionable recommendations tailored to this company. Each MUST include concrete action_items (2-3 specific steps), a timeline, and expected_impact with quantified outcomes where possible.

CRM data: The company has ${tenantStats.accounts} accounts, ${tenantStats.contacts} contacts, ${tenantStats.leads} leads, ${tenantStats.opportunities} opportunities, and ${tenantStats.activities} activities. Use this to tailor recommendations — if pipeline is thin, focus on lead gen; if leads are high but opps low, focus on conversion; if activity is low, recommend outreach campaigns.

Be SPECIFIC to ${INDUSTRY} in ${LOCATION}. Do NOT provide generic advice like "improve communication" or "invest in technology". Every insight must be actionable within the context of a ${BUSINESS_MODEL} ${INDUSTRY} company.`;
      const context = [
        `Tenant: ${tenant.name || tenant.tenant_id}`,
        `Industry: ${INDUSTRY}`,
        `Business Model: ${BUSINESS_MODEL}`,
        `Location: ${LOCATION}`,
        `CRM Stats: ${JSON.stringify(tenantStats)}`,
        `Market Overview Seed: ${overview?.slice(0, 1200) || ""}`,
        `News: ${(searchResults || []).map(r => `${r.title}: ${r.snippet || ''}`).join(" | ").slice(0, 1500)}`,
      ];

      // Build messages for LLM call
      const SYSTEM = `You are an expert market intelligence analyst that outputs ONLY valid JSON matching the provided schema. No commentary, no markdown, no explanations — only the JSON object. Be specific, data-driven, and avoid generic business platitudes. Every insight must be tailored to the specific industry, location, and company data provided.`;
      const messages = [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${prompt}\n\nSchema:\n${JSON.stringify(schema)}\n\nContext:\n${context.join("\n")}` },
      ];
      const temperature = typeof body.temperature === "number" ? body.temperature : 0.3;

      // Use callLLMWithFailover for automatic provider failover
      const failoverResult = await callLLMWithFailover({
        tenantId,
        messages,
        capability: "brain_read_only",
        temperature,
        explicitModel: body.model,
        explicitProvider: body.provider,
        explicitApiKey: body.api_key,
      });

      // Build fallback baseline helper
      const buildBaseline = () => {
        const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').trim();
        return {
          executive_summary: `The ${INDUSTRY} market in ${LOCATION} presents significant opportunities for ${BUSINESS_MODEL} companies. Current analysis of ${tenantStats.accounts} accounts and ${tenantStats.opportunities} active pipeline opportunities suggests immediate priorities should include pipeline development, conversion optimization, and targeted market expansion within ${INDUSTRY} segments.`,
          market_overview: `The ${INDUSTRY} market in ${LOCATION} continues to evolve with changing economic conditions and technological advancements. Key drivers include infrastructure investment, digital transformation, and workforce development initiatives. ${BUSINESS_MODEL} companies in this sector are navigating supply chain dynamics, regulatory requirements, and competitive pressures while capitalizing on regional growth opportunities. Market maturity varies across sub-segments, with emerging niches offering the strongest growth potential for agile operators.`,
          swot_analysis: {
            strengths: [
              `Established presence in ${INDUSTRY} market in ${LOCATION}`,
              `${BUSINESS_MODEL} model enables scalable customer acquisition and retention`,
              `Growing digital adoption creating new engagement channels`,
              `Regional market knowledge and existing relationship networks`,
            ],
            weaknesses: [
              `Operational costs volatility in current ${INDUSTRY} market conditions`,
              `Talent acquisition and retention challenges in ${LOCATION}`,
              `Pipeline diversity needs improvement (${tenantStats.opportunities} active opportunities)`,
              `Potential over-reliance on existing customer base of ${tenantStats.accounts} accounts`,
            ],
            opportunities: [
              `Niche positioning within underserved ${INDUSTRY} segments in ${LOCATION}`,
              `AI and automation-driven efficiency gains in sales and operations`,
              `Strategic partnerships with complementary ${INDUSTRY} service providers`,
              `Expansion into adjacent markets leveraging existing ${INDUSTRY} expertise`,
            ],
            threats: [
              `Competitive pressure from both incumbents and well-funded startups in ${INDUSTRY}`,
              `Regulatory changes affecting ${INDUSTRY} operations in ${LOCATION}`,
              `Economic headwinds impacting customer spending patterns`,
              `Technology disruption reshaping ${INDUSTRY} value chains and buyer expectations`,
            ],
          },
          competitive_landscape: {
            overview: `The ${INDUSTRY} competitive environment in ${LOCATION} features both established players and emerging challengers. Market consolidation trends are creating opportunities for differentiated ${BUSINESS_MODEL} providers that emphasize speed-to-value and specialized expertise.`,
            major_competitors: (searchResults || []).slice(0, 3).map((r) => r?.title || 'Key competitor').filter(Boolean),
            market_dynamics: `Key dynamics include pricing pressure from digital-first competitors, increasing customer expectations for integrated solutions, and growing importance of data-driven decision making. ${BUSINESS_MODEL} providers that emphasize measurable ROI are gaining market share.`,
            competitive_advantages: `Differentiate through deep ${INDUSTRY} expertise, personalized customer engagement, and agile delivery in the ${LOCATION} market.`,
          },
          industry_trends: [
            {
              name: 'Digital Transformation Acceleration',
              description: `${INDUSTRY} companies in ${LOCATION} are increasingly adopting cloud, AI, and automation technologies to improve operational efficiency and customer experience.`,
              impact: 'high',
              timeframe: 'Ongoing, accelerating over next 2-3 years',
            },
            {
              name: 'Customer Experience as Differentiator',
              description: `Shift toward personalized, omnichannel engagement is reshaping how ${INDUSTRY} companies compete and retain clients in ${LOCATION}.`,
              impact: 'high',
              timeframe: 'Immediate and ongoing',
            },
            {
              name: 'Data-Driven Decision Making',
              description: `Growing emphasis on analytics, KPIs, and real-time dashboards for strategic planning across ${INDUSTRY}.`,
              impact: 'medium',
              timeframe: 'Next 1-2 years',
            },
            {
              name: 'Sustainability & ESG Integration',
              description: `Increasing regulatory and market pressure for sustainable practices and ESG reporting in ${INDUSTRY} operations.`,
              impact: 'medium',
              timeframe: 'Next 2-5 years',
            },
          ],
          major_news: (searchResults || []).slice(0, 5).map((r) => ({
            title: r?.title || 'Industry update',
            description: strip(r?.snippet || ''),
            date: new Date().toISOString().slice(0, 10),
            impact: 'neutral',
          })),
          recommendations: [
            {
              title: `Tighten ICP and ${INDUSTRY}-Specific Messaging`,
              description: `Refine ideal customer profile targeting for ${INDUSTRY} segments in ${LOCATION}. Align outreach messaging with industry-specific pain points and buying triggers.`,
              priority: 'high',
              action_items: [
                `Analyze top closed-won deals to identify common ${INDUSTRY} buyer characteristics`,
                `Develop 3 industry-specific email sequences and value propositions`,
                `Create ${INDUSTRY} case studies and ROI calculators for outbound campaigns`,
              ],
              timeline: 'short-term (1-3 months)',
              expected_impact: `Improved response rates and 15-25% increase in qualified opportunity creation within 60 days.`,
            },
            {
              title: 'Pipeline Hygiene and Conversion Optimization',
              description: `Implement systematic deal review process to improve conversion rates across the sales funnel.`,
              priority: 'medium',
              action_items: [
                'Establish weekly pipeline review cadence with standardized scoring criteria',
                'Implement stage-gate qualification criteria for opportunity progression',
                'Set up automated stale-deal alerts for opportunities inactive >14 days',
              ],
              timeline: 'immediate',
              expected_impact: `10-20% increase in win rates and improved forecast accuracy through better deal qualification.`,
            },
            ...(tenantStats.activities < 10 ? [{
              title: 'Launch Targeted Outreach Sprint',
              description: `Low recent activity detected (${tenantStats.activities} activities). Execute a focused 2-week outreach campaign targeting high-fit ${INDUSTRY} prospects in ${LOCATION}.`,
              priority: 'high',
              action_items: [
                'Build a list of 50 target accounts matching ICP criteria',
                'Execute multi-channel outreach (email + LinkedIn + phone) with 5-touch sequences',
                `Schedule ${Math.max(10, tenantStats.accounts * 2)} outbound activities per week`,
              ],
              timeline: 'immediate',
              expected_impact: `Generate 10-20 new qualified leads and 3-5 discovery meetings within 2 weeks.`,
            }] : []),
            ...(tenantStats.opportunities === 0 ? [{
              title: 'Kickstart Pipeline from Existing Database',
              description: `No active pipeline found. Leverage existing ${tenantStats.contacts} contacts and ${tenantStats.accounts} accounts to seed new opportunities.`,
              priority: 'high',
              action_items: [
                'Run re-engagement campaign to dormant contacts with new value proposition',
                'Identify 5 expansion opportunities within existing accounts',
                'Launch referral program with current customers for warm introductions',
              ],
              timeline: 'immediate',
              expected_impact: `Create 5-10 new pipeline opportunities within 30 days from existing database.`,
            }] : []),
            {
              title: `${LOCATION} Market Expansion Strategy`,
              description: `Develop focused go-to-market plan for underserved ${INDUSTRY} segments in ${LOCATION}.`,
              priority: 'medium',
              action_items: [
                `Research 3 adjacent ${INDUSTRY} sub-segments with growth potential in ${LOCATION}`,
                'Develop market entry plan with pricing, positioning, and channel strategy',
                'Identify potential strategic partners or referral relationships in target segments',
              ],
              timeline: 'medium-term (3-6 months)',
              expected_impact: `15-30% addressable market expansion and new revenue stream within 6 months.`,
            },
          ],
          economic_indicators: [
            { name: 'GDP Growth', current_value: 2.2, trend: 'up', unit: 'percent' },
            { name: 'Inflation', current_value: 3.1, trend: 'down', unit: 'percent' },
            { name: 'Unemployment', current_value: 4.0, trend: 'stable', unit: 'percent' },
            { name: 'Venture Funding', current_value: 12.5, trend: 'up', unit: 'USD (B)' },
            { name: `${INDUSTRY} Index`, current_value: 108, trend: 'up', unit: 'index' },
          ],
        };
      };

      // If all providers failed, return baseline fallback
      if (!failoverResult.ok) {
        const isKeyError = /api key|not configured/i.test(failoverResult.error || '');
        if (isKeyError) {
          // Return baseline without error status
          return res.json({ status: 'success', data: { insights: buildBaseline(), model: null, provider: null, usage: null, fallback: true } });
        }
        return res.status(500).json({ status: "error", message: failoverResult.error });
      }

      // Parse LLM response
      let insights = null;
      try { insights = JSON.parse(failoverResult.result.content || "null"); } catch { insights = null; }
      if (!insights) {
        // Use the full baseline generator instead of minimal object
        insights = buildBaseline();
      }

      return res.json({
        status: "success",
        data: {
          insights,
          model: failoverResult.model,
          provider: failoverResult.provider,
          usage: failoverResult.usage,
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
      'http://braid-mcp-server:8000/health',
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
      logger.debug('[MCP Health Proxy] All attempts failed:', JSON.stringify(aggregateErrors, null, 2));
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
      'http://braid-mcp-server:8000/health',
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
