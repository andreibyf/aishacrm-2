/**
 * Independent Backend Server for Aisha CRM
 * Provides fallback API endpoints when Base44 is down
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
      base44: 'independent',
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
app.use('/api/users', createUserRoutes(pgPool));
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (pgPool) {
    pgPool.end(() => {
      console.log('PostgreSQL pool closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Start server
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Aisha CRM Independent Backend Server                 ║
║                                                           ║
║   Status: Running                                         ║
║   Port: ${PORT}                                              ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║   Database: ${pgPool ? 'Connected' : 'Not configured'}                           ║
║                                                           ║
║   Health Check: http://localhost:${PORT}/health             ║
║   API Status: http://localhost:${PORT}/api/status           ║
║                                                           ║
║   Total Endpoints: 197 functions across 26 categories    ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Handle server errors (port already in use, etc.)
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
});

// Handle unhandled rejections and exceptions to prevent silent crashes
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Don't exit on uncaught exceptions in development
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

export { app, pgPool, server };
