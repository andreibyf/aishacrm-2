/**
 * Independent Backend Server for Aisha CRM
 * Provides fallback API endpoints when Ai-SHA is down
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import dotenv from "dotenv";
import { createServer } from "http";
import pkg from "pg";
const { Pool } = pkg;
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './lib/swagger.js';

// Load environment variables
// Try .env.local first (for local development), then fall back to .env
dotenv.config({ path: ".env.local" });
dotenv.config(); // Fallback to .env if .env.local doesn't exist

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection pool with Supabase support
let pgPool = null;
let dbConnectionType = "none";

if (process.env.USE_SUPABASE_PROD === "true") {
  // Connect to Supabase Production
  const supabaseConfig = {
    host: process.env.SUPABASE_DB_HOST,
    port: parseInt(process.env.SUPABASE_DB_PORT || "5432"),
    database: process.env.SUPABASE_DB_NAME || "postgres",
    user: process.env.SUPABASE_DB_USER || "postgres",
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: {
      rejectUnauthorized: false, // Required for Supabase
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  pgPool = new Pool(supabaseConfig);
  dbConnectionType = "Supabase Production";
  console.log("✓ PostgreSQL connection pool initialized (Supabase Production)");
} else if (process.env.DATABASE_URL) {
  // Connect using DATABASE_URL (supports local Docker or Supabase Cloud)
  // Support both direct (db.<ref>.supabase.co:5432) and pooled (aws-0-<region>.pooler.supabase.com:6543) URLs
  const isSupabaseCloud = /supabase\.(co|com)/i.test(process.env.DATABASE_URL);

  const poolConfig = {
    connectionString: process.env.DATABASE_URL,
  };

  // Add SSL for Supabase Cloud connections
  if (isSupabaseCloud || process.env.DB_SSL === "true") {
    poolConfig.ssl = {
      rejectUnauthorized: false,
    };
    dbConnectionType = "Supabase Cloud DEV/QA";
  } else {
    dbConnectionType = "Local Docker";
  }

  pgPool = new Pool(poolConfig);
  console.log(`✓ PostgreSQL connection pool initialized (${dbConnectionType})`);
} else {
  console.warn(
    "⚠ No database configured - set DATABASE_URL or USE_SUPABASE_PROD=true",
  );
}

// Initialize Supabase Auth
import { initSupabaseAuth } from "./lib/supabaseAuth.js";
const supabaseAuth = initSupabaseAuth();

// Middleware
app.use(helmet({
  // We rely on CSP frame-ancestors instead of legacy X-Frame-Options for embedding Swagger in the frontend
  frameguard: false,
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-ancestors": ["'self'", "http://localhost:5173", "https://localhost:5173"],
    },
  },
})); // Security headers
app.use(compression()); // Compress responses
app.use(morgan("combined")); // Logging

// CORS configuration
// Defaults: allow localhost dev and current staging domain; optionally allow *.up.railway.app
const defaultAllowed = [
  "http://localhost:5173",
  "https://localhost:5173",
  "https://aishacrm-2-staging.up.railway.app",
];
const envAllowed = (process.env.ALLOWED_ORIGINS?.split(",") || [])
  .map(s => s.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultAllowed, ...envAllowed])];

app.use(cors({
  origin: (origin, callback) => {
    try {
      // Allow server-to-server or same-origin calls
      if (!origin) return callback(null, true);

      // Explicit allowlist or wildcard
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow Railway preview/staging domains by default unless explicitly disabled
      const allowRailway = process.env.ALLOW_RAILWAY_ORIGINS !== "false";
      if (allowRailway && /^https?:\/\/.*\.up\.railway\.app$/.test(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    } catch {
      return callback(new Error("CORS configuration error"));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Performance logging middleware (must be after body parsers, before routes)
import { performanceLogger } from "./middleware/performanceLogger.js";
if (pgPool) {
  app.use(performanceLogger(pgPool));
  console.log("✓ Performance logging middleware enabled");
}

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
// Ensure X-Frame-Options does not block embedding from the frontend origin
app.use('/api-docs', (req, res, next) => {
  try { res.removeHeader('X-Frame-Options'); } catch { /* no-op */ }
  next();
}, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: `
    body { background-color: #1e293b; }
    .swagger-ui .topbar { display: none }
    .swagger-ui { background-color: #1e293b; color: #e2e8f0; }
    .swagger-ui .wrapper { background-color: #1e293b; }
    .swagger-ui .information-container { background-color: #1e293b; }
    .swagger-ui .info .title { color: #f1f5f9; }
    .swagger-ui .info { color: #cbd5e1; }
    .swagger-ui .scheme-container { background: #334155; }
    .swagger-ui .opblock-tag { color: #f1f5f9; border-color: #475569; }
    .swagger-ui .opblock { background: #334155; border-color: #475569; }
    .swagger-ui .opblock .opblock-summary { background: #475569; }
    .swagger-ui .opblock-description-wrapper, .swagger-ui .opblock-external-docs-wrapper, .swagger-ui .opblock-title_normal { color: #cbd5e1; }
    .swagger-ui table thead tr td, .swagger-ui table thead tr th { color: #f1f5f9; border-color: #475569; }
    .swagger-ui .parameter__name, .swagger-ui .parameter__type { color: #e2e8f0; }
    .swagger-ui .response-col_status { color: #f1f5f9; }
    .swagger-ui .response-col_description { color: #cbd5e1; }
    .swagger-ui section.models { border-color: #475569; }
    .swagger-ui section.models .model-container { background: #334155; }
    .swagger-ui .model-title { color: #f1f5f9; }
    .swagger-ui .model { color: #cbd5e1; }
    .swagger-ui .prop-type { color: #94a3b8; }
    .swagger-ui input[type=text], .swagger-ui textarea, .swagger-ui select { 
      background: #1e293b; 
      color: #e2e8f0; 
      border-color: #475569; 
    }
  `,
  customSiteTitle: 'Aisha CRM API Documentation'
}));

// Swagger JSON spec endpoint
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Status endpoint (compatible with checkBackendStatus function)
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
import createAccountRoutes from "./routes/accounts.js";
import createLeadRoutes from "./routes/leads.js";
import createContactRoutes from "./routes/contacts.js";
import createValidationRoutes from "./routes/validation.js";
import createBillingRoutes from "./routes/billing.js";
import createStorageRoutes from "./routes/storage.js";
import createWebhookRoutes from "./routes/webhooks.js";
import createSystemRoutes from "./routes/system.js";
import createUserRoutes from "./routes/users.js";
import createEmployeeRoutes from "./routes/employees.js";
import createPermissionRoutes from "./routes/permissions.js";
import createTestingRoutes from "./routes/testing.js";
import createDocumentRoutes from "./routes/documents.js";
import createReportRoutes from "./routes/reports.js";
import createCashflowRoutes from "./routes/cashflow.js";
import createCronRoutes from "./routes/cron.js";
import createMetricsRoutes from "./routes/metrics.js";
import createUtilsRoutes from "./routes/utils.js";
import createBizdevRoutes from "./routes/bizdev.js";
import createClientRoutes from "./routes/clients.js";
import createWorkflowRoutes from "./routes/workflows.js";
import createWorkflowExecutionRoutes from "./routes/workflowexecutions.js";
import createActivityRoutes from "./routes/activities.js";
import createOpportunityRoutes from "./routes/opportunities.js";
import createNotificationRoutes from "./routes/notifications.js";
import createSystemLogRoutes from "./routes/system-logs.js";
import createAuditLogRoutes from "./routes/audit-logs.js";
import createModuleSettingsRoutes from "./routes/modulesettings.js";
import createTenantIntegrationRoutes from "./routes/tenant-integrations.js";
import createBizDevSourceRoutes from "./routes/bizdevsources.js";
import createTenantRoutes from "./routes/tenants.js";
import createAnnouncementRoutes from "./routes/announcements.js";
import createApikeyRoutes from "./routes/apikeys.js";
import createNoteRoutes from "./routes/notes.js";
import createSystemBrandingRoutes from "./routes/systembrandings.js";
import createSyncHealthRoutes from "./routes/synchealths.js";

// Mount routers with database pool
app.use("/api/database", createDatabaseRoutes(pgPool));
app.use("/api/integrations", createIntegrationRoutes(pgPool));
app.use("/api/telephony", createTelephonyRoutes(pgPool));
app.use("/api/ai", createAiRoutes(pgPool));
app.use("/api/mcp", createMcpRoutes(pgPool));
app.use("/api/accounts", createAccountRoutes(pgPool));
app.use("/api/leads", createLeadRoutes(pgPool));
app.use("/api/contacts", createContactRoutes(pgPool));
app.use("/api/validation", createValidationRoutes(pgPool));
app.use("/api/billing", createBillingRoutes(pgPool));
app.use("/api/storage", createStorageRoutes(pgPool));
app.use("/api/webhooks", createWebhookRoutes(pgPool));
app.use("/api/system", createSystemRoutes(pgPool));
app.use("/api/users", createUserRoutes(pgPool, supabaseAuth));
app.use("/api/employees", createEmployeeRoutes(pgPool));
app.use("/api/permissions", createPermissionRoutes(pgPool));
app.use("/api/testing", createTestingRoutes(pgPool));
app.use("/api/documents", createDocumentRoutes(pgPool));
app.use("/api/reports", createReportRoutes(pgPool));
app.use("/api/cashflow", createCashflowRoutes(pgPool));
app.use("/api/cron", createCronRoutes(pgPool));
app.use("/api/metrics", createMetricsRoutes(pgPool));
app.use("/api/utils", createUtilsRoutes(pgPool));
app.use("/api/bizdev", createBizdevRoutes(pgPool));
app.use("/api/bizdevsources", createBizDevSourceRoutes(pgPool));
app.use("/api/clients", createClientRoutes(pgPool));
app.use("/api/workflows", createWorkflowRoutes(pgPool));
app.use("/api/workflowexecutions", createWorkflowExecutionRoutes(pgPool));
app.use("/api/activities", createActivityRoutes(pgPool));
app.use("/api/opportunities", createOpportunityRoutes(pgPool));
app.use("/api/notifications", createNotificationRoutes(pgPool));
app.use("/api/system-logs", createSystemLogRoutes(pgPool));
app.use("/api/audit-logs", createAuditLogRoutes(pgPool));
app.use("/api/modulesettings", createModuleSettingsRoutes(pgPool));
app.use("/api/tenantintegrations", createTenantIntegrationRoutes(pgPool));
app.use("/api/tenants", createTenantRoutes(pgPool));
app.use("/api/announcements", createAnnouncementRoutes(pgPool));
app.use("/api/apikeys", createApikeyRoutes(pgPool));
app.use("/api/notes", createNoteRoutes(pgPool));
app.use("/api/systembrandings", createSystemBrandingRoutes(pgPool));
app.use("/api/synchealths", createSyncHealthRoutes(pgPool));

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
  res.status(err.status || 500).json({
    status: "error",
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Helper to log backend lifecycle events to system_logs
async function logBackendEvent(level, message, metadata = {}) {
  if (!pgPool) return; // Skip if no database

  try {
    const query = `
      INSERT INTO system_logs (
        tenant_id, level, message, source, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, NOW()
      )
    `;

    await pgPool.query(query, [
      "system", // Special tenant_id for system events
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

async function writeHeartbeat() {
  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO system_logs (tenant_id, level, message, source, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        "system",
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
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  // Immediate heartbeat then every 60 seconds
  writeHeartbeat();
  heartbeatTimer = setInterval(writeHeartbeat, 60000);
}

async function logRecoveryIfGap() {
  if (!pgPool) return;
  try {
    const result = await pgPool.query(
      `SELECT created_at FROM system_logs
       WHERE tenant_id = 'system' AND source = 'Backend Server' AND message = 'Heartbeat'
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
      console.log(`✓ Supabase storage bucket '${bucket}' exists`);
      return;
    }
    // Fallback via listBuckets when getBucket not available
    const { data: list } = await supabase.storage.listBuckets();
    if (list && Array.isArray(list) && list.find((b) => b.name === bucket)) {
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Aisha CRM Independent Backend Server                 ║
║                                                           ║
║   Status: Running                                         ║
║   Port: ${PORT}                                              ║
║   Environment: ${
    process.env.NODE_ENV || "development"
  }                              ║
║   Database: ${
    pgPool ? "Connected (" + dbConnectionType + ")" : "Not configured"
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
