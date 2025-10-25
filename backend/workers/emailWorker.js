/**
 * Email Worker
 * Polls activities table for queued email activities and sends them via SMTP
 */

import dotenv from 'dotenv';
import pkg from 'pg';
import nodemailer from 'nodemailer';

const { Pool } = pkg;

// Load environment (.env.local first, then .env)
dotenv.config({ path: '.env.local' });
dotenv.config();

// Database connection (mirrors server.js logic)
let pgPool = null;
if (process.env.USE_SUPABASE_PROD === 'true') {
  pgPool = new Pool({
    host: process.env.SUPABASE_DB_HOST,
    port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
    database: process.env.SUPABASE_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
} else if (process.env.DATABASE_URL) {
  const isSupabaseCloud = process.env.DATABASE_URL.includes('supabase.co');
  const poolConfig = { connectionString: process.env.DATABASE_URL };
  if (isSupabaseCloud || process.env.DB_SSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
  pgPool = new Pool(poolConfig);
} else {
  console.error('[EmailWorker] No database configured (set DATABASE_URL or USE_SUPABASE_PROD=true)');
}

// SMTP transporter
let transporter = null;
function ensureTransporter() {
  if (!process.env.SMTP_HOST) {
    console.warn('[EmailWorker] SMTP_HOST is not configured; skipping email send');
    transporter = null;
    return null;
  }
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: (process.env.SMTP_USER || process.env.SMTP_PASS) ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
  return transporter;
}

const FROM_DEFAULT = process.env.SMTP_FROM || 'no-reply@localhost';
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
    console.warn('[EmailWorker] Status webhook failed:', e?.message);
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
    console.warn('[EmailWorker] Failed to create notification:', e?.message);
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
  const from = email.from || FROM_DEFAULT;

  if (!toValue) {
    const failedMeta = { ...meta, delivery: { error: 'Missing recipient', failed_at: new Date().toISOString() } };
    await markActivity(activity.id, 'failed', failedMeta);
    console.warn('[EmailWorker] Skipping email activity due to missing recipient', activity.id);
    return;
  }

  const toList = Array.isArray(toValue) ? toValue : String(toValue).split(',').map(s => s.trim()).filter(Boolean);
  const t = ensureTransporter();
  if (!t) {
    // Leave queued; do not mark failed when transporter is not configured
    return;
  }

  try {
    const info = await t.sendMail({
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
        provider: 'smtp',
        messageId: info?.messageId,
        sent_at: new Date().toISOString(),
        attempts: ((meta.delivery && meta.delivery.attempts) || 0) + 1,
      }
    };
    await markActivity(activity.id, 'sent', sentMeta);
    console.log('[EmailWorker] Sent email activity', activity.id, info?.messageId);
    await postStatusWebhook({ event: 'email.sent', activity_id: activity.id, tenant_id: activity.tenant_id, to: toList, subject, messageId: info?.messageId });
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
      console.warn('[EmailWorker] Email send failed, will retry', { activity_id: activity.id, attempts, next_attempt_at: delivery.next_attempt_at });
      await postStatusWebhook({ event: 'email.retry_scheduled', activity_id: activity.id, tenant_id: activity.tenant_id, attempts, next_attempt_at: delivery.next_attempt_at, error: err.message });
    } else {
      const failedMeta = { ...meta, delivery: { ...delivery, failed_at: new Date().toISOString() } };
      await markActivity(activity.id, 'failed', failedMeta);
      console.error('[EmailWorker] Failed to send email activity (max attempts reached)', activity.id, err.message);
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
    console.error('[EmailWorker] Loop error:', err.message);
  } finally {
    setTimeout(loop, POLL_INTERVAL_MS);
  }
}

console.log('[EmailWorker] Starting email worker...');
loop();

process.on('SIGTERM', async () => {
  console.log('[EmailWorker] SIGTERM received, shutting down...');
  try {
    if (pgPool) {
      await pgPool.end();
    }
  } catch (e) {
    console.warn('[EmailWorker] Error during pool shutdown:', e?.message);
  }
  process.exit(0);
});
