/**
 * Email Worker
 * Polls activities table for queued email activities and sends them via SMTP
 */

import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { pool as pgPool, getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

// Load environment (.env.local first, then .env)
dotenv.config({ path: '.env.local' });
dotenv.config();

// Database connection via Supabase pool wrapper (replaces direct pg.Pool)
if (!pgPool) {
  logger.error('[EmailWorker] No database configured (ensure Supabase client is initialized)');
}

/**
 * Get tenant-specific SMTP configuration from tenant_integrations
 * Returns null if not configured
 */
async function getTenantSMTPConfig(tenantId) {
  if (!tenantId) return null;
  
  try {
    // Debug: Check ALL gmail_smtp integrations first
    const debugQuery = `SELECT tenant_id, integration_type, is_active FROM tenant_integrations WHERE integration_type = 'gmail_smtp'`;
    const debugResult = await pgPool.query(debugQuery);
    logger.info(`[EmailWorker] 📧 Found ${debugResult.rows.length} gmail_smtp integrations total:`);
    debugResult.rows.forEach((row, idx) => {
      logger.info(`[EmailWorker]   ${idx + 1}. Tenant: ${row.tenant_id} | Active: ${row.is_active}`);
    });
    logger.info(`[EmailWorker] 🎯 Looking for tenant_id: ${tenantId}`);
    
    const query = `
      SELECT api_credentials, configuration, is_active
      FROM tenant_integrations
      WHERE tenant_id = $1
        AND integration_type = 'gmail_smtp'
        AND is_active = true
      LIMIT 1
    `;
    const result = await pgPool.query(query, [tenantId]);
    
    if (result.rows.length === 0) {
      logger.debug(`[EmailWorker] ❌ No Gmail SMTP integration found for tenant ${tenantId}`);
      return null;
    }
    
    const integration = result.rows[0];
    const credentials = integration.api_credentials || {};
    const config = integration.configuration || {};
    
    if (!credentials.smtp_user || !credentials.smtp_password) {
      logger.warn(`[EmailWorker] Incomplete Gmail SMTP credentials for tenant ${tenantId}`);
      return null;
    }
    
    return {
      host: config.smtp_host || 'smtp.gmail.com',
      port: parseInt(config.smtp_port || '587'),
      secure: config.smtp_secure === true || config.smtp_port === '465',
      auth: {
        user: credentials.smtp_user,
        pass: credentials.smtp_password
      },
      from: config.smtp_from || credentials.smtp_user
    };
  } catch (err) {
    logger.error(`[EmailWorker] Error fetching tenant SMTP config: ${err.message}`);
    return null;
  }
}

/**
 * Create SMTP transporter for specific configuration
 * Returns null if config invalid
 */
function createTransporter(config) {
  if (!config || !config.host || !config.auth?.user) {
    return null;
  }
  
  try {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth
    });
  } catch (err) {
    logger.error(`[EmailWorker] Error creating transporter: ${err.message}`);
    return null;
  }
}

// SYSADMIN SMTP transporter (NEVER use for tenant workflows)
let sysadminTransporter = null;
function _getSysadminTransporter() {
  if (!process.env.SMTP_HOST) {
    logger.warn('[EmailWorker] Sysadmin SMTP_HOST is not configured');
    sysadminTransporter = null;
    return null;
  }
  if (sysadminTransporter) return sysadminTransporter;
  sysadminTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: (process.env.SMTP_USER || process.env.SMTP_PASS) ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
  return sysadminTransporter;
}

const _FROM_DEFAULT_SYSADMIN = process.env.SMTP_FROM || 'no-reply@localhost';
const POLL_INTERVAL_MS = parseInt(process.env.EMAIL_WORKER_POLL_MS || '5000');
const BATCH_LIMIT = parseInt(process.env.EMAIL_WORKER_BATCH_LIMIT || '10');

async function fetchQueuedEmails() {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  
  const { data: activities, error } = await supabase
    .from('activities')
    .select('*')
    .eq('type', 'email')
    .eq('status', 'queued')
    // Fixed JSONB path: use -> for nested navigation, ->> only for final text extraction
    .or(`metadata->delivery->next_attempt_at.is.null,metadata->delivery->>next_attempt_at.lte.${now}`)
    .order('created_date', { ascending: true })
    .limit(BATCH_LIMIT);
  
  if (error) {
    // Enhanced error logging with full error details
    logger.error('[fetchQueuedEmails] Error fetching queued emails:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      fullError: error
    });
    return [];
  }
  
  if (activities && activities.length > 0) {
    logger.debug(`[fetchQueuedEmails] Found ${activities.length} queued emails:`, activities.map(a => ({ id: a.id, status: a.status })));
  }
  return activities || [];
}

function parseEmailMeta(metadata) {
  const meta = (metadata && typeof metadata === 'object') ? metadata : {};
  const email = (meta.email && typeof meta.email === 'object') ? meta.email : {};
  return email;
}

async function markActivity(activityId, status, newMeta) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('activities')
      .update({
        status: status,
        metadata: newMeta || {}
      })
      .eq('id', activityId)
      .select();
    
    if (error) {
      logger.error(`[markActivity] Failed to update activity ${activityId} to status '${status}':`, error.message);
      throw error;
    }
    
    logger.debug(`[markActivity] Updated activity ${activityId} to status '${status}', rows affected: ${data?.length || 0}`);
  } catch (err) {
    logger.error(`[markActivity] Failed to update activity ${activityId} to status '${status}':`, err.message);
    throw err;
  }
}

const MAX_ATTEMPTS = parseInt(process.env.EMAIL_MAX_ATTEMPTS || '5');
const BACKOFF_BASE_MS = parseInt(process.env.EMAIL_BACKOFF_BASE_MS || '10000'); // 10s
const BACKOFF_FACTOR = parseFloat(process.env.EMAIL_BACKOFF_FACTOR || '2');
const BACKOFF_JITTER_MS = parseInt(process.env.EMAIL_BACKOFF_JITTER_MS || '2000');
const STATUS_WEBHOOK = process.env.EMAIL_STATUS_WEBHOOK_URL;

async function postStatusWebhook(payload) {
  if (!STATUS_WEBHOOK) return;
  try {
    await fetch(STATUS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    logger.warn('[EmailWorker] Status webhook failed:', e?.message);
  }
}

async function createNotification({ tenant_id, title, message, type = 'info', user_email = null }) {
  try {
    await pgPool.query(
      `INSERT INTO notifications (tenant_id, user_email, title, message, type, is_read, created_date)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [tenant_id, user_email, title, message, type, false]
    );
  } catch (e) {
    logger.warn('[EmailWorker] Failed to create notification:', e?.message);
  }
}

function computeNextAttempt(attempts) {
  const delay = BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, Math.max(0, attempts - 1));
  const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS);
  return new Date(Date.now() + delay + jitter).toISOString();
}

async function processActivity(activity) {
  const meta = (activity.metadata && typeof activity.metadata === 'object') ? activity.metadata : {};
  const email = parseEmailMeta(meta);

  // 🔍 DEBUG: Log activity tenant_id
  logger.info(`[EmailWorker] Processing email activity ${activity.id} with tenant_id: ${activity.tenant_id}`);
  logger.info(`[EmailWorker] 📧 Email metadata:`, { email, subject: activity.subject });

  const toValue = email.to || activity.subject; // fallback if needed
  const subject = email.subject || activity.subject || 'Notification';
  const body = activity.body || email.body || '';

  if (!toValue) {
    const failedMeta = { ...meta, delivery: { error: 'Missing recipient', failed_at: new Date().toISOString() } };
    await markActivity(activity.id, 'failed', failedMeta);
    logger.warn('[EmailWorker] Skipping email activity due to missing recipient', activity.id);
    return;
  }

  const toList = Array.isArray(toValue) ? toValue : String(toValue).split(',').map(s => s.trim()).filter(Boolean);
  
  // Get tenant-specific SMTP configuration
  logger.info(`[EmailWorker] Looking up Gmail SMTP config for tenant_id: ${activity.tenant_id}`);
  const tenantSMTPConfig = await getTenantSMTPConfig(activity.tenant_id);
  
  // Log SMTP config details (masking password)
  if (tenantSMTPConfig) {
    logger.info(`[EmailWorker] 🔧 SMTP Config: host=${tenantSMTPConfig.host}, port=${tenantSMTPConfig.port}, user=${tenantSMTPConfig.auth?.user}, from=${tenantSMTPConfig.from}`);
  }
  
  if (!tenantSMTPConfig) {
    // No tenant SMTP configured - fail with helpful error
    logger.error(`[EmailWorker] ❌ No Gmail SMTP configured for tenant ${activity.tenant_id}, activity ${activity.id}`);
    const failedMeta = { 
      ...meta, 
      delivery: { 
        error: 'No Gmail SMTP integration configured for this client. Please configure Gmail SMTP in Settings > Client Integrations.',
        failed_at: new Date().toISOString() 
      } 
    };
    await markActivity(activity.id, 'failed', failedMeta);
    logger.error(`[EmailWorker] No Gmail SMTP configured for tenant ${activity.tenant_id}, activity ${activity.id}`);
    
    // Create notification for admins
    await createNotification({
      tenant_id: activity.tenant_id,
      title: 'Email delivery failed - No SMTP configured',
      message: `Email could not be sent. Please configure Gmail SMTP in Settings > Client Integrations.`,
      type: 'error',
    });
    return;
  }

  // Create transporter with tenant-specific config
  const transporter = createTransporter(tenantSMTPConfig);
  
  if (!transporter) {
    const failedMeta = { 
      ...meta, 
      delivery: { 
        error: 'Invalid SMTP configuration',
        failed_at: new Date().toISOString() 
      } 
    };
    await markActivity(activity.id, 'failed', failedMeta);
    logger.error(`[EmailWorker] Invalid SMTP config for tenant ${activity.tenant_id}, activity ${activity.id}`);
    return;
  }

  // Use tenant SMTP from address or email.from override
  const from = email.from || tenantSMTPConfig.from;

  // Log email details before sending
  logger.info(`[EmailWorker] 📤 Attempting to send email:`, {
    from,
    to: toList,
    subject,
    smtp_host: tenantSMTPConfig.host,
    smtp_port: tenantSMTPConfig.port,
    smtp_user: tenantSMTPConfig.auth?.user
  });

  try {
    const info = await transporter.sendMail({
      from,
      to: toList.join(','),
      subject,
      text: body,
      html: /<\w+/.test(body) ? body : undefined,
    });
    
    const sentMeta = {
      ...meta,
      delivery: {
        ...(meta.delivery || {}),
        provider: 'gmail_smtp',
        smtp_user: tenantSMTPConfig.auth.user,
        messageId: info?.messageId,
        sent_at: new Date().toISOString(),
        attempts: ((meta.delivery && meta.delivery.attempts) || 0) + 1,
      }
    };
    await markActivity(activity.id, 'sent', sentMeta);
    logger.info(`[EmailWorker] ✅ Email sent successfully`, {
      activity_id: activity.id,
      messageId: info?.messageId,
      response: info?.response,
      accepted: info?.accepted,
      rejected: info?.rejected,
      to: toList
    });
    await postStatusWebhook({ 
      event: 'email.sent', 
      activity_id: activity.id, 
      tenant_id: activity.tenant_id, 
      to: toList, 
      subject, 
      messageId: info?.messageId,
      smtp_user: tenantSMTPConfig.auth.user
    });
  } catch (err) {
    const prevAttempts = (meta.delivery && meta.delivery.attempts) ? parseInt(meta.delivery.attempts) : 0;
    const attempts = prevAttempts + 1;
    const delivery = {
      ...(meta.delivery || {}),
      provider: 'smtp',
      error: err.message,
      last_error_at: new Date().toISOString(),
      attempts,
    };

    if (attempts < MAX_ATTEMPTS) {
      delivery.next_attempt_at = computeNextAttempt(attempts);
      const queuedMeta = { ...meta, delivery };
      await markActivity(activity.id, 'queued', queuedMeta);
      logger.warn('[EmailWorker] Email send failed, will retry', { activity_id: activity.id, attempts, next_attempt_at: delivery.next_attempt_at });
      await postStatusWebhook({ event: 'email.retry_scheduled', activity_id: activity.id, tenant_id: activity.tenant_id, attempts, next_attempt_at: delivery.next_attempt_at, error: err.message });
    } else {
      const failedMeta = { ...meta, delivery: { ...delivery, failed_at: new Date().toISOString() } };
      await markActivity(activity.id, 'failed', failedMeta);
      logger.error(`[EmailWorker] ❌ Failed to send email activity (max attempts reached). Activity: ${activity.id}, Error: ${err.message}`, { stack: err.stack });
      await postStatusWebhook({ event: 'email.failed', activity_id: activity.id, tenant_id: activity.tenant_id, attempts, error: err.message });
      await createNotification({
        tenant_id: activity.tenant_id,
        title: 'Email delivery failed',
        message: `Could not deliver email to ${toList.join(', ')} after ${attempts} attempts. Subject: ${subject}`,
        type: 'error',
      });
    }
  }
}

async function loop() {
  if (!pgPool) return;
  try {
    const rows = await fetchQueuedEmails();
    for (const row of rows) {
      await processActivity(row);
    }
  } catch (err) {
    logger.error('[EmailWorker] Loop error:', err.message);
  } finally {
    setTimeout(loop, POLL_INTERVAL_MS);
  }
}

/**
 * Start the email worker (called from server.js)
 * @param {object} pool - PostgreSQL connection pool (optional, uses module-level pgPool if not provided)
 */
// Singleton guard to prevent multiple worker loops
let workerStarted = false;

export function startEmailWorker(pool) {
  // Prevent double initialization
  if (workerStarted) {
    logger.warn('[EmailWorker] Worker already started - ignoring duplicate init');
    return {
      stop: () => {
        logger.debug('[EmailWorker] Stop called on already-running worker');
      }
    };
  }
  
  workerStarted = true;
  
  if (pool) {
    // Use provided pool (when called from server.js)
    Object.assign(pgPool, pool);
  }
  
  logger.info('[EmailWorker] Starting email worker (singleton)...');
  logger.info(`[EmailWorker] Poll interval: ${POLL_INTERVAL_MS}ms, Batch limit: ${BATCH_LIMIT}`);
  loop();
  
  return {
    stop: () => {
      logger.info('[EmailWorker] Stopping email worker...');
      workerStarted = false; // Allow restart after stop
      // The setTimeout in loop() will naturally stop being scheduled
    }
  };
}

// Auto-start if run directly (for standalone mode)
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.debug('[EmailWorker] Running in standalone mode');
  startEmailWorker();
  
  process.on('SIGTERM', async () => {
    logger.debug('[EmailWorker] SIGTERM received, shutting down...');
    try {
      if (pgPool) {
        await pgPool.end();
      }
    } catch (e) {
      logger.warn('[EmailWorker] Error during pool shutdown:', e?.message);
    }
    process.exit(0);
  });
}
