/**
 * C.A.R.E. Workflow Webhook Trigger Client
 * 
 * PR8: Workflow Webhook Trigger Integration
 * 
 * Non-blocking HTTP client for triggering workflow webhooks.
 * Handles signing, timeouts, retries, and graceful failure.
 */

import crypto from 'crypto';
import logger from '../logger.js';

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
 * Trigger a C.A.R.E. workflow webhook (non-blocking)
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

  let lastError = null;
  let attempt = 0;

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
}

export {
  triggerCareWorkflow,
  generateSignature // Exported for testing
};
