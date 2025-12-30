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

// Import startup modules
import { initDatabase } from "./startup/initDatabase.js";
import { initServices } from "./startup/initServices.js";
import { initMiddleware } from "./startup/initMiddleware.js";
import workflowQueue from "./services/workflowQueue.js";

// Import background workers
import { startCampaignWorker } from "./lib/campaignWorker.js";
import { startAiTriggersWorker } from "./lib/aiTriggersWorker.js";

// Import UUID validation
import { sanitizeUuidInput } from "./lib/uuidValidator.js";

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

// ----------------------------------------------------------------------------
// Canary logging middleware for BizDevSource promote diagnostics
// Logs every POST to /api/bizdevsources/* BEFORE route handlers.
// Helps distinguish client/network stall vs server handling issues.
// ----------------------------------------------------------------------------
app.use((req, _res, next) => {
  try {
    if (req.method === 'POST' && req.path.startsWith('/api/bizdevsources/')) {
      console.log('[CANARY Promote POST] Incoming request', {
        path: req.path,
        method: req.method,
        origin: req.headers.origin,
        contentType: req.headers['content-type'],
        hasBody: !!req.headers['content-length'],
        productionGuardEnabled: true,
      });
    }
  } catch (e) {
    console.warn('[CANARY Promote POST] Logging error', e?.message);
  }
  return next();
});

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
import createMcpRoutes from "./routes/mcp.js";
import devaiRoutes from "./routes/devai.js"; // Phase 6: Developer AI approvals
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
import createBizDevRoutes from "./routes/bizdev.js";
import createClientRoutes from "./routes/clients.js";
import createWorkflowRoutes from "./routes/workflows.js";
import createWorkflowExecutionRoutes from "./routes/workflowexecutions.js";
import createActivityRoutes from "./routes/activities.js";
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
import createDashboardFunnelRoutes from "./routes/dashboard-funnel.js";
import braidAuditRoutes from "./routes/braidAudit.js";
import braidChainRoutes from "./routes/braidChain.js";
import braidMetricsRoutes from "./routes/braidMetrics.js";
import braidGraphRoutes from "./routes/braidGraph.js";
import { createDeprecationMiddleware } from "./middleware/deprecation.js";
import { authenticateRequest } from "./middleware/authenticate.js";

// Apply v1 deprecation headers middleware (before routes)
app.use(createDeprecationMiddleware());
console.log("✓ v1 API deprecation headers middleware enabled");

// Use the pgPool directly; per-request DB time is measured inside the DB adapter
const measuredPgPool = pgPool;

// Mount routers with instrumented database pool
app.use("/api/database", createDatabaseRoutes(measuredPgPool));
app.use("/api/integrations", createIntegrationRoutes(measuredPgPool));
app.use("/api/telephony", createTelephonyRoutes(measuredPgPool));
app.use("/api/ai", authenticateRequest, createAiRoutes(measuredPgPool));
app.use("/api/mcp", createMcpRoutes(measuredPgPool));
app.use("/api/devai", devaiRoutes); // Phase 6: Developer AI approvals (superadmin only)
app.use("/api/accounts", createAccountRoutes(measuredPgPool));
app.use("/api/leads", createLeadRoutes(measuredPgPool));
app.use("/api/contacts", createContactRoutes(measuredPgPool));
app.use("/api/validation", createValidationRoutes(measuredPgPool));
app.use("/api/billing", createBillingRoutes(measuredPgPool));
app.use("/api/storage", createStorageRoutes(measuredPgPool));
app.use("/api/webhooks", createWebhookRoutes(measuredPgPool));
app.use("/api/system", createSystemRoutes(measuredPgPool));
app.use("/api/system-settings", createSystemSettingsRoutes(measuredPgPool));
app.use("/api/users", createUserRoutes(measuredPgPool, supabaseAuth));
app.use("/api/employees", createEmployeeRoutes(measuredPgPool));
app.use("/api/permissions", createPermissionRoutes(measuredPgPool));
app.use("/api/testing", createTestingRoutes(measuredPgPool));
app.use("/api/documents", createDocumentRoutes(measuredPgPool));
app.use("/api/documentationfiles", createDocumentationFileRoutes(measuredPgPool));
app.use("/api/reports", createReportRoutes(measuredPgPool));
app.use("/api/documentation", createDocumentationRoutes(measuredPgPool));
app.use("/api/cashflow", createCashflowRoutes(measuredPgPool));
app.use("/api/cron", createCronRoutes(measuredPgPool));
// Metrics routes read from performance_logs; use resilient wrapper to avoid ended pool errors
app.use("/api/metrics", createMetricsRoutes(resilientPerfDb));
app.use("/api/utils", createUtilsRoutes(measuredPgPool));
app.use("/api/bizdev", createBizDevRoutes(measuredPgPool));
app.use("/api/bizdevsources", createBizDevSourceRoutes(measuredPgPool));
app.use("/api/clients", createClientRoutes(measuredPgPool));
app.use("/api/workflows", createWorkflowRoutes(measuredPgPool));
app.use("/api/workflowexecutions", createWorkflowExecutionRoutes(measuredPgPool));
// Route activities through Supabase API (primary test target)
app.use("/api/activities", createActivityRoutes(measuredPgPool));
app.use("/api/opportunities", createOpportunityRoutes(measuredPgPool));
// v2 opportunities endpoints (Phase 4.2 internal pilot).
// Always mounted in local/dev backend; production gating is handled via CI/CD.
console.log("✓ Mounting /api/v2/opportunities routes (dev/internal)");
app.use("/api/v2/opportunities", createOpportunityV2Routes(measuredPgPool));
console.log("✓ Mounting /api/v2/activities routes (dev/internal)");
app.use("/api/v2/activities", createActivityV2Routes(measuredPgPool));
console.log("✓ Mounting /api/v2/contacts routes (dev/internal)");
app.use("/api/v2/contacts", createContactV2Routes(measuredPgPool));
console.log("✓ Mounting /api/v2/accounts routes (dev/internal)");
app.use("/api/v2/accounts", createAccountV2Routes(measuredPgPool));
console.log("✓ Mounting /api/v2/leads routes (dev/internal)");
app.use("/api/v2/leads", createLeadsV2Routes(measuredPgPool));
console.log("✓ Mounting /api/v2/reports routes (dev/internal)");
app.use("/api/v2/reports", createReportsV2Routes(measuredPgPool));
console.log("✓ Mounting /api/v2/workflows routes (dev/internal)");
app.use("/api/v2/workflows", createWorkflowV2Routes(measuredPgPool));
console.log("✓ Mounting /api/v2/documents routes (dev/internal)");
app.use("/api/v2/documents", createDocumentV2Routes(measuredPgPool));
console.log("✓ Mounting /api/workflow-templates routes");
app.use("/api/workflow-templates", createWorkflowTemplateRoutes(measuredPgPool));
app.use("/api/notifications", createNotificationRoutes(measuredPgPool));
app.use("/api/system-logs", createSystemLogRoutes(measuredPgPool));
app.use("/api/audit-logs", createAuditLogRoutes(measuredPgPool));
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
console.log("✓ Mounting /api/dashboard/funnel-counts routes");
app.use("/api/dashboard", createDashboardFunnelRoutes(measuredPgPool));
// Braid SDK Audit Log routes
console.log("✓ Mounting /api/braid/audit routes");
app.use("/api/braid/audit", braidAuditRoutes);
// Braid SDK Tool Chaining routes
console.log("✓ Mounting /api/braid/chain routes");
app.use("/api/braid/chain", braidChainRoutes);
// Braid SDK Metrics routes
console.log("✓ Mounting /api/braid/metrics routes");
app.use("/api/braid/metrics", braidMetricsRoutes);
// Braid SDK Tool Dependency Graph routes
console.log("✓ Mounting /api/braid/graph routes");
app.use("/api/braid/graph", braidGraphRoutes);
// Construction Projects module routes
console.log("✓ Mounting /api/construction/projects routes");
app.use("/api/construction/projects", createConstructionProjectsRoutes(measuredPgPool));
console.log("✓ Mounting /api/construction/assignments routes");
app.use("/api/construction/assignments", createConstructionAssignmentsRoutes(measuredPgPool));
console.log("✓ Mounting /api/workers routes");
app.use("/api/workers", createWorkersRoutes(measuredPgPool));
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

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Endpoint not found",
    path: req.path,
  });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error("Error:", err);

  // Ensure CORS headers are present even in error responses
  // This prevents "CORS error" from masking the actual backend error (401, 403, 500, etc.)
  if (!res.getHeader('Access-Control-Allow-Origin') && req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
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
    console.error("Failed to log backend event:", error.message);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");

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
    console.log("Workflow queue closed");
  }

  if (pgPool) {
    pgPool.end(() => {
      console.log("PostgreSQL pool closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Handle unexpected crashes
process.on("uncaughtException", async (err) => {
  console.error("[uncaughtException]", err);

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
      console.error("Failed to write heartbeat:", e.message);
    }
  }
}

function startHeartbeat() {
  if (!pgPool) return;
  if (!HEARTBEAT_ENABLED) {
    console.log("✓ Backend heartbeat disabled via HEARTBEAT_ENABLED=false");
    return;
  }
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  // Immediate heartbeat then at configured interval
  writeHeartbeat();
  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL_MS);
  console.log(`✓ Heartbeat interval set to ${HEARTBEAT_INTERVAL_MS} ms`);
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
      console.error("Failed to check last heartbeat:", e.message);
    }
  }
}

// Start server
const server = createServer(app);

// Supabase admin helpers for storage bucket provisioning
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
function getSupabaseAdmin() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
function getBucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "tenant-assets";
}
async function ensureStorageBucketExists() {
  try {
    const supabase = getSupabaseAdmin();
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
            console.warn(`⚠️ Could not update bucket '${bucket}' to public:`, updErr.message);
          } else {
            console.log(`✓ Updated Supabase storage bucket '${bucket}' to public: true`);
          }
        }
      } catch (e) {
        console.warn(`⚠️ Failed to verify/update public setting for bucket '${bucket}':`, e.message);
      }
      console.log(`✓ Supabase storage bucket '${bucket}' exists`);
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
          console.warn(`⚠️ Could not ensure bucket '${bucket}' is public:`, updErr.message);
        } else {
          console.log(`✓ Ensured Supabase storage bucket '${bucket}' is public`);
        }
      } catch (e) {
        console.warn(`⚠️ Failed to ensure public setting for bucket '${bucket}':`, e.message);
      }
      console.log(`✓ Supabase storage bucket '${bucket}' exists`);
      return;
    }
    if (getErr && getErr.message) {
      console.warn(
        "Note: getBucket not available or returned error, attempted listBuckets fallback.",
      );
    }
    // Create bucket (public=true for logos; adjust in Supabase UI if needed)
    const { error: createErr } = await supabase.storage.createBucket(bucket, {
      public: true,
    });
    if (createErr) throw createErr;
    console.log(`✓ Created Supabase storage bucket '${bucket}' (public: true)`);
  } catch (e) {
    console.error("Failed to ensure storage bucket:", e.message);
  }
}

// Start listening
server.listen(PORT, async () => {
  const startTimestamp = new Date().toISOString();
  console.log(`[startup] backend start | env=${process.env.NODE_ENV || 'unknown'} | port=${PORT} | started=${startTimestamp}`);
  console.log(`
  }   ║
║                                                           ║
║   Health Check: http://localhost:${PORT}/health             ║
║   API Status: http://localhost:${PORT}/api/status           ║
║                                                           ║
║   Total Endpoints: 197 functions across 26 categories    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  console.log("✓ Server listening on port", PORT);

  // Kick off storage bucket provisioning (non-blocking)
  ensureStorageBucketExists().catch((err) =>
    console.error("Bucket ensure failed:", err?.message)
  );

  console.log("!!! BACKEND VERSION CHECK: FIX APPLIED (v2) !!!");

  // Log startup event (non-blocking - don't block server startup)
  logBackendEvent("INFO", "Backend server started successfully", {
    endpoints_count: 197,
    categories_count: 26,
    startup_time: new Date().toISOString(),
  }).catch((err) => console.error("Failed to log startup event:", err.message));

  // If there was a gap in heartbeats, log a recovery event, then start periodic heartbeats
  // Run in background - don't block server startup
  console.log("✓ Initializing heartbeat system in 1 second...");
  setTimeout(async () => {
    console.log("→ Starting heartbeat initialization...");
    try {
      await logRecoveryIfGap();
      console.log("✓ Recovery check complete");
      startHeartbeat();
      console.log("✓ Heartbeat system started");
      console.log("✓ Heartbeat timer ID:", heartbeatTimer);
    } catch (err) {
      console.error("Failed to start heartbeat system:", err.message);
    }
  }, 1000); // Delay 1 second to ensure server is fully started

  // Start campaign worker if enabled
  if (process.env.CAMPAIGN_WORKER_ENABLED === 'true' && pgPool) {
    const workerInterval = parseInt(process.env.CAMPAIGN_WORKER_INTERVAL_MS || '30000', 10);
    startCampaignWorker(pgPool, workerInterval);
  } else {
    console.log('[CampaignWorker] Disabled (set CAMPAIGN_WORKER_ENABLED=true to enable)');
  }

  // Start AI triggers worker if enabled (Phase 3 Autonomous Operations)
  if (process.env.AI_TRIGGERS_WORKER_ENABLED === 'true' && pgPool) {
    const triggersInterval = parseInt(process.env.AI_TRIGGERS_WORKER_INTERVAL_MS || '60000', 10);
    startAiTriggersWorker(pgPool, triggersInterval);
  } else {
    console.log('[AiTriggersWorker] Disabled (set AI_TRIGGERS_WORKER_ENABLED=true to enable)');
  }

  // Keep-alive interval to prevent process from exiting
  setInterval(() => {
    // This empty interval keeps the event loop alive
  }, 60000);
});

// Debug: Log if process is about to exit
process.on("exit", (code) => {
  console.log("⚠️  Process exiting with code:", code);
});

process.on("beforeExit", (code) => {
  console.log("⚠️  Process about to exit (beforeExit) with code:", code);
});

// Handle server errors (port already in use, etc.)
server.on("error", async (error) => {
  console.error("Server error:", error);

  // Log server error
  await logBackendEvent("ERROR", `Backend server error: ${error.message}`, {
    error_code: error.code,
    error: error.message,
    stack_trace: error.stack,
  });

  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// Handle unhandled rejections - log them to system_logs
process.on("unhandledRejection", async (err) => {
  console.error("[unhandledRejection]", err);

  // Log unhandled rejection
  await logBackendEvent("ERROR", "Unhandled promise rejection detected", {
    error: err?.message || String(err),
    stack_trace: err?.stack,
    type: "unhandledRejection",
  });
});

export { app, pgPool, server };
