/**
 * Independent Backend Server for Aisha CRM
 * Provides fallback API endpoints when Ai-SHA is down
 */

import express from "express";
import dotenv from "dotenv";
import { createServer } from "http";
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './lib/swagger.js';
import { initSupabaseAuth } from "./lib/supabaseAuth.js";
import logger from "./lib/logger.js";

// Import startup modules
import { initDatabase } from "./startup/initDatabase.js";
import { initServices } from "./startup/initServices.js";
import { initMiddleware } from "./startup/initMiddleware.js";
import workflowQueue from "./services/workflowQueue.js";

// Import background workers
import { startCampaignWorker } from "./lib/campaignWorker.js";
import { startAiTriggersWorker } from "./lib/aiTriggersWorker.js";
import { startEmailWorker } from "./workers/emailWorker.js";
import { startTaskWorkers } from "./workers/taskWorkers.js";
import { startHealthMonitoring } from "./lib/healthMonitor.js";

// Import UUID validation
import { sanitizeUuidInput } from "./lib/uuidValidator.js";

// Import centralized error handler
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

// Load environment variables
// Try .env.local first (for local development), then fall back to .env
dotenv.config({ path: ".env.local" });
dotenv.config(); // Fallback to .env if .env.local doesn't exist

const app = express();
// Behind proxies, trust X-Forwarded-* to get real client IPs
app.set('trust proxy', 1);
const PORT = process.env.BACKEND_PORT || process.env.PORT || 3001;

// Initialize Database
const { pgPool, dbConnectionType, ipv4FirstApplied: _ipv4FirstApplied } = await initDatabase(app);

// Initialize Services (Redis, Cache, Perf Log Batcher)
await initServices(app, pgPool);

// Initialize Middleware
const { resilientPerfDb } = initMiddleware(app, pgPool);

// Initialize Supabase Auth
const supabaseAuth = initSupabaseAuth();

// Root endpoint - provides API information
app.get("/", (req, res) => {
  res.json({
    name: "Aisha CRM Backend API",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "/health",
      apiStatus: "/api/status",
      documentation: "/api-docs",
      spec: "/api-docs.json"
    },
    database: pgPool ? "connected" : "not configured",
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    database: pgPool ? "connected" : "not configured",
  });
});

// Swagger API Documentation
// Restrict framing for docs to known dev origins using CSP frame-ancestors on this route only
// IMPORTANT: Remove global CSP header first, then set a route-specific CSP to avoid header merging
import helmet from "helmet"; // Need helmet here for the route-specific config
app.use(
  '/api-docs',
  (req, res, next) => { res.removeHeader('Content-Security-Policy'); next(); },
  helmet({
    frameguard: false, // Use CSP frame-ancestors instead for this route only
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        // Allow Swagger UI assets and behavior
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'", "http:", "https:"],
        // If download links or workers are used by Swagger UI
        "worker-src": ["'self'", "blob:"],
        "frame-ancestors": [
          "'self'",
          ...(process.env.ALLOWED_DOCS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) || [
            'http://localhost:5173',
            'https://localhost:5173',
            'http://localhost:4000',
            'https://localhost:4000'
          ])
        ]
      }
    },
    crossOriginEmbedderPolicy: false
  }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    // Use default (light) Swagger UI theme
    customSiteTitle: 'Aisha CRM API Documentation'
  })
);

// Swagger JSON spec endpoint
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Status endpoint (compatible with checkBackendStatus function)
/**
 * @openapi
 * /api/status:
 *   get:
 *     summary: API status
 *     description: Simple health/status endpoint for the API layer.
 *     tags: [system]
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
app.get("/api/status", (req, res) => {
  res.json({
    status: "success",
    message: "Backend server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: {
      database: pgPool ? "connected" : "not configured",
      mode: "independent",
    },
  });
});

// Import function routers
import createDatabaseRoutes from "./routes/database.js";
import createIntegrationRoutes from "./routes/integrations.js";
import createTelephonyRoutes from "./routes/telephony.js";
import createAiRoutes from "./routes/ai.js";
import { createAgentOfficeRoutes } from './routes/agentOffice.js';
import createMcpRoutes from "./routes/mcp.js";
import devaiRoutes from "./routes/devai.js"; // Phase 6: Developer AI approvals
import devaiHealthAlertsRoutes from "./routes/devaiHealthAlerts.js"; // Health monitoring alerts
import createAccountRoutes from "./routes/accounts.js";
import createLeadRoutes from "./routes/leads.js";
import createContactRoutes from "./routes/contacts.js";
import createValidationRoutes from "./routes/validation.js";
import createBillingRoutes from "./routes/billing.js";
import createStorageRoutes from "./routes/storage.js";
import createWebhookRoutes from "./routes/webhooks.js";
import createSystemRoutes from "./routes/system.js";
import createSystemSettingsRoutes from "./routes/system-settings.js";
import createUserRoutes from "./routes/users.js";
import createEmployeeRoutes from "./routes/employees.js";
import createPermissionRoutes from "./routes/permissions.js";
import createTestingRoutes from "./routes/testing.js";
import createDocumentRoutes from "./routes/documents.js";
import createDocumentationFileRoutes from "./routes/documentationfiles.js";
import createReportRoutes from "./routes/reports.js";
import createDocumentationRoutes from "./routes/documentation.js";
import createCashflowRoutes from "./routes/cashflow.js";
import createCronRoutes from "./routes/cron.js";
import createMetricsRoutes from "./routes/metrics.js";
import createEdgeFunctionRoutes from "./routes/edgeFunctions.js";
import createAISummaryRoutes from "./routes/aiSummary.js";
import createUtilsRoutes from "./routes/utils.js";
import createClientRoutes from "./routes/clients.js";
import createWorkflowRoutes from "./routes/workflows.js";
import createWorkflowExecutionRoutes from "./routes/workflowexecutions.js";
// V1 activities route RETIRED - import kept for reference only
// import createActivityRoutes from "./routes/activities.js";
import createOpportunityRoutes from "./routes/opportunities.js";
import createOpportunityV2Routes from "./routes/opportunities.v2.js";
import createActivityV2Routes from "./routes/activities.v2.js";
import createContactV2Routes from "./routes/contacts.v2.js";
import createAccountV2Routes from "./routes/accounts.v2.js";
import createLeadsV2Routes from "./routes/leads.v2.js";
import createReportsV2Routes from "./routes/reports.v2.js";
import createWorkflowV2Routes from "./routes/workflows.v2.js";
import createDocumentV2Routes from "./routes/documents.v2.js";
import createWorkflowTemplateRoutes from "./routes/workflow-templates.js";
import createNotificationRoutes from "./routes/notifications.js";
import createSystemLogRoutes from "./routes/system-logs.js";
import createAuditLogRoutes from "./routes/audit-logs.js";
import createModuleSettingsRoutes from "./routes/modulesettings.js";
import createEntityLabelsRoutes from "./routes/entitylabels.js";
import createTenantIntegrationRoutes from "./routes/tenant-integrations.js";
import createBizDevSourceRoutes from "./routes/bizdevsources.js";
import createTenantRoutes from "./routes/tenants.js";
import createTenantResolveRoutes from "./routes/tenant-resolve.js";
import createAnnouncementRoutes from "./routes/announcements.js";
import createApikeyRoutes from "./routes/apikeys.js";
import createNoteRoutes from "./routes/notes.js";
import createSystemBrandingRoutes from "./routes/systembrandings.js";
import createSyncHealthRoutes from "./routes/synchealths.js";
import createAICampaignRoutes from "./routes/aicampaigns.js";
import createSecurityRoutes from "./routes/security.js";
import createMemoryRoutes from "./routes/memory.js";
import createAuthRoutes from "./routes/auth.js";
import createGitHubIssuesRoutes from "./routes/github-issues.js";
import createSupabaseProxyRoutes from "./routes/supabaseProxy.js";
import createSuggestionsRoutes from "./routes/suggestions.js";
import createConstructionProjectsRoutes from "./routes/construction-projects.js";
import createConstructionAssignmentsRoutes from "./routes/construction-assignments.js";
import createWorkersRoutes from "./routes/workers.js";
import { createTasksRoutes } from "./routes/tasks.js";
import createDashboardFunnelRoutes from "./routes/dashboard-funnel.js";
import createCareConfigRoutes from "./routes/careConfig.js";
import braidAuditRoutes from "./routes/braidAudit.js";
import braidChainRoutes from "./routes/braidChain.js";
import braidMetricsRoutes from "./routes/braidMetrics.js";
import braidGraphRoutes from "./routes/braidGraph.js";
import aiSettingsRoutes from "./routes/aiSettings.js";
import createBundleRoutes from "./routes/bundles.js";
import { createDeprecationMiddleware } from "./middleware/deprecation.js";
import { authenticateRequest, requireAuth } from "./middleware/authenticate.js";
import { validateTenantAccess } from "./middleware/validateTenant.js";

// Apply v1 deprecation headers middleware (before routes)
app.use(createDeprecationMiddleware());
logger.info("v1 API deprecation headers middleware enabled");

// Use the pgPool directly; per-request DB time is measured inside the DB adapter
const measuredPgPool = pgPool;

// Mount routers with instrumented database pool
app.use("/api/database", createDatabaseRoutes(measuredPgPool));
app.use("/api/integrations", createIntegrationRoutes(measuredPgPool));
app.use("/api/telephony", createTelephonyRoutes(measuredPgPool));
app.use("/api/ai", authenticateRequest, createAiRoutes(measuredPgPool));
  app.use("/api/agent-office", authenticateRequest, createAgentOfficeRoutes(measuredPgPool));
app.use("/api/ai-settings", authenticateRequest, aiSettingsRoutes); // AI configuration settings
app.use("/api/mcp", createMcpRoutes(measuredPgPool));
app.use("/api/devai", devaiRoutes); // Phase 6: Developer AI approvals (superadmin only)
app.use("/api/devai", devaiHealthAlertsRoutes); // Health monitoring alerts (superadmin only)
app.use("/api/accounts", authenticateRequest, createAccountRoutes(measuredPgPool));
app.use("/api/leads", authenticateRequest, createLeadRoutes(measuredPgPool));
app.use("/api/contacts", authenticateRequest, createContactRoutes(measuredPgPool));
app.use("/api/validation", createValidationRoutes(measuredPgPool));
app.use("/api/billing", authenticateRequest, createBillingRoutes(measuredPgPool));
app.use("/api/storage", authenticateRequest, createStorageRoutes(measuredPgPool));
app.use("/api/webhooks", createWebhookRoutes(measuredPgPool));
app.use("/api/system", createSystemRoutes(measuredPgPool));
app.use("/api/system-settings", createSystemSettingsRoutes(measuredPgPool));
app.use("/api/users", createUserRoutes(measuredPgPool, supabaseAuth));
app.use("/api/employees", authenticateRequest, createEmployeeRoutes(measuredPgPool));
app.use("/api/permissions", createPermissionRoutes(measuredPgPool));
app.use("/api/testing", createTestingRoutes(measuredPgPool));
app.use("/api/documents", createDocumentRoutes(measuredPgPool));
app.use("/api/documentationfiles", authenticateRequest, createDocumentationFileRoutes(measuredPgPool));
app.use("/api/reports", createReportRoutes(measuredPgPool));
app.use("/api/bundles", authenticateRequest, createBundleRoutes(measuredPgPool)); // Bundle endpoints for optimized page loading
app.use("/api/documentation", createDocumentationRoutes(measuredPgPool));
app.use("/api/cashflow", createCashflowRoutes(measuredPgPool));
app.use("/api/cron", createCronRoutes(measuredPgPool));
// Metrics routes read from performance_logs; use resilient wrapper to avoid ended pool errors
app.use("/api/metrics", createMetricsRoutes(resilientPerfDb));
app.use("/api/utils", createUtilsRoutes(measuredPgPool));
app.use("/api/bizdevsources", createBizDevSourceRoutes(measuredPgPool));
app.use("/api/clients", createClientRoutes(measuredPgPool));
app.use("/api/workflows", authenticateRequest, validateTenantAccess, createWorkflowRoutes(measuredPgPool));
app.use("/api/workflowexecutions", authenticateRequest, createWorkflowExecutionRoutes(measuredPgPool));
// V1 activities route RETIRED - use /api/v2/activities (tenant-isolated, secure DELETE)
// app.use("/api/activities", createActivityRoutes(measuredPgPool));
app.use("/api/opportunities", authenticateRequest, createOpportunityRoutes(measuredPgPool));
// v2 opportunities endpoints (Phase 4.2 internal pilot).
// Always mounted in local/dev backend; production gating is handled via CI/CD.
logger.debug("Mounting /api/v2/opportunities routes (dev/internal)");
app.use("/api/v2/opportunities", authenticateRequest, createOpportunityV2Routes(measuredPgPool));
logger.debug("Mounting /api/v2/activities routes (dev/internal)");
app.use("/api/v2/activities", authenticateRequest, createActivityV2Routes(measuredPgPool));
logger.debug("Mounting /api/v2/contacts routes (dev/internal)");
app.use("/api/v2/contacts", authenticateRequest, createContactV2Routes(measuredPgPool));
logger.debug("Mounting /api/v2/accounts routes (dev/internal)");
app.use("/api/v2/accounts", authenticateRequest, createAccountV2Routes(measuredPgPool));
logger.debug("Mounting /api/v2/leads routes (dev/internal)");
app.use("/api/v2/leads", authenticateRequest, createLeadsV2Routes(measuredPgPool));
logger.debug("Mounting /api/v2/reports routes (dev/internal)");
app.use("/api/v2/reports", createReportsV2Routes(measuredPgPool));
logger.debug("Mounting /api/v2/workflows routes (dev/internal)");
app.use("/api/v2/workflows", createWorkflowV2Routes(measuredPgPool));
logger.debug("Mounting /api/v2/documents routes (dev/internal)");
app.use("/api/v2/documents", createDocumentV2Routes(measuredPgPool));
logger.debug("Mounting /api/workflow-templates routes");
app.use("/api/workflow-templates", createWorkflowTemplateRoutes(measuredPgPool));
app.use("/api/notifications", createNotificationRoutes(measuredPgPool));
app.use("/api/system-logs", createSystemLogRoutes(measuredPgPool));
app.use("/api/audit-logs", authenticateRequest, requireAuth, createAuditLogRoutes(measuredPgPool));
app.use("/api/modulesettings", createModuleSettingsRoutes(measuredPgPool));
app.use("/api/entity-labels", createEntityLabelsRoutes(measuredPgPool));
app.use("/api/tenantintegrations", createTenantIntegrationRoutes(measuredPgPool));
app.use("/api/tenants", createTenantRoutes(measuredPgPool));
app.use("/api/tenantresolve", createTenantResolveRoutes(measuredPgPool));
app.use("/api/announcements", createAnnouncementRoutes(measuredPgPool));
app.use("/api/apikeys", createApikeyRoutes(measuredPgPool));
app.use("/api/notes", createNoteRoutes(measuredPgPool));
app.use("/api/systembrandings", createSystemBrandingRoutes(measuredPgPool));
app.use("/api/synchealths", createSyncHealthRoutes(measuredPgPool));
app.use("/api/aicampaigns", createAICampaignRoutes(measuredPgPool));
app.use("/api/security", createSecurityRoutes(measuredPgPool));
// Dashboard funnel counts (materialized view for fast dashboard loading)
logger.debug("Mounting /api/dashboard/funnel-counts routes");
app.use("/api/dashboard", createDashboardFunnelRoutes(measuredPgPool));
// CARE Workflow Config routes (per-tenant CARE settings)
logger.debug("Mounting /api/care-config routes");
app.use("/api/care-config", authenticateRequest, createCareConfigRoutes(measuredPgPool));
// Braid SDK Audit Log routes
logger.debug("Mounting /api/braid/audit routes");
app.use("/api/braid/audit", braidAuditRoutes);
// Braid SDK Tool Chaining routes
logger.debug("Mounting /api/braid/chain routes");
app.use("/api/braid/chain", braidChainRoutes);
// Braid SDK Metrics routes
logger.debug("Mounting /api/braid/metrics routes");
app.use("/api/braid/metrics", braidMetricsRoutes);
// Braid SDK Tool Dependency Graph routes
logger.debug("Mounting /api/braid/graph routes");
app.use("/api/braid/graph", braidGraphRoutes);
// Construction Projects module routes
logger.debug("Mounting /api/construction/projects routes");
app.use("/api/construction/projects", createConstructionProjectsRoutes(measuredPgPool));
logger.debug("Mounting /api/construction/assignments routes");
app.use("/api/construction/assignments", createConstructionAssignmentsRoutes(measuredPgPool));
logger.debug("Mounting /api/workers routes");
app.use("/api/workers", createWorkersRoutes(measuredPgPool));
logger.debug("Mounting /api/tasks routes");
app.use("/api/tasks", createTasksRoutes());
// Memory routes use Redis/Valkey; DB pool not required
app.use("/api/memory", createMemoryRoutes());
// Auth routes (cookie-based login/refresh/logout)
app.use("/api/auth", createAuthRoutes(measuredPgPool));
// GitHub Issues routes for autonomous health monitoring
app.use("/api/github-issues", createGitHubIssuesRoutes);
// Proxy selected Supabase Edge Functions to avoid CORS issues in browsers
app.use("/api/edge", createEdgeFunctionRoutes());

// AI summary generation
app.use("/api/ai", createAISummaryRoutes);
// Supabase Auth proxy (CORS-controlled access to /auth/v1/user)
app.use("/api/supabase-proxy", createSupabaseProxyRoutes());
// AI Suggestions routes (Phase 3 Autonomous Operations)
app.use("/api/ai/suggestions", createSuggestionsRoutes(measuredPgPool));

// 404 handler - Ensure CORS headers so browser shows real error, not "CORS error"
app.use((req, res, next) => {
  if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  notFoundHandler(req, res, next);
});

// Centralized error handler - catches all errors from routes
app.use((err, req, res, next) => {
  // Ensure CORS headers are present even in error responses
  // This prevents "CORS error" from masking the actual backend error (401, 403, 500, etc.)
  if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  errorHandler(err, req, res, next);
});

// Helper to log backend lifecycle events to system_logs
async function logBackendEvent(level, message, metadata = {}) {
  // Optional guard to disable DB-backed logging in constrained environments
  if (process.env.DISABLE_DB_LOGGING === 'true') return;
  if (!pgPool) return; // Skip if no database

  try {
    // Sanitize tenant_id: 'system' → NULL for UUID columns
    // If SYSTEM_TENANT_ID env is set to a valid UUID, use it; otherwise NULL
    const tenantId = sanitizeUuidInput(process.env.SYSTEM_TENANT_ID || 'system');

    const query = `
      INSERT INTO system_logs (
        tenant_id, level, message, source, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, NOW()
      )
    `;

    await pgPool.query(query, [
      tenantId, // NULL or valid UUID (if SYSTEM_TENANT_ID env is set)
      level,
      message,
      "Backend Server",
      JSON.stringify({
        ...metadata,
        port: PORT,
        environment: process.env.NODE_ENV || "development",
        database_type: dbConnectionType,
        timestamp: new Date().toISOString(),
        user_email: "system@aishacrm.com",
      }),
    ]);
  } catch (error) {
    // Don't fail startup/shutdown if logging fails
    logger.error({ err: error }, "Failed to log backend event");
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");

  // Log shutdown event
  await logBackendEvent(
    "WARNING",
    "Backend server shutting down (SIGTERM received)",
    {
      uptime_seconds: process.uptime(),
      shutdown_reason: "SIGTERM signal",
    },
  );
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  // Close workflow queue
  if (workflowQueue) {
    await workflowQueue.close();
    logger.info("Workflow queue closed");
  }

  if (pgPool) {
    pgPool.end(() => {
      logger.info("PostgreSQL pool closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Handle unexpected crashes
process.on("uncaughtException", async (err) => {
  logger.error({ err }, "[uncaughtException]");

  // Log crash event
  await logBackendEvent("ERROR", "Backend server crashed (uncaughtException)", {
    error: err.message,
    stack_trace: err.stack,
    uptime_seconds: process.uptime(),
  });

  // Don't exit on uncaught exceptions in development
  if (process.env.NODE_ENV !== "development") {
    process.exit(1);
  }
});

// ----------------------------------------------------------------------------
// Heartbeat support: record periodic heartbeats so missing intervals indicate downtime
// ----------------------------------------------------------------------------
let heartbeatTimer = null;
const HEARTBEAT_ENABLED = process.env.HEARTBEAT_ENABLED !== 'false';
const HEARTBEAT_INTERVAL_MS = Math.max(15000, parseInt(process.env.HEARTBEAT_INTERVAL_MS || '60000', 10));

async function writeHeartbeat() {
  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO system_logs (tenant_id, level, message, source, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        null,  // NULL for system-level logs (not tenant-specific)
        "INFO",
        "Heartbeat",
        "Backend Server",
        JSON.stringify({ type: "heartbeat", user_email: "system@aishacrm.com" }),
      ],
    );
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      logger.error({ err: e }, "Failed to write heartbeat");
    }
  }
}

function startHeartbeat() {
  if (!pgPool) return;
  if (!HEARTBEAT_ENABLED) {
    logger.info("Backend heartbeat disabled via HEARTBEAT_ENABLED=false");
    return;
  }
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  // Immediate heartbeat then at configured interval
  writeHeartbeat();
  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
  logger.info({ intervalMs: HEARTBEAT_INTERVAL_MS }, "Heartbeat interval configured");
}

async function logRecoveryIfGap() {
  if (!pgPool) return;
  try {
    const result = await pgPool.query(
      `SELECT created_at FROM system_logs
       WHERE tenant_id IS NULL AND source = 'Backend Server' AND message = 'Heartbeat'
       ORDER BY created_at DESC LIMIT 1`,
    );
    if (result.rows.length > 0) {
      const last = new Date(result.rows[0].created_at);
      const gapMs = Date.now() - last.getTime();
      const thresholdMs = 2 * 60 * 1000; // >2 minutes gap implies downtime
      if (gapMs > thresholdMs) {
        await logBackendEvent("WARNING", "Backend recovered after downtime", {
          downtime_ms: gapMs,
          last_heartbeat: last.toISOString(),
        });
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      logger.error({ err: e }, "Failed to check last heartbeat");
    }
  }
}

// Start server
const server = createServer(app);

// Supabase admin helpers for storage bucket provisioning
import { getSupabaseAdmin, getBucketName } from "./lib/supabaseFactory.js";

async function ensureStorageBucketExists() {
  try {
    const supabase = getSupabaseAdmin({ throwOnMissing: false });
    if (!supabase) return;
    const bucket = getBucketName();
    // Check bucket existence
    const { data: existing, error: getErr } = await supabase.storage.getBucket(
      bucket,
    );
    if (existing && !getErr) {
      try {
        // Ensure bucket is public (required for logos to render without signed URLs)
        if (existing.public !== true) {
          const { error: updErr } = await supabase.storage.updateBucket(bucket, {
            public: true,
          });
          if (updErr) {
            logger.warn({ bucket, err: updErr }, "Could not update bucket to public");
          } else {
            logger.info({ bucket }, "Updated Supabase storage bucket to public");
          }
        }
      } catch (e) {
        logger.warn({ bucket, err: e }, "Failed to verify/update public setting for bucket");
      }
      logger.debug({ bucket }, "Supabase storage bucket exists");
      return;
    }
    // Fallback via listBuckets when getBucket not available
    const { data: list } = await supabase.storage.listBuckets();
    if (list && Array.isArray(list) && list.find((b) => b.name === bucket)) {
      try {
        // We don't have 'public' field from list reliably; attempt to set to public just in case
        const { error: updErr } = await supabase.storage.updateBucket(bucket, {
          public: true,
        });
        if (updErr) {
          logger.warn({ bucket, err: updErr }, "Could not ensure bucket is public");
        } else {
          logger.info({ bucket }, "Ensured Supabase storage bucket is public");
        }
      } catch (e) {
        logger.warn({ bucket, err: e }, "Failed to ensure public setting for bucket");
      }
      logger.debug({ bucket }, "Supabase storage bucket exists");
      return;
    }
    if (getErr && getErr.message) {
      logger.warn("getBucket not available or returned error, attempted listBuckets fallback");
    }
    // Create bucket (public=true for logos; adjust in Supabase UI if needed)
    const { error: createErr } = await supabase.storage.createBucket(bucket, {
      public: true,
    });
    if (createErr) throw createErr;
    logger.info({ bucket }, "Created Supabase storage bucket (public: true)");
  } catch (e) {
    logger.error({ err: e }, "Failed to ensure storage bucket");
  }
}

// Start listening
server.listen(PORT, async () => {
  const startTimestamp = new Date().toISOString();
  logger.info({
    env: process.env.NODE_ENV || 'unknown',
    port: PORT,
    startTimestamp
  }, '[startup] backend start');
  
  const banner = `
╔═══════════════════════════════════════════════════════════╗
║                 AiSHA CRM Backend API                    ║
║                                                           ║
║   Health Check: http://localhost:${PORT}/health             ║
║   API Status: http://localhost:${PORT}/api/status           ║
║                                                           ║
║   Total Endpoints: 197 functions across 26 categories    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `;
  logger.info(banner);

  logger.info({ port: PORT }, "Server listening");

  // Kick off storage bucket provisioning (non-blocking)
  ensureStorageBucketExists().catch((err) =>
    logger.error({ err }, "Bucket ensure failed")
  );

  logger.info("BACKEND VERSION CHECK: FIX APPLIED (v2)");

  // Log startup event (non-blocking - don't block server startup)
  logBackendEvent("INFO", "Backend server started successfully", {
    endpoints_count: 197,
    categories_count: 26,
    startup_time: new Date().toISOString(),
  }).catch((err) => logger.error({ err }, "Failed to log startup event"));

  // If there was a gap in heartbeats, log a recovery event, then start periodic heartbeats
  // Run in background - don't block server startup
  logger.info("Initializing heartbeat system in 1 second");
  setTimeout(async () => {
    logger.debug("Starting heartbeat initialization");
    try {
      await logRecoveryIfGap();
      logger.debug("Recovery check complete");
      startHeartbeat();
      logger.info({ timerId: heartbeatTimer }, "Heartbeat system started");
    } catch (err) {
      logger.error({ err }, "Failed to start heartbeat system");
    }
  }, 1000); // Delay 1 second to ensure server is fully started

  // Start campaign worker if enabled
  if (process.env.CAMPAIGN_WORKER_ENABLED === 'true' && pgPool) {
    const workerInterval = parseInt(process.env.CAMPAIGN_WORKER_INTERVAL_MS || '30000', 10);
    startCampaignWorker(pgPool, workerInterval);
  } else {
    logger.debug('[CampaignWorker] Disabled (set CAMPAIGN_WORKER_ENABLED=true to enable)');
  }

  // Start AI triggers worker if enabled (Phase 3 Autonomous Operations)
  if (process.env.AI_TRIGGERS_WORKER_ENABLED === 'true' && pgPool) {
    const triggersInterval = parseInt(process.env.AI_TRIGGERS_WORKER_INTERVAL_MS || '60000', 10);
    startAiTriggersWorker(pgPool, triggersInterval);
  } else {
    logger.debug('[AiTriggersWorker] Disabled (set AI_TRIGGERS_WORKER_ENABLED=true to enable)');
  }

  // Start email worker (always enabled if database is available)
  logger.info('[EmailWorker] Starting email worker (processes queued email activities)');
  if (pgPool) {
    startEmailWorker(pgPool);
  }
  // Task workers use Supabase client, not pgPool
  startTaskWorkers();

  // Start health monitoring system for Developer AI
  if (process.env.HEALTH_MONITORING_ENABLED !== 'false') {
    logger.info('[HealthMonitor] Starting autonomous health monitoring system');
    startHealthMonitoring();
  } else {
    logger.debug('[HealthMonitor] Disabled (set HEALTH_MONITORING_ENABLED=true to enable)');
  }

  // Note: Agent office task queue processor is registered in startTaskWorkers() above

  // Keep-alive interval to prevent process from exiting
  setInterval(() => {
    // This empty interval keeps the event loop alive
  }, 60000);
});

// Debug: Log if process is about to exit
process.on("exit", (code) => {
  logger.warn({ code }, "Process exiting");
});

process.on("beforeExit", (code) => {
  logger.warn({ code }, "Process about to exit (beforeExit)");
});

// Handle server errors (port already in use, etc.)
server.on("error", async (error) => {
  logger.error({ err: error }, "Server error");

  // Log server error
  await logBackendEvent("ERROR", `Backend server error: ${error.message}`, {
    error_code: error.code,
    error: error.message,
    stack_trace: error.stack,
  });

  if (error.code === "EADDRINUSE") {
    logger.error({ port: PORT }, "Port already in use");
    process.exit(1);
  }
});

// Handle unhandled rejections - log them to system_logs
process.on("unhandledRejection", async (err) => {
  logger.error({ err }, "[unhandledRejection]");

  // Log unhandled rejection
  await logBackendEvent("ERROR", "Unhandled promise rejection detected", {
    error: err?.message || String(err),
    stack_trace: err?.stack,
    type: "unhandledRejection",
  });
});

export { app, pgPool, server };