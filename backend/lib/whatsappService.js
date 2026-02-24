/**
 * WhatsApp Service
 *
 * Handles inbound WhatsApp messages via Twilio webhook:
 *   1. Validates Twilio request signature
 *   2. Resolves tenant from the "To" WhatsApp number
 *   3. Maps sender phone number to a contact/lead
 *   4. Finds or creates a conversation thread
 *   5. Routes the message through AiSHA (full tool calling)
 *   6. Sends AiSHA's reply back via Twilio WhatsApp API
 *   7. Logs all messages to conversation_messages
 *
 * Tenant opt-in: only tenants with a tenant_integrations row
 * (integration_type = 'whatsapp', is_active = true) will respond.
 *
 * [2026-02-23 Claude] — initial implementation
 */

import { getSupabaseClient } from './supabase-db.js';
import { getTwilioCredentials } from './twilioService.js';
import logger from './logger.js';
import crypto from 'crypto';

const getSupabase = () => getSupabaseClient();

// ---------------------------------------------------------------------------
// Twilio Signature Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a request genuinely came from Twilio.
 * Uses HMAC-SHA1 of the full URL + sorted POST params, compared against
 * the X-Twilio-Signature header.
 *
 * @param {string} authToken - Twilio auth token for the tenant
 * @param {string} url - The full webhook URL Twilio called
 * @param {Object} params - req.body (POST parameters)
 * @param {string} signature - X-Twilio-Signature header value
 * @returns {boolean}
 */
export function validateTwilioSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;

  // Build the data string: URL + sorted param keys with values appended
  let data = url;
  const sortedKeys = Object.keys(params || {}).sort();
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = crypto.createHmac('sha1', authToken).update(data, 'utf-8').digest('base64');

  // Use timing-safe comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(String(signature), 'utf8');

  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

// ---------------------------------------------------------------------------
// Tenant Resolution from WhatsApp Number
// ---------------------------------------------------------------------------

/**
 * Find which tenant owns a given WhatsApp number.
 * Looks in tenant_integrations for integration_type = 'whatsapp'
 * where config.whatsapp_number matches the "To" number.
 *
 * @param {string} toNumber - The WhatsApp number that received the message (e.g., +14155238886)
 * @returns {Promise<{ tenant_id: string, config: Object, twilioCreds: Object } | null>}
 */
export async function resolveTenantFromWhatsAppNumber(toNumber) {
  // Strip the "whatsapp:" prefix if present
  const cleanNumber = toNumber.replace(/^whatsapp:/, '');
  logger.info(`[WhatsApp] Resolving tenant for number: "${cleanNumber}" (raw: "${toNumber}")`);

  const { data, error } = await getSupabase()
    .from('tenant_integrations')
    .select('tenant_id, config, api_credentials')
    .eq('integration_type', 'whatsapp')
    .eq('is_active', true);

  if (error) {
    logger.error(`[WhatsApp] Supabase query error: ${error.message}`);
    return null;
  }

  if (!data?.length) {
    logger.warn('[WhatsApp] No active WhatsApp integrations found in DB');
    return null;
  }

  logger.info(`[WhatsApp] Found ${data.length} active WhatsApp integration(s)`);

  // Find the tenant whose whatsapp_number matches the To number
  for (const row of data) {
    const configNumber = (row.config?.whatsapp_number || '').replace(/^whatsapp:/, '');
    logger.debug(`[WhatsApp] Comparing: config="${configNumber}" vs incoming="${cleanNumber}"`);
    if (configNumber === cleanNumber) {
      // Also get Twilio credentials (may be in whatsapp integration or shared twilio integration)
      const twilioCreds = row.api_credentials?.account_sid
        ? row.api_credentials
        : await getTwilioCredentials(row.tenant_id).then((c) => c || null);

      logger.info(
        `[WhatsApp] Tenant resolved: ${row.tenant_id.substring(0, 8)}... hasCreds=${!!twilioCreds}`,
      );
      return {
        tenant_id: row.tenant_id,
        config: row.config || {},
        twilioCreds,
      };
    }
  }

  logger.warn(`[WhatsApp] No tenant matched for WhatsApp number: ${cleanNumber}`);
  return null;
}

// ---------------------------------------------------------------------------
// Employee WhatsApp Authorization
// ---------------------------------------------------------------------------

/**
 * Check if a phone number belongs to an authorized employee for WhatsApp.
 * Returns the employee record if authorized, null otherwise.
 *
 * @param {string} tenantId
 * @param {string} phoneNumber - E.164 format (with or without whatsapp: prefix)
 * @returns {Promise<{ id: string, name: string, email: string } | null>}
 * [2026-02-24 Claude]
 */
export async function authorizeWhatsAppEmployee(tenantId, phoneNumber) {
  const cleanPhone = phoneNumber.replace(/^whatsapp:/, '');
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, email')
    .eq('tenant_id', tenantId)
    .eq('whatsapp_number', cleanPhone)
    .eq('whatsapp_enabled', true)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error(`[WhatsApp] Employee auth lookup error: ${error.message}`);
    return null;
  }

  if (!data) return null;

  return {
    id: data.id,
    name: [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Employee',
    email: data.email,
  };
}

// ---------------------------------------------------------------------------
// Contact/Lead Phone Lookup
// ---------------------------------------------------------------------------

/**
 * Find a contact or lead by phone number within a tenant.
 * Checks both `phone` and `mobile` fields.
 *
 * @param {string} tenantId
 * @param {string} phoneNumber - E.164 format
 * @returns {Promise<{ id: string, type: 'contact'|'lead', name: string } | null>}
 */
export async function findEntityByPhone(tenantId, phoneNumber) {
  const cleanPhone = phoneNumber.replace(/^whatsapp:/, '');
  const supabase = getSupabase();

  // Check contacts first
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, phone, mobile')
    .eq('tenant_id', tenantId)
    .or(`phone.eq.${cleanPhone},mobile.eq.${cleanPhone}`)
    .limit(1)
    .maybeSingle();

  if (contact) {
    return {
      id: contact.id,
      type: 'contact',
      name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unknown',
    };
  }

  // Check leads
  const { data: lead } = await supabase
    .from('leads')
    .select('id, first_name, last_name, phone, mobile')
    .eq('tenant_id', tenantId)
    .or(`phone.eq.${cleanPhone},mobile.eq.${cleanPhone}`)
    .limit(1)
    .maybeSingle();

  if (lead) {
    return {
      id: lead.id,
      type: 'lead',
      name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown',
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Conversation Thread Management
// ---------------------------------------------------------------------------

/**
 * Find or create a WhatsApp conversation thread.
 * Conversations are keyed by (tenant_id + sender phone number).
 * A conversation is reused if it's still "active" (updated in last 24h).
 * Otherwise a new one is created.
 *
 * @param {string} tenantId
 * @param {string} senderPhone - Sender's WhatsApp number
 * @param {Object|null} entity - Resolved contact/lead
 * @returns {Promise<string>} conversation_id
 */
export async function findOrCreateConversation(tenantId, senderPhone, entity) {
  const supabase = getSupabase();
  const cleanPhone = senderPhone.replace(/^whatsapp:/, '');

  // Look for an existing active WhatsApp conversation for this phone
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('agent_name', 'aisha')
    .eq('status', 'active')
    .gte('updated_date', twentyFourHoursAgo)
    .contains('metadata', { channel: 'whatsapp', phone: cleanPhone })
    .order('updated_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Touch the updated_date to keep it alive
    await supabase
      .from('conversations')
      .update({ updated_date: new Date().toISOString() })
      .eq('id', existing.id);
    return existing.id;
  }

  // Create new conversation
  const title = entity ? `WhatsApp: ${entity.name}` : `WhatsApp: ${cleanPhone}`;

  // Only include columns that exist on all DB versions
  // title/topic may not exist on dev branch — store in metadata instead
  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      agent_name: 'aisha',
      status: 'active',
      metadata: {
        channel: 'whatsapp',
        phone: cleanPhone,
        title,
        entity_id: entity?.id || null,
        entity_type: entity?.type || null,
      },
    })
    .select('id')
    .single();

  if (error) {
    logger.error(
      `[WhatsApp] Failed to create conversation: ${error.message} (code: ${error.code}, details: ${error.details})`,
    );
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return newConv.id;
}

// ---------------------------------------------------------------------------
// Load Conversation History
// ---------------------------------------------------------------------------

/**
 * Load recent messages from a conversation for context.
 *
 * @param {string} conversationId
 * @param {number} limit - Max messages to load
 * @returns {Promise<Array<{ role: string, content: string }>>}
 */
export async function loadConversationHistory(conversationId, limit = 10) {
  const { data, error } = await getSupabase()
    .from('conversation_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_date', { ascending: true })
    .limit(limit);

  if (error) {
    logger.warn('[WhatsApp] Failed to load conversation history:', error);
    return [];
  }

  return (data || []).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
}

// ---------------------------------------------------------------------------
// Save Message
// ---------------------------------------------------------------------------

/**
 * Save a message to conversation_messages.
 *
 * @param {string} conversationId
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content
 * @param {Object} metadata - Extra metadata (message_sid, phone, etc.)
 */
export async function saveMessage(conversationId, role, content, metadata = {}) {
  const { error } = await getSupabase()
    .from('conversation_messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      metadata: {
        ...metadata,
        channel: 'whatsapp',
      },
    });

  if (error) {
    logger.error('[WhatsApp] Failed to save message:', error);
  }
}

// ---------------------------------------------------------------------------
// Send WhatsApp Reply via Twilio
// ---------------------------------------------------------------------------

/**
 * Send a WhatsApp message via Twilio REST API.
 *
 * @param {Object} twilioCreds - { account_sid, auth_token }
 * @param {string} to - Recipient (whatsapp:+1234567890)
 * @param {string} from - Sender (whatsapp:+14155238886)
 * @param {string} body - Message text
 * @returns {Promise<Object>}
 */
export async function sendWhatsAppReply(twilioCreds, to, from, body) {
  if (!twilioCreds?.account_sid || !twilioCreds?.auth_token) {
    logger.error('[WhatsApp] Cannot send reply - missing Twilio credentials');
    return { success: false, error: 'Missing Twilio credentials' };
  }

  // WhatsApp messages have a 4096 char limit - truncate if needed
  const truncatedBody = body.length > 4000 ? body.substring(0, 3997) + '...' : body;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioCreds.account_sid}/Messages.json`;
  const authHeader =
    'Basic ' +
    Buffer.from(`${twilioCreds.account_sid}:${twilioCreds.auth_token}`).toString('base64');

  // Ensure whatsapp: prefix
  const toWA = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const fromWA = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

  const params = new URLSearchParams();
  params.append('To', toWA);
  params.append('From', fromWA);
  params.append('Body', truncatedBody);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('[WhatsApp] Twilio API error:', data?.message || data?.error_message);
      return {
        success: false,
        error: data?.message || `HTTP ${response.status}`,
        twilio_error_code: data?.code,
      };
    }

    return {
      success: true,
      message_sid: data.sid,
      status: data.status,
    };
  } catch (error) {
    logger.error('[WhatsApp] Network error sending reply:', error);
    return { success: false, error: error.message };
  }
}

// ---------------------------------------------------------------------------
// Activity Logging
// ---------------------------------------------------------------------------

/**
 * Log a WhatsApp interaction as a CRM activity.
 * Logs for both entity (contact/lead) context and employee usage tracking.
 */
export async function logWhatsAppActivity(
  tenantId,
  entity,
  senderPhone,
  userMessage,
  aiReply,
  employee = null,
) {
  const supabase = getSupabase();
  const cleanPhone = senderPhone.replace(/^whatsapp:/, '');

  // Log against entity if one was matched
  if (entity) {
    try {
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        type: 'whatsapp',
        subject: `WhatsApp: ${entity.name}`,
        body: `Employee: ${userMessage.substring(0, 200)}${userMessage.length > 200 ? '...' : ''}\n\nAiSHA: ${aiReply.substring(0, 200)}${aiReply.length > 200 ? '...' : ''}`,
        related_to: entity.type,
        related_id: entity.id,
        assigned_to_employee_id: employee?.id || null,
        status: 'completed',
        metadata: {
          channel: 'whatsapp',
          phone: cleanPhone,
          employee_name: employee?.name || null,
        },
      });
    } catch (error) {
      logger.warn('[WhatsApp] Failed to log entity activity (non-critical):', error?.message);
    }
  }

  // Always log employee usage (tracks who used WhatsApp AiSHA and when)
  if (employee) {
    try {
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        type: 'whatsapp',
        subject: `WhatsApp query by ${employee.name}`,
        body: `Query: ${userMessage.substring(0, 300)}${userMessage.length > 300 ? '...' : ''}`,
        assigned_to_employee_id: employee.id,
        status: 'completed',
        metadata: {
          channel: 'whatsapp',
          phone: cleanPhone,
          employee_id: employee.id,
          employee_name: employee.name,
          response_preview: aiReply.substring(0, 200),
        },
      });
    } catch (error) {
      logger.warn('[WhatsApp] Failed to log employee activity (non-critical):', error?.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Main Handler: Process Inbound WhatsApp Message
// ---------------------------------------------------------------------------

/**
 * Process an inbound WhatsApp message end-to-end.
 *
 * @param {Object} opts
 * @param {string} opts.tenantId - Resolved tenant UUID
 * @param {Object} opts.twilioCreds - Twilio credentials
 * @param {Object} opts.config - WhatsApp integration config
 * @param {string} opts.from - Sender WhatsApp number
 * @param {string} opts.to - Recipient WhatsApp number (our number)
 * @param {string} opts.body - Message text
 * @param {string} opts.messageSid - Twilio Message SID
 * @param {Function} opts.chatHandler - Function to call AiSHA (injected from route)
 * @returns {Promise<{ reply: string, conversationId: string }>}
 */
export async function processInboundWhatsApp({
  tenantId,
  twilioCreds,
  config,
  from,
  to,
  body,
  messageSid,
  chatHandler,
  employee = null,
}) {
  const senderPhone = from.replace(/^whatsapp:/, '');

  logger.info('[WhatsApp] Processing inbound message', {
    tenant: tenantId.substring(0, 8) + '...',
    from: senderPhone,
    bodyLength: body.length,
    messageSid,
  });

  // 1. Find contact/lead by phone
  const entity = await findEntityByPhone(tenantId, senderPhone);
  if (entity) {
    logger.info('[WhatsApp] Matched sender to entity:', {
      type: entity.type,
      name: entity.name,
      id: entity.id.substring(0, 8) + '...',
    });
  } else {
    logger.info('[WhatsApp] No matching contact/lead for phone:', senderPhone);
  }

  // 2. Find or create conversation
  const conversationId = await findOrCreateConversation(tenantId, from, entity);

  // 3. Save inbound message
  await saveMessage(conversationId, 'user', body, {
    message_sid: messageSid,
    phone: senderPhone,
    entity_id: entity?.id,
    entity_type: entity?.type,
  });

  // 4. Load conversation history for context
  const history = await loadConversationHistory(conversationId, 10);

  // 5. Build the messages array for AiSHA
  // Include history (already has the just-saved user message at the end)
  // If history doesn't include the current message yet (race), append it
  const lastHistoryMsg = history[history.length - 1];
  const messagesForAI =
    lastHistoryMsg?.content === body ? history : [...history, { role: 'user', content: body }];

  // 6. Call AiSHA via the injected chat handler
  let aiReply;
  try {
    aiReply = await chatHandler({
      tenantId,
      conversationId,
      messages: messagesForAI,
      entityContext: entity ? { name: entity.name, type: entity.type, id: entity.id } : null,
      channel: 'whatsapp',
      senderPhone,
      employee, // [2026-02-24 Claude] authorized employee context
    });
  } catch (error) {
    logger.error(`[WhatsApp] AiSHA chat error: ${error.message}\n${error.stack}`);
    aiReply =
      "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.";
  }

  // 7. Save AiSHA's reply
  await saveMessage(conversationId, 'assistant', aiReply, {
    phone: senderPhone,
    entity_id: entity?.id,
  });

  // 8. Send reply via Twilio
  const whatsappNumber = config.whatsapp_number || to.replace(/^whatsapp:/, '');
  const sendResult = await sendWhatsAppReply(twilioCreds, from, whatsappNumber, aiReply);

  if (!sendResult.success) {
    logger.error('[WhatsApp] Failed to send reply:', sendResult.error);
  }

  // 9. Log activity (non-blocking) — logs both entity and employee usage
  logWhatsAppActivity(tenantId, entity, from, body, aiReply, employee).catch(() => {});

  return {
    reply: aiReply,
    conversationId,
    sendResult,
    entity,
  };
}
