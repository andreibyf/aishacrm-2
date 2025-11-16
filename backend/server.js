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
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './lib/swagger.js';
import { initSupabaseDB, pool as supabasePool } from './lib/supabase-db.js';
import { initializePerformanceLogBatcher } from './lib/perfLogBatcher.js';
import { attachRequestContext } from './lib/requestContext.js';
import { initMemoryClient as initMemory, isMemoryAvailable } from './lib/memoryClient.js';
import { startCampaignWorker } from './lib/campaignWorker.js';

// Load environment variables
// Try .env.local first (for local development), then fall back to .env
dotenv.config({ path: ".env.local" });
dotenv.config(); // Fallback to .env if .env.local doesn't exist

// NOTE: Using Supabase PostgREST API instead of direct PostgreSQL connection
// Direct connection requires IPv6 which Docker doesn't support well
let ipv4FirstApplied = false;

const app = express();
// Behind proxies, trust X-Forwarded-* to get real client IPs
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Database connection using Supabase PostgREST API (avoids IPv6 issues)
let pgPool = null;
let dbConnectionType = "none";

// Initialize diagnostics locals with defaults (updated after DB init)
app.locals.ipv4FirstApplied = ipv4FirstApplied;
app.locals.dbConnectionType = dbConnectionType;
app.locals.resolvedDbIPv4 = null;
app.locals.dbConfigPath = (process.env.USE_SUPABASE_PROD === 'true')
  ? 'supabase_api'
  : 'none';

// Initialize database using Supabase JS API (HTTP/REST, not direct PostgreSQL)
await (async () => {
  if (process.env.USE_SUPABASE_PROD === "true") {
    // Use Supabase PostgREST API - works over HTTP, avoids IPv6 PostgreSQL issues
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    pgPool = supabasePool;
    dbConnectionType = "Supabase API";
    console.log("✓ Supabase PostgREST API initialized (HTTP-based, bypassing PostgreSQL IPv6)");

    // update diagnostics
    app.locals.dbConnectionType = dbConnectionType;
    app.locals.dbConfigPath = 'supabase_api';
    return;
  }

  console.warn("⚠ No database configured - set USE_SUPABASE_PROD=true with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
})();

// Initialize Redis/Valkey memory client (non-blocking for app startup)
try {
  await initMemory(process.env.REDIS_URL);
  console.log(`✓ Memory layer ${isMemoryAvailable() ? 'available' : 'unavailable'} (${process.env.REDIS_URL ? 'configured' : 'no REDIS_URL'})`);
} catch (e) {
  console.warn('⚠ Memory client init skipped/failed:', e?.message || e);
}

// Use Supabase client wrapper for performance logging (replaces direct pg.Pool)
// This ensures consistency with ESLint policy while maintaining performance logging capability
import { pool as perfLogPool } from './lib/supabase-db.js';
if (pgPool) {
  console.log("✓ Performance logging enabled via Supabase pool wrapper");
  // Initialize batching layer (uses Supabase client via supabase-db)
  try {
    initializePerformanceLogBatcher(pgPool);
  } catch (e) {
    console.error('[Server] Failed to init performance log batcher:', e.message);
  }
  // Test connection
  const testPerfPool = async () => {
    try {
      await perfLogPool.query('SELECT 1');
      console.log("✓ Performance logging pool connection verified");
    } catch (err) {
      console.error("✗ Performance logging pool connection failed:", err.message);
    }
  };
  testPerfPool();
}


// Initialize Supabase Auth
import { initSupabaseAuth } from "./lib/supabaseAuth.js";
const supabaseAuth = initSupabaseAuth();

// Middleware
// Apply Helmet with secure defaults globally
app.use(helmet()); // Security headers (no insecure overrides globally)
app.use(compression()); // Compress responses
app.use(morgan("combined")); // Logging
// Attach request-scoped context for accumulating DB timing
app.use(attachRequestContext);

// Simple, in-memory rate limiter (dependency-free)
// Configure via ENV: RATE_LIMIT_WINDOW_MS (default 60000), RATE_LIMIT_MAX (default 120)
// Skips health and docs endpoints by default
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
const rateBucket = new Map(); // key -> { count, ts }
const rateSkip = new Set(['/health', '/api/status', '/api-docs', '/api-docs.json']);

function rateLimiter(req, res, next) {
  try {
    if (rateSkip.has(req.path)) return next();
    // Allow OPTIONS preflight freely
    if (req.method === 'OPTIONS') return next();
    const now = Date.now();
    const key = `${req.ip}`; // after trust proxy, this reflects client IP
    const entry = rateBucket.get(key);
    if (!entry || now - entry.ts >= RATE_LIMIT_WINDOW_MS) {
      rateBucket.set(key, { count: 1, ts: now });
      return next();
    }
    if (entry.count < RATE_LIMIT_MAX) {
      entry.count++;
      return next();
    }
    // Prepare CORS headers early if not already set (ensures browser can read 429)
    if (!res.getHeader('Access-Control-Allow-Origin')) {
      const origin = req.headers.origin || '*';
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Retry-After', Math.ceil((entry.ts + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again soon.`,
    });
  } catch {
    // Fail open on limiter errors
    return next();
  }
}

// CORS configuration
// Defaults: allow localhost dev; rely on ALLOWED_ORIGINS for anything else
const defaultAllowed = [
  // Vite default
  "http://localhost:5173",
  "https://localhost:5173",
  // Dockerized frontend dev server
  "http://localhost:4000",
  "https://localhost:4000",
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

      // No platform-specific defaults; configure via ALLOWED_ORIGINS

      return callback(new Error("Not allowed by CORS"));
    } catch {
      return callback(new Error("CORS configuration error"));
    }
  },
  credentials: true,
}));

// Apply limiter to API routes AFTER CORS so 429 responses include CORS headers
app.use('/api', rateLimiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Performance logging middleware (must be after body parsers, before routes)
import { performanceLogger } from "./middleware/performanceLogger.js";
import { productionSafetyGuard } from "./middleware/productionSafetyGuard.js";
import { intrusionDetection } from "./middleware/intrusionDetection.js";
// Build a resilient perf DB wrapper that falls back to Supabase API pool if the direct pool was ended
const resilientPerfDb = {
  query: async (...args) => {
    const directAlive = perfLogPool && !perfLogPool.ended;
    const db = directAlive ? perfLogPool : pgPool;
    try {
      return await db.query(...args);
    } catch (e) {
      // Fallback broadly to Supabase API pool when direct connection fails for any reason
      if (directAlive && pgPool && db === perfLogPool) {
        try {
          return await pgPool.query(...args);
        } catch (e2) {
          // Log fallback error and re-throw original
          console.error('[ResilientPerfDb] Fallback query failed:', e2?.message || e2);
          throw e;
        }
      }
      throw e;
    }
  }
};

if (perfLogPool || pgPool) {
  app.use(performanceLogger(resilientPerfDb));
  console.log(
    `✓ Performance logging middleware enabled (${perfLogPool ? "PostgreSQL direct" : "Supabase API"})`
  );
} else {
  console.warn("⚠ Performance logging disabled - no database connection available");
}

// Block mutating requests in production Supabase unless explicitly allowed
// Exempt non-DB-mutating CI endpoints (GitHub Actions dispatch) from the guard
app.use(productionSafetyGuard({
  exemptPaths: [
    '/api/testing/run-playwright', // POST triggers GitHub workflow, no DB writes
  ],
  pgPool, // Pass database connection for security event logging
}));
console.log("✓ Production safety guard enabled");

// Attach Supabase client to request for IDR middleware
app.use((req, _res, next) => {
  req.supabase = pgPool;
  next();
});

// Enable Intrusion Detection and Response (IDR) system
if (process.env.ENABLE_IDR !== 'false') {
  app.use(intrusionDetection);
  console.log("✓ Intrusion Detection & Response (IDR) middleware enabled");
} else {
  console.warn("⚠ IDR middleware disabled via ENABLE_IDR=false");
}

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
import createDocumentationFileRoutes from "./routes/documentationfiles.js";
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
import createTenantResolveRoutes from "./routes/tenant-resolve.js";
import createAnnouncementRoutes from "./routes/announcements.js";
import createApikeyRoutes from "./routes/apikeys.js";
import createNoteRoutes from "./routes/notes.js";
import createSystemBrandingRoutes from "./routes/systembrandings.js";
import createSyncHealthRoutes from "./routes/synchealths.js";
import createAICampaignRoutes from "./routes/aicampaigns.js";
import createSecurityRoutes from "./routes/security.js";
import createMemoryRoutes from "./routes/memory.js";

// Use the pgPool directly; per-request DB time is measured inside the DB adapter
const measuredPgPool = pgPool;

// Mount routers with instrumented database pool
app.use("/api/database", createDatabaseRoutes(measuredPgPool));
app.use("/api/integrations", createIntegrationRoutes(measuredPgPool));
app.use("/api/telephony", createTelephonyRoutes(measuredPgPool));
app.use("/api/ai", createAiRoutes(measuredPgPool));
app.use("/api/mcp", createMcpRoutes(measuredPgPool));
app.use("/api/accounts", createAccountRoutes(measuredPgPool));
app.use("/api/leads", createLeadRoutes(measuredPgPool));
app.use("/api/contacts", createContactRoutes(measuredPgPool));
app.use("/api/validation", createValidationRoutes(measuredPgPool));
app.use("/api/billing", createBillingRoutes(measuredPgPool));
app.use("/api/storage", createStorageRoutes(measuredPgPool));
app.use("/api/webhooks", createWebhookRoutes(measuredPgPool));
app.use("/api/system", createSystemRoutes(measuredPgPool));
app.use("/api/users", createUserRoutes(measuredPgPool, supabaseAuth));
app.use("/api/employees", createEmployeeRoutes(measuredPgPool));
app.use("/api/permissions", createPermissionRoutes(measuredPgPool));
app.use("/api/testing", createTestingRoutes(measuredPgPool));
app.use("/api/documents", createDocumentRoutes(measuredPgPool));
app.use("/api/documentationfiles", createDocumentationFileRoutes(measuredPgPool));
app.use("/api/reports", createReportRoutes(measuredPgPool));
app.use("/api/cashflow", createCashflowRoutes(measuredPgPool));
app.use("/api/cron", createCronRoutes(measuredPgPool));
// Metrics routes read from performance_logs; use resilient wrapper to avoid ended pool errors
app.use("/api/metrics", createMetricsRoutes(resilientPerfDb));
app.use("/api/utils", createUtilsRoutes(measuredPgPool));
app.use("/api/bizdev", createBizdevRoutes(measuredPgPool));
app.use("/api/bizdevsources", createBizDevSourceRoutes(measuredPgPool));
app.use("/api/clients", createClientRoutes(measuredPgPool));
app.use("/api/workflows", createWorkflowRoutes(measuredPgPool));
app.use("/api/workflowexecutions", createWorkflowExecutionRoutes(measuredPgPool));
// Route activities through Supabase API (primary test target)
app.use("/api/activities", createActivityRoutes(measuredPgPool));
app.use("/api/opportunities", createOpportunityRoutes(measuredPgPool));
app.use("/api/notifications", createNotificationRoutes(measuredPgPool));
app.use("/api/system-logs", createSystemLogRoutes(measuredPgPool));
app.use("/api/audit-logs", createAuditLogRoutes(measuredPgPool));
app.use("/api/modulesettings", createModuleSettingsRoutes(measuredPgPool));
app.use("/api/tenantintegrations", createTenantIntegrationRoutes(measuredPgPool));
app.use("/api/tenants", createTenantRoutes(measuredPgPool));
app.use("/api/tenantresolve", createTenantResolveRoutes(measuredPgPool));
app.use("/api/announcements", createAnnouncementRoutes(measuredPgPool));
app.use("/api/apikeys", createApikeyRoutes(measuredPgPool));
app.use("/api/notes", createNoteRoutes(measuredPgPool));
app.use("/api/systembrandings", createSystemBrandingRoutes(measuredPgPool));
app.use("/api/synchealths", createSyncHealthRoutes(measuredPgPool));
app.use("/api/aicampaigns", createAICampaignRoutes(measuredPgPool));
app.use("/api/security", createSecurityRoutes(measuredPgPool, pgPool));
// Memory routes use Redis/Valkey; DB pool not required
app.use("/api/memory", createMemoryRoutes());

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
  // Optional guard to disable DB-backed logging in constrained environments
  if (process.env.DISABLE_DB_LOGGING === 'true') return;
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

  // Start campaign worker if enabled
  if (process.env.CAMPAIGN_WORKER_ENABLED === 'true' && pgPool) {
    const workerInterval = parseInt(process.env.CAMPAIGN_WORKER_INTERVAL_MS || '30000', 10);
    startCampaignWorker(pgPool, workerInterval);
  } else {
    console.log('[CampaignWorker] Disabled (set CAMPAIGN_WORKER_ENABLED=true to enable)');
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
