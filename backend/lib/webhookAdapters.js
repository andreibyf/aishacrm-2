/**
 * Provider Webhook Adapters
 * 
 * Normalize webhook payloads from different telephony providers
 * into a standardized format for callFlowHandler
 */

/**
 * Twilio webhook adapter
 * Docs: https://www.twilio.com/docs/voice/twiml#request-parameters
 */
export function normalizeTwilioWebhook(req, tenant_id) {
  const isInbound = req.body.Direction === 'inbound';
  
  const basePayload = {
    tenant_id,
    call_sid: req.body.CallSid,
    call_status: mapTwilioStatus(req.body.CallStatus),
    duration: parseInt(req.body.CallDuration || '0', 10),
    recording_url: req.body.RecordingUrl,
    provider: 'twilio',
    metadata: {
      account_sid: req.body.AccountSid,
      api_version: req.body.ApiVersion
    }
  };

  if (isInbound) {
    return {
      ...basePayload,
      from_number: req.body.From,
      to_number: req.body.To,
      metadata: {
        ...basePayload.metadata,
        caller_name: req.body.CallerName,
        caller_city: req.body.CallerCity,
        caller_state: req.body.CallerState,
        caller_zip: req.body.CallerZip,
        caller_country: req.body.CallerCountry
      }
    };
  } else {
    return {
      ...basePayload,
      to_number: req.body.To,
      from_number: req.body.From,
      outcome: mapTwilioOutcome(req.body.CallStatus, req.body.AnsweredBy)
    };
  }
}

function mapTwilioStatus(status) {
  const statusMap = {
    'queued': 'in-progress',
    'ringing': 'in-progress',
    'in-progress': 'in-progress',
    'completed': 'completed',
    'busy': 'failed',
    'no-answer': 'failed',
    'canceled': 'failed',
    'failed': 'failed'
  };
  return statusMap[status] || 'failed';
}

function mapTwilioOutcome(status, answeredBy) {
  if (status === 'completed') {
    if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep') {
      return 'voicemail';
    }
    return 'answered';
  }
  if (status === 'no-answer') return 'no-answer';
  if (status === 'busy') return 'busy';
  return 'failed';
}

/**
 * SignalWire webhook adapter
 * Similar to Twilio but with some differences
 */
export function normalizeSignalWireWebhook(req, tenant_id) {
  // SignalWire uses similar structure to Twilio
  return {
    ...normalizeTwilioWebhook(req, tenant_id),
    provider: 'signalwire'
  };
}

/**
 * CallFluent AI webhook adapter
 * Custom AI calling platform
 */
export function normalizeCallFluentWebhook(req, tenant_id) {
  const body = req.body;
  const isInbound = body.direction === 'inbound';

  const basePayload = {
    tenant_id,
    call_sid: body.call_id || body.id,
    call_status: body.status === 'completed' ? 'completed' : 'in-progress',
    duration: body.duration_seconds || 0,
    recording_url: body.recording_url,
    transcript: body.transcript,
    caller_name: body.caller_name || body.extracted_name, // AI agent extracts from conversation
    caller_email: body.caller_email || body.extracted_email, // Optional: if provided during call
    provider: 'callfluent',
    metadata: {
      ai_agent_id: body.agent_id,
      conversation_id: body.conversation_id,
      extracted_data: body.extracted_data || {} // Any other AI-extracted fields
    }
  };

  if (isInbound) {
    return {
      ...basePayload,
      from_number: body.from || body.caller_number,
      to_number: body.to || body.called_number
    };
  } else {
    return {
      ...basePayload,
      to_number: body.to || body.called_number,
      from_number: body.from || body.caller_number,
      outcome: body.outcome || (body.answered ? 'answered' : 'no-answer'),
      contact_id: body.contact_id,
      campaign_id: body.campaign_id
    };
  }
}

/**
 * Thoughtly AI webhook adapter
 * AI voice agent platform
 */
export function normalizeThoughtlyWebhook(req, tenant_id) {
  const body = req.body;
  const isInbound = body.call_type === 'inbound';

  const basePayload = {
    tenant_id,
    call_sid: body.call_id,
    call_status: body.call_status === 'ended' ? 'completed' : 'in-progress',
    duration: body.call_duration || 0,
    recording_url: body.recording_url,
    transcript: body.full_transcript,
    caller_name: body.caller_name || body.contact_name, // AI agent extracts from conversation
    caller_email: body.caller_email || body.contact_email, // Optional: if provided during call
    provider: 'thoughtly',
    metadata: {
      agent_name: body.agent_name,
      session_id: body.session_id,
      ai_summary: body.ai_summary,
      extracted_info: body.extracted_info || {} // Any other AI-extracted fields
    }
  };

  if (isInbound) {
    return {
      ...basePayload,
      from_number: body.caller_number,
      to_number: body.phone_number
    };
  } else {
    return {
      ...basePayload,
      to_number: body.phone_number,
      from_number: body.caller_id,
      outcome: body.call_outcome || 'answered',
      contact_id: body.contact_id,
      campaign_id: body.campaign_id
    };
  }
}

/**
 * Generic webhook adapter
 * For testing or custom integrations
 */
export function normalizeGenericWebhook(req, tenant_id) {
  const body = req.body;
  
  // Assume body is already in our standard format
  return {
    tenant_id,
    ...body
  };
}

/**
 * Detect provider from request and normalize
 */
export function normalizeWebhook(req, tenant_id, provider) {
  switch (provider) {
    case 'twilio':
      return normalizeTwilioWebhook(req, tenant_id);
    case 'signalwire':
      return normalizeSignalWireWebhook(req, tenant_id);
    case 'callfluent':
      return normalizeCallFluentWebhook(req, tenant_id);
    case 'thoughtly':
      return normalizeThoughtlyWebhook(req, tenant_id);
    default:
      return normalizeGenericWebhook(req, tenant_id);
  }
}
