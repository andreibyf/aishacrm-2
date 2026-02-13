/**
 * Twilio Service
 *
 * Per-tenant Twilio SMS (and future voice) integration.
 * Credentials are stored in `tenant_integrations` with integration_type = 'twilio'.
 *
 * Expected api_credentials shape in tenant_integrations:
 * {
 *   "account_sid": "ACxxxxx",
 *   "auth_token":  "xxxxxxx",
 *   "from_number": "+15551234567"  // default sender for this tenant
 * }
 *
 * Optional config overrides:
 * {
 *   "status_callback_url": "https://...",          // Twilio StatusCallback
 *   "messaging_service_sid": "MGxxxxxxx",          // use Messaging Service instead of from_number
 *   "max_price": "0.05",                           // MaxPrice per segment
 * }
 *
 * Fallback: if no tenant_integrations row exists, the service checks
 * process.env.TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN (global/shared account).
 */

import { getSupabaseClient } from './supabase-db.js';
import logger from './logger.js';

const getSupabase = () => getSupabaseClient();

// ---------------------------------------------------------------------------
// Credential resolution
// ---------------------------------------------------------------------------

/**
 * Resolve Twilio credentials for a tenant.
 *
 * Priority:
 * 1. tenant_integrations row (integration_type = 'twilio', is_active = true)
 * 2. Global env vars TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
 * 3. null (not configured)
 *
 * @param {string} tenant_id
 * @returns {Promise<{ account_sid: string, auth_token: string, from_number?: string, config?: object, source: string } | null>}
 */
export async function getTwilioCredentials(tenant_id) {
  // 1. Per-tenant lookup
  if (tenant_id) {
    try {
      const { data, error } = await getSupabase()
        .from('tenant_integrations')
        .select('api_credentials, config')
        .eq('tenant_id', tenant_id)
        .eq('integration_type', 'twilio')
        .eq('is_active', true)
        .single();

      if (!error && data?.api_credentials?.account_sid) {
        return {
          account_sid: data.api_credentials.account_sid,
          auth_token: data.api_credentials.auth_token,
          from_number: data.api_credentials.from_number || null,
          config: data.config || {},
          source: 'tenant_integrations',
        };
      }
    } catch (e) {
      logger.warn('[TwilioService] tenant_integrations lookup failed:', e?.message);
    }
  }

  // 2. Global env fallback
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return {
      account_sid: process.env.TWILIO_ACCOUNT_SID,
      auth_token: process.env.TWILIO_AUTH_TOKEN,
      from_number: process.env.TWILIO_FROM_NUMBER || null,
      config: {},
      source: 'env',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

/**
 * Send an SMS via Twilio REST API (no SDK dependency).
 *
 * @param {Object} opts
 * @param {string} opts.tenant_id  – Tenant UUID
 * @param {string} opts.to         – E.164 recipient number
 * @param {string} opts.body       – Message body (≤1600 chars)
 * @param {string} [opts.from]     – Override sender number (defaults to tenant config)
 * @param {string} [opts.contact_id] – Optional contact/lead ID for activity logging
 * @param {Object} [opts.metadata] – Extra metadata to store on activity
 * @returns {Promise<Object>}
 */
export async function sendSms(opts) {
  const { tenant_id, to, body, from, contact_id, metadata = {} } = opts;

  // Validate inputs
  if (!to) throw new Error('Recipient phone number (to) is required');
  if (!body) throw new Error('Message body is required');
  if (body.length > 1600) throw new Error('Message body exceeds 1600 character limit');

  // Resolve credentials
  const creds = await getTwilioCredentials(tenant_id);

  // Dev mock: no credentials configured
  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  if (!creds) {
    if (isDev) {
      logger.info('[TwilioService] No Twilio credentials – using DEV MOCK mode');
      const mockResult = {
        success: true,
        provider: 'twilio',
        status: 'queued',
        message_sid: `SM_dev_mock_${Date.now()}`,
        to,
        body_length: body.length,
        message: 'SMS sent (DEV MOCK – no Twilio credentials configured)',
        mock: true,
      };
      if (contact_id) await logSmsActivity(tenant_id, contact_id, to, body, mockResult, metadata);
      return mockResult;
    }
    throw new Error('Twilio not configured for this tenant – add credentials via Settings → Integrations');
  }

  // Determine sender
  const fromNumber = from || creds.from_number;
  const messagingServiceSid = creds.config?.messaging_service_sid;
  if (!fromNumber && !messagingServiceSid) {
    throw new Error('No sender phone number (from) or Messaging Service SID configured');
  }

  // Build Twilio REST API request (Messages resource)
  // https://www.twilio.com/docs/sms/api/message-resource#create-a-message-resource
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`;

  const params = new URLSearchParams();
  params.append('To', to);
  params.append('Body', body);
  if (messagingServiceSid) {
    params.append('MessagingServiceSid', messagingServiceSid);
  } else {
    params.append('From', fromNumber);
  }
  if (creds.config?.status_callback_url) {
    params.append('StatusCallback', creds.config.status_callback_url);
  }
  if (creds.config?.max_price) {
    params.append('MaxPrice', creds.config.max_price);
  }

  const authHeader = 'Basic ' + Buffer.from(`${creds.account_sid}:${creds.auth_token}`).toString('base64');

  logger.info(`[TwilioService] Sending SMS to ${to} for tenant ${tenant_id} (source: ${creds.source})`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.message || data?.error_message || `HTTP ${response.status}`;
      logger.error(`[TwilioService] Twilio API error: ${errMsg}`, { code: data?.code, status: data?.status });
      const result = {
        success: false,
        provider: 'twilio',
        status: 'failed',
        error: errMsg,
        twilio_error_code: data?.code || null,
      };
      if (contact_id) await logSmsActivity(tenant_id, contact_id, to, body, result, metadata);
      return result;
    }

    const result = {
      success: true,
      provider: 'twilio',
      status: data.status || 'queued',
      message_sid: data.sid,
      to: data.to,
      from: data.from,
      body_length: body.length,
      num_segments: data.num_segments ? parseInt(data.num_segments, 10) : 1,
      price: data.price || null,
      date_created: data.date_created,
    };

    if (contact_id) await logSmsActivity(tenant_id, contact_id, to, body, result, metadata);

    return result;
  } catch (error) {
    logger.error('[TwilioService] Network error sending SMS:', error);
    const result = {
      success: false,
      provider: 'twilio',
      status: 'failed',
      error: error.message,
    };
    if (contact_id) await logSmsActivity(tenant_id, contact_id, to, body, result, metadata);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Status check
// ---------------------------------------------------------------------------

/**
 * Check whether Twilio is configured and reachable for a tenant.
 */
export async function checkTwilioStatus(tenant_id) {
  const creds = await getTwilioCredentials(tenant_id);
  if (!creds) {
    return {
      configured: false,
      status: 'not_configured',
      source: null,
      message: 'No Twilio credentials found – add via Settings → Integrations or set TWILIO_ACCOUNT_SID env var',
    };
  }

  // Quick validation: call Twilio Account endpoint
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}.json`;
  const authHeader = 'Basic ' + Buffer.from(`${creds.account_sid}:${creds.auth_token}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': authHeader },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        configured: true,
        status: 'active',
        source: creds.source,
        account_name: data.friendly_name || null,
        account_status: data.status || null,
        has_from_number: !!creds.from_number,
        has_messaging_service: !!creds.config?.messaging_service_sid,
      };
    }

    return {
      configured: true,
      status: 'auth_failed',
      source: creds.source,
      message: `Twilio returned HTTP ${response.status} – check account_sid and auth_token`,
    };
  } catch (error) {
    return {
      configured: true,
      status: 'unreachable',
      source: creds.source,
      message: `Cannot reach Twilio API: ${error.message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Activity logging (non-critical)
// ---------------------------------------------------------------------------

async function logSmsActivity(tenant_id, contact_id, to, body, result, metadata = {}) {
  try {
    // Determine related_to_type
    const { data: contact } = await getSupabase()
      .from('contacts')
      .select('id')
      .eq('id', contact_id)
      .maybeSingle();

    const relatedType = contact ? 'contact' : 'lead';

    await getSupabase().from('activities').insert({
      tenant_id,
      type: 'sms',
      subject: result.success ? `SMS sent to ${to}` : `SMS to ${to} failed`,
      body: body.length > 500 ? body.slice(0, 497) + '...' : body,
      status: result.success ? 'completed' : 'failed',
      related_to_type: relatedType,
      related_to_id: contact_id,
      metadata: {
        provider: 'twilio',
        direction: 'outbound',
        message_sid: result.message_sid || null,
        to_number: to,
        from_number: result.from || null,
        num_segments: result.num_segments || null,
        ...metadata,
      },
    });
  } catch (error) {
    logger.error('[TwilioService] Failed to log SMS activity:', error.message);
    // Non-critical – don't throw
  }
}
