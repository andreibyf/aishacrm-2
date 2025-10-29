/**
 * Independent Backend Server for Aisha CRM
 * Provides fallback API endpoints when Ai-SHA is down
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import pkg from 'pg';
const { Pool } = pkg;

// Load environment variables
// Try .env.local first (for local development), then fall back to .env
dotenv.config({ path: '.env.local' });
dotenv.config(); // Fallback to .env if .env.local doesn't exist

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection pool with Supabase support
let pgPool = null;
let dbConnectionType = 'none';

if (process.env.USE_SUPABASE_PROD === 'true') {
  // Connect to Supabase Production
  const supabaseConfig = {
    host: process.env.SUPABASE_DB_HOST,
    port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: {
      rejectUnauthorized: false // Required for Supabase
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
  
  pgPool = new Pool(supabaseConfig);
  dbConnectionType = 'Supabase Production';
  console.log('✓ PostgreSQL connection pool initialized (Supabase Production)');
} else if (process.env.DATABASE_URL) {
  // Connect using DATABASE_URL (supports local Docker or Supabase Cloud)
  const isSupabaseCloud = process.env.DATABASE_URL.includes('supabase.co');
  
  const poolConfig = {
    connectionString: process.env.DATABASE_URL,
  };
  
  // Add SSL for Supabase Cloud connections
  if (isSupabaseCloud || process.env.DB_SSL === 'true') {
    poolConfig.ssl = {
      rejectUnauthorized: false
    };
    dbConnectionType = 'Supabase Cloud DEV/QA';
  } else {
    dbConnectionType = 'Local Docker';
  }
  
  pgPool = new Pool(poolConfig);
  console.log(`✓ PostgreSQL connection pool initialized (${dbConnectionType})`);
} else {
  console.warn('⚠ No database configured - set DATABASE_URL or USE_SUPABASE_PROD=true');
}

// Initialize Supabase Auth
import { initSupabaseAuth } from './lib/supabaseAuth.js';
const supabaseAuth = initSupabaseAuth();

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(morgan('combined')); // Logging

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Performance logging middleware (must be after body parsers, before routes)
import { performanceLogger } from './middleware/performanceLogger.js';
if (pgPool) {
  app.use(performanceLogger(pgPool));
  console.log('✓ Performance logging middleware enabled');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    database: pgPool ? 'connected' : 'not configured',
  });
});

// Status endpoint (compatible with checkBackendStatus function)
app.get('/api/status', (req, res) => {
  res.json({
    status: 'success',
    message: 'Backend server is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      database: pgPool ? 'connected' : 'not configured',
      mode: 'independent',
    },
  });
});

// Import function routers
import createDatabaseRoutes from './routes/database.js';
import createIntegrationRoutes from './routes/integrations.js';
import createTelephonyRoutes from './routes/telephony.js';
import createAiRoutes from './routes/ai.js';
import createMcpRoutes from './routes/mcp.js';
import createAccountRoutes from './routes/accounts.js';
import createLeadRoutes from './routes/leads.js';
import createContactRoutes from './routes/contacts.js';
import createValidationRoutes from './routes/validation.js';
import createBillingRoutes from './routes/billing.js';
import createStorageRoutes from './routes/storage.js';
import createWebhookRoutes from './routes/webhooks.js';
import createSystemRoutes from './routes/system.js';
import createUserRoutes from './routes/users.js';
import createEmployeeRoutes from './routes/employees.js';
import createPermissionRoutes from './routes/permissions.js';
import createTestingRoutes from './routes/testing.js';
import createDocumentRoutes from './routes/documents.js';
import createReportRoutes from './routes/reports.js';
import createCashflowRoutes from './routes/cashflow.js';
import createCronRoutes from './routes/cron.js';
import createMetricsRoutes from './routes/metrics.js';
import createUtilsRoutes from './routes/utils.js';
import createBizdevRoutes from './routes/bizdev.js';
import createClientRoutes from './routes/clients.js';
import createWorkflowRoutes from './routes/workflows.js';
import createWorkflowExecutionRoutes from './routes/workflowexecutions.js';
import createActivityRoutes from './routes/activities.js';
import createOpportunityRoutes from './routes/opportunities.js';
import createNotificationRoutes from './routes/notifications.js';
import createSystemLogRoutes from './routes/system-logs.js';
import createAuditLogRoutes from './routes/audit-logs.js';
import createModuleSettingsRoutes from './routes/modulesettings.js';
import createTenantIntegrationRoutes from './routes/tenant-integrations.js';
import createBizDevSourceRoutes from './routes/bizdevsources.js';
import createTenantRoutes from './routes/tenants.js';
import createAnnouncementRoutes from './routes/announcements.js';
import createApikeyRoutes from './routes/apikeys.js';
import createNoteRoutes from './routes/notes.js';
import createSystemBrandingRoutes from './routes/systembrandings.js';

// Mount routers with database pool
app.use('/api/database', createDatabaseRoutes(pgPool));
app.use('/api/integrations', createIntegrationRoutes(pgPool));
app.use('/api/telephony', createTelephonyRoutes(pgPool));
app.use('/api/ai', createAiRoutes(pgPool));
app.use('/api/mcp', createMcpRoutes(pgPool));
app.use('/api/accounts', createAccountRoutes(pgPool));
app.use('/api/leads', createLeadRoutes(pgPool));
app.use('/api/contacts', createContactRoutes(pgPool));
app.use('/api/validation', createValidationRoutes(pgPool));
app.use('/api/billing', createBillingRoutes(pgPool));
app.use('/api/storage', createStorageRoutes(pgPool));
app.use('/api/webhooks', createWebhookRoutes(pgPool));
app.use('/api/system', createSystemRoutes(pgPool));
app.use('/api/users', createUserRoutes(pgPool, supabaseAuth));
app.use('/api/employees', createEmployeeRoutes(pgPool));
app.use('/api/permissions', createPermissionRoutes(pgPool));
app.use('/api/testing', createTestingRoutes(pgPool));
app.use('/api/documents', createDocumentRoutes(pgPool));
app.use('/api/reports', createReportRoutes(pgPool));
app.use('/api/cashflow', createCashflowRoutes(pgPool));
app.use('/api/cron', createCronRoutes(pgPool));
app.use('/api/metrics', createMetricsRoutes(pgPool));
app.use('/api/utils', createUtilsRoutes(pgPool));
app.use('/api/bizdev', createBizdevRoutes(pgPool));
app.use('/api/bizdevsources', createBizDevSourceRoutes(pgPool));
app.use('/api/clients', createClientRoutes(pgPool));
app.use('/api/workflows', createWorkflowRoutes(pgPool));
app.use('/api/workflowexecutions', createWorkflowExecutionRoutes(pgPool));
app.use('/api/activities', createActivityRoutes(pgPool));
app.use('/api/opportunities', createOpportunityRoutes(pgPool));
app.use('/api/notifications', createNotificationRoutes(pgPool));
app.use('/api/system-logs', createSystemLogRoutes(pgPool));
app.use('/api/audit-logs', createAuditLogRoutes(pgPool));
app.use('/api/modulesettings', createModuleSettingsRoutes(pgPool));
app.use('/api/tenantintegrations', createTenantIntegrationRoutes(pgPool));
app.use('/api/tenants', createTenantRoutes(pgPool));
app.use('/api/announcements', createAnnouncementRoutes(pgPool));
app.use('/api/apikeys', createApikeyRoutes(pgPool));
app.use('/api/notes', createNoteRoutes(pgPool));
app.use('/api/systembrandings', createSystemBrandingRoutes(pgPool));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    path: req.path,
  });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Helper to log backend lifecycle events to system_logs
async function logBackendEvent(level, message, metadata = {}) {
  if (!pgPool) return; // Skip if no database
  
  try {
    const query = `
      INSERT INTO system_logs (
        tenant_id, level, message, source, user_email, 
        metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, NOW()
      )
    `;
    
    await pgPool.query(query, [
      'system', // Special tenant_id for system events
      level,
      message,
      'Backend Server',
      'system@aishacrm.com',
      JSON.stringify({
        ...metadata,
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        database_type: dbConnectionType,
        timestamp: new Date().toISOString()
      })
    ]);
  } catch (error) {
    // Don't fail startup/shutdown if logging fails
    console.error('Failed to log backend event:', error.message);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Log shutdown event
  await logBackendEvent('WARNING', 'Backend server shutting down (SIGTERM received)', {
    uptime_seconds: process.uptime(),
    shutdown_reason: 'SIGTERM signal'
  });
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  
  if (pgPool) {
    pgPool.end(() => {
      console.log('PostgreSQL pool closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Handle unexpected crashes
process.on('uncaughtException', async (err) => {
  console.error('[uncaughtException]', err);
  
  // Log crash event
  await logBackendEvent('ERROR', 'Backend server crashed (uncaughtException)', {
    error: err.message,
    stack_trace: err.stack,
    uptime_seconds: process.uptime()
  });
  
  // Don't exit on uncaught exceptions in development
  if (process.env.NODE_ENV !== 'development') {
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
      `INSERT INTO system_logs (tenant_id, level, message, source, user_email, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        'system',
        'INFO',
        'Heartbeat',
        'Backend Server',
        'system@aishacrm.com',
        JSON.stringify({ type: 'heartbeat' })
      ]
    );
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Failed to write heartbeat:', e.message);
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
       ORDER BY created_at DESC LIMIT 1`
    );
    if (result.rows.length > 0) {
      const last = new Date(result.rows[0].created_at);
      const gapMs = Date.now() - last.getTime();
      const thresholdMs = 2 * 60 * 1000; // >2 minutes gap implies downtime
      if (gapMs > thresholdMs) {
        await logBackendEvent('WARNING', 'Backend recovered after downtime', {
          downtime_ms: gapMs,
          last_heartbeat: last.toISOString()
        });
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Failed to check last heartbeat:', e.message);
    }
  }
}

// Start server
const server = createServer(app);

server.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Aisha CRM Independent Backend Server                 ║
║                                                           ║
║   Status: Running                                         ║
║   Port: ${PORT}                                              ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║   Database: ${pgPool ? 'Connected (' + dbConnectionType + ')' : 'Not configured'}   ║
║                                                           ║
║   Health Check: http://localhost:${PORT}/health             ║
║   API Status: http://localhost:${PORT}/api/status           ║
║                                                           ║
║   Total Endpoints: 197 functions across 26 categories    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  // Log startup event
  await logBackendEvent('INFO', 'Backend server started successfully', {
    endpoints_count: 197,
    categories_count: 26,
    startup_time: new Date().toISOString()
  });

  // If there was a gap in heartbeats, log a recovery event, then start periodic heartbeats
  await logRecoveryIfGap();
  startHeartbeat();
});

// Handle server errors (port already in use, etc.)
server.on('error', async (error) => {
  console.error('Server error:', error);
  
  // Log server error
  await logBackendEvent('ERROR', `Backend server error: ${error.message}`, {
    error_code: error.code,
    error: error.message,
    stack_trace: error.stack
  });
  
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// Handle unhandled rejections - log them to system_logs
process.on('unhandledRejection', async (err) => {
  console.error('[unhandledRejection]', err);
  
  // Log unhandled rejection
  await logBackendEvent('ERROR', 'Unhandled promise rejection detected', {
    error: err?.message || String(err),
    stack_trace: err?.stack,
    type: 'unhandledRejection'
  });
});

export { app, pgPool, server };

