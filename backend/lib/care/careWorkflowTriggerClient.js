/**
 * C.A.R.E. Workflow Webhook Trigger Client
 * 
 * PR8: Workflow Webhook Trigger Integration
 * 
 * Non-blocking HTTP client for triggering workflow webhooks.
 * Handles signing, timeouts, retries, concurrency limiting, and graceful failure.
 */

import crypto from 'crypto';
import logger from '../logger.js';

/**
 * Default limits — tune via environment or pass overrides
 */
const DEFAULT_MAX_CONCURRENCY = parseInt(process.env.CARE_WEBHOOK_MAX_CONCURRENCY) || 5;
const DEFAULT_BATCH_SIZE = parseInt(process.env.CARE_WEBHOOK_BATCH_SIZE) || 50;

/**
 * Simple counting semaphore for outbound webhook concurrency
 * Prevents thundering herd when a poll cycle yields many triggers.
 */
class Semaphore {
  constructor(max) {
    this._max = max;
    this._active = 0;
    this._queue = [];
  }

  async acquire() {
    if (this._active < this._max) {
      this._active++;
      return;
    }
    // Wait for a release
    await new Promise(resolve => this._queue.push(resolve));
    this._active++;
  }

  release() {
    this._active--;
    if (this._queue.length > 0) {
      const next = this._queue.shift();
      next();
    }
  }

  get active() { return this._active; }
  get pending() { return this._queue.length; }
}

/** Module-level semaphore (shared across all calls in this process) */
const webhookSemaphore = new Semaphore(DEFAULT_MAX_CONCURRENCY);

/**
 * Generate HMAC-SHA256 signature for webhook payload
 * @param {string} payload - JSON stringified payload
 * @param {string} secret - Webhook secret
 * @returns {string} Hex-encoded signature
 */
function generateSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * Trigger a C.A.R.E. workflow webhook (non-blocking, concurrency-limited)
 * 
 * @param {Object} options
 * @param {string} options.url - Workflow webhook URL
 * @param {string} [options.secret] - HMAC secret for signing
 * @param {Object} options.payload - Event payload
 * @param {number} [options.timeout_ms=3000] - Request timeout in milliseconds
 * @param {number} [options.retries=2] - Maximum retry attempts
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function triggerCareWorkflow({
  url,
  secret,
  payload,
  timeout_ms = 3000,
  retries = 2
}) {
  if (!url) {
    logger.warn('[CARE_AUDIT] action_skipped: No workflow webhook URL configured');
    return { success: false, error: 'No URL configured' };
  }

  const eventId = payload.event_id;
  const body = JSON.stringify(payload);
  
  const headers = {
    'Content-Type': 'application/json',
    'X-AISHA-EVENT-ID': eventId,
    'User-Agent': 'AiSHA-CARE/1.0'
  };

  // Add HMAC signature if secret provided
  if (secret) {
    headers['X-AISHA-SIGNATURE'] = generateSignature(body, secret);
  }

  // Acquire semaphore slot before making outbound request
  await webhookSemaphore.acquire();

  let lastError = null;
  let attempt = 0;

  try {
    while (attempt <= retries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout_ms);

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          logger.info(`[CARE_AUDIT] action_candidate: Workflow triggered successfully (event_id=${eventId}, attempt=${attempt + 1})`);
          return { success: true };
        } else {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
          logger.warn(`[CARE_AUDIT] action_skipped: Workflow trigger failed (event_id=${eventId}, attempt=${attempt + 1}, status=${response.status})`);
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          lastError = `Timeout after ${timeout_ms}ms`;
          logger.warn(`[CARE_AUDIT] action_skipped: Workflow trigger timeout (event_id=${eventId}, attempt=${attempt + 1})`);
        } else {
          lastError = error.message;
          logger.warn(`[CARE_AUDIT] action_skipped: Workflow trigger error (event_id=${eventId}, attempt=${attempt + 1}, error=${error.message})`);
        }
      }

      attempt++;
      
      // Exponential backoff between retries (100ms, 200ms, 400ms...)
      if (attempt <= retries) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
      }
    }

    logger.error(`[CARE_AUDIT] action_skipped: Workflow trigger failed after ${retries + 1} attempts (event_id=${eventId}, error=${lastError})`);
    return { success: false, error: lastError };
  } finally {
    webhookSemaphore.release();
  }
}

/**
 * Trigger webhooks for a batch of payloads with concurrency and size cap.
 * 
 * If the batch exceeds DEFAULT_BATCH_SIZE, only the first N are processed
 * and the rest are logged as skipped. This prevents a single poll cycle
 * from flooding the webhook target (e.g. 10k stagnant leads).
 * 
 * @param {Object} options
 * @param {string} options.url - Webhook URL
 * @param {string} [options.secret] - HMAC secret
 * @param {Object[]} options.payloads - Array of event payloads
 * @param {number} [options.timeout_ms=3000] - Per-request timeout
 * @param {number} [options.retries=2] - Per-request retries
 * @param {number} [options.batch_size] - Max payloads to process (default: CARE_WEBHOOK_BATCH_SIZE or 50)
 * @returns {Promise<{sent: number, skipped: number, failed: number, errors: string[]}>}
 */
async function triggerCareWorkflowBatch({
  url,
  secret,
  payloads,
  timeout_ms = 3000,
  retries = 2,
  batch_size = DEFAULT_BATCH_SIZE,
}) {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return { sent: 0, skipped: 0, failed: 0, errors: [] };
  }

  const cap = Math.max(1, batch_size);
  const toProcess = payloads.slice(0, cap);
  const skippedCount = Math.max(0, payloads.length - cap);

  if (skippedCount > 0) {
    logger.warn(`[CARE_AUDIT] action_skipped: Batch cap reached — processing ${cap} of ${payloads.length} payloads, ${skippedCount} deferred`);
  }

  // Fire all within cap concurrently (semaphore handles throttling)
  const results = await Promise.allSettled(
    toProcess.map(payload =>
      triggerCareWorkflow({ url, secret, payload, timeout_ms, retries })
    )
  );

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success) {
      sent++;
    } else {
      failed++;
      const err = result.status === 'rejected'
        ? result.reason?.message || 'Unknown error'
        : result.value?.error || 'Unknown error';
      errors.push(err);
    }
  }

  return { sent, skipped: skippedCount, failed, errors };
}

export {
  triggerCareWorkflow,
  triggerCareWorkflowBatch,
  generateSignature, // Exported for testing
  Semaphore,         // Exported for testing
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_BATCH_SIZE,
};
