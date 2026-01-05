/**
 * Email Worker
 * Polls activities table for queued email activities and sends them via SMTP
 */

import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { pool as pgPool } from '../lib/supabase-db.js';
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
      logger.debug(`[EmailWorker] No Gmail SMTP integration found for tenant ${tenantId}`);
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
function getSysadminTransporter() {
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

const FROM_DEFAULT_SYSADMIN = process.env.SMTP_FROM || 'no-reply@localhost';
const POLL_INTERVAL_MS = parseInt(process.env.EMAIL_WORKER_POLL_MS || '5000');
const BATCH_LIMIT = parseInt(process.env.EMAIL_WORKER_BATCH_LIMIT || '10');

async function fetchQueuedEmails() {
  const q = `
    SELECT * FROM activities
    WHERE type = 'email'
      AND status = 'queued'
      AND (
        (metadata->'delivery'->>'next_attempt_at') IS NULL
        OR (metadata->'delivery'->>'next_attempt_at')::timestamptz <= NOW()
      )
    ORDER BY created_date ASC
    LIMIT $1
  `;
  const r = await pgPool.query(q, [BATCH_LIMIT]);
  return r.rows || [];
}

function parseEmailMeta(metadata) {
  const meta = (metadata && typeof metadata === 'object') ? metadata : {};
  const email = (meta.email && typeof meta.email === 'object') ? meta.email : {};
  return email;
}

async function markActivity(activityId, status, newMeta) {
  const q = `UPDATE activities SET status = $1, metadata = $2, updated_date = NOW() WHERE id = $3`;
  await pgPool.query(q, [status, JSON.stringify(newMeta || {}), activityId]);
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
  const tenantSMTPConfig = await getTenantSMTPConfig(activity.tenant_id);
  
  if (!tenantSMTPConfig) {
    // No tenant SMTP configured - fail with helpful error
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
    logger.debug('[EmailWorker] Sent email activity', activity.id, info?.messageId);
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
      logger.error('[EmailWorker] Failed to send email activity (max attempts reached)', activity.id, err.message);
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

logger.debug('[EmailWorker] Starting email worker...');
loop();

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
