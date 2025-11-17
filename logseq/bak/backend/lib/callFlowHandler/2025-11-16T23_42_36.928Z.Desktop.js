/**
 * Call Flow Handler
 * 
 * Handles both inbound and outbound call flows:
 * - Contact resolution by phone number
 * - Auto-creation of contacts from unknown numbers
 * - Transcript summarization via OpenAI
 * - Automatic note/activity creation
 * - Lead qualification scoring
 */

import { emitTenantWebhooks } from './webhookEmitter.js';

/**
 * Process inbound call webhook
 * 
 * Flow:
 * 1. Lookup contact by phone number
 * 2. If not found, create new lead/contact
 * 3. Log activity with call details
 * 4. If transcript provided, generate summary and sentiment
 * 5. Auto-create note with summary
 * 6. Emit webhook for CRM updates
 */
export async function handleInboundCall(pgPool, payload) {
  const {
    tenant_id,
    from_number,
    to_number,
    call_sid,
    call_status: _call_status,
    duration,
    recording_url,
    transcript,
    provider, // 'twilio', 'signalwire', 'callfluent', 'thoughtly'
    metadata = {}
  } = payload;

  if (!tenant_id || !from_number) {
    throw new Error('tenant_id and from_number are required');
  }

  console.log(`[CallFlow] Inbound call from ${from_number} to tenant ${tenant_id}`);

  // Step 1: Find existing contact/lead by phone
  const contact = await findContactByPhone(pgPool, tenant_id, from_number);

  let contactId = contact?.id;
  let contactType = contact?.type; // 'contact', 'lead', or null
  let contactName = contact?.name;

  // Step 2: If no contact found, create new lead
  if (!contactId) {
    console.log(`[CallFlow] Unknown caller ${from_number}, creating new lead`);
    const newLead = await createLeadFromCall(pgPool, tenant_id, from_number, metadata);
    contactId = newLead.id;
    contactType = 'lead';
    contactName = newLead.name;
  }

  // Step 3: Generate summary from transcript (if provided)
  let summary = null;
  let sentiment = null;
  let actionItems = [];

  if (transcript) {
    const analysis = await analyzeTranscript(transcript);
    summary = analysis.summary;
    sentiment = analysis.sentiment;
    actionItems = analysis.actionItems;
  }

  // Step 4: Log activity
  const activity = await logCallActivity(pgPool, {
    tenant_id,
    related_type: contactType,
    related_id: contactId,
    type: 'call',
    subject: `Inbound call from ${contactName || from_number}`,
    description: summary || `Call received from ${from_number}`,
    status: 'completed',
    direction: 'inbound',
    metadata: {
      call_sid,
      from_number,
      to_number,
      duration,
      recording_url,
      provider,
      sentiment,
      transcript_length: transcript?.length || 0,
      ...metadata
    }
  });

  // Step 5: Create note with transcript summary
  if (summary) {
    await createNoteFromCall(pgPool, {
      tenant_id,
      related_type: contactType,
      related_id: contactId,
      content: summary,
      metadata: {
        activity_id: activity.id,
        sentiment,
        action_items: actionItems,
        call_sid
      }
    });
  }

  // Step 6: Emit webhook
  await emitTenantWebhooks(tenant_id, 'call.inbound', {
    contact_id: contactId,
    contact_type: contactType,
    from_number,
    duration,
    sentiment,
    summary,
    action_items: actionItems
  }).catch(err => console.error('[CallFlow] Webhook emission failed:', err.message));

  return {
    success: true,
    contact_id: contactId,
    contact_type: contactType,
    activity_id: activity.id,
    summary,
    sentiment
  };
}

/**
 * Process outbound call webhook
 * 
 * Flow:
 * 1. Lookup contact (should already exist for outbound)
 * 2. Log activity with call outcome
 * 3. If transcript provided, summarize and create note
 * 4. Update contact/lead status based on outcome
 * 5. Emit webhook
 */
export async function handleOutboundCall(pgPool, payload) {
  const {
    tenant_id,
    to_number,
    from_number,
    call_sid,
    call_status,
    duration,
    recording_url,
    transcript,
    outcome, // 'answered', 'no-answer', 'busy', 'failed', 'voicemail'
    contact_id, // Usually provided for outbound
    provider,
    campaign_id, // If part of AI campaign
    metadata = {}
  } = payload;

  if (!tenant_id || !to_number) {
    throw new Error('tenant_id and to_number are required');
  }

  console.log(`[CallFlow] Outbound call to ${to_number} (status: ${call_status})`);

  // Step 1: Find or lookup contact
  let contactId = contact_id;
  let contactType = null;
  let contactName = null;

  if (!contactId) {
    const contact = await findContactByPhone(pgPool, tenant_id, to_number);
    contactId = contact?.id;
    contactType = contact?.type;
    contactName = contact?.name;
  } else {
    // Fetch contact details
    const contact = await getContactById(pgPool, tenant_id, contactId);
    contactType = contact?.type;
    contactName = contact?.name;
  }

  if (!contactId) {
    console.warn(`[CallFlow] Outbound call to ${to_number} but no contact found`);
    // Optionally create lead
    const newLead = await createLeadFromCall(pgPool, tenant_id, to_number, { ...metadata, source: 'outbound_call' });
    contactId = newLead.id;
    contactType = 'lead';
    contactName = newLead.name;
  }

  // Step 2: Analyze transcript if call was answered
  let summary = null;
  let sentiment = null;
  let actionItems = [];

  if (transcript && outcome === 'answered') {
    const analysis = await analyzeTranscript(transcript);
    summary = analysis.summary;
    sentiment = analysis.sentiment;
    actionItems = analysis.actionItems;
  }

  // Step 3: Log activity
  const activitySubject = outcome === 'answered' 
    ? `Outbound call with ${contactName || to_number}`
    : `Outbound call to ${contactName || to_number} - ${outcome}`;

  const activity = await logCallActivity(pgPool, {
    tenant_id,
    related_type: contactType,
    related_id: contactId,
    type: 'call',
    subject: activitySubject,
    description: summary || `Outbound call ${outcome}`,
    status: 'completed',
    direction: 'outbound',
    metadata: {
      call_sid,
      from_number,
      to_number,
      duration,
      recording_url,
      outcome,
      provider,
      campaign_id,
      sentiment,
      transcript_length: transcript?.length || 0,
      ...metadata
    }
  });

  // Step 4: Create note if call was meaningful
  if (summary) {
    await createNoteFromCall(pgPool, {
      tenant_id,
      related_type: contactType,
      related_id: contactId,
      content: summary,
      metadata: {
        activity_id: activity.id,
        sentiment,
        action_items: actionItems,
        outcome,
        call_sid
      }
    });
  }

  // Step 5: Update contact/lead status based on outcome
  if (contactType === 'lead' && outcome === 'answered') {
    await updateLeadStatus(pgPool, contactId, 'contacted', 'Spoke via phone');
  }

  // Step 6: Update campaign progress if part of campaign
  if (campaign_id) {
    await updateCampaignProgress(pgPool, tenant_id, campaign_id, contactId, outcome, sentiment);
  }

  // Step 7: Emit webhook
  await emitTenantWebhooks(tenant_id, 'call.outbound', {
    contact_id: contactId,
    contact_type: contactType,
    to_number,
    outcome,
    duration,
    sentiment,
    summary,
    action_items: actionItems,
    campaign_id
  }).catch(err => console.error('[CallFlow] Webhook emission failed:', err.message));

  return {
    success: true,
    contact_id: contactId,
    contact_type: contactType,
    activity_id: activity.id,
    outcome,
    summary,
    sentiment
  };
}

/**
 * Find contact or lead by phone number
 */
async function findContactByPhone(pgPool, tenant_id, phone) {
  const normalizedPhone = normalizePhone(phone);

  // Try contacts first
  const contactQuery = `
    SELECT id, CONCAT(first_name, ' ', last_name) as name, 'contact' as type
    FROM contacts
    WHERE tenant_id = $1 
      AND (phone = $2 OR mobile = $2 OR REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '+', '') = $3)
    LIMIT 1
  `;
  
  const contactResult = await pgPool.query(contactQuery, [tenant_id, phone, normalizedPhone]);
  if (contactResult.rows.length > 0) {
    return contactResult.rows[0];
  }

  // Try leads
  const leadQuery = `
    SELECT id, CONCAT(first_name, ' ', last_name) as name, 'lead' as type
    FROM leads
    WHERE tenant_id = $1 
      AND (phone = $2 OR REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '+', '') = $3)
    LIMIT 1
  `;
  
  const leadResult = await pgPool.query(leadQuery, [tenant_id, phone, normalizedPhone]);
  if (leadResult.rows.length > 0) {
    return leadResult.rows[0];
  }

  return null;
}

/**
 * Get contact/lead by ID
 */
async function getContactById(pgPool, tenant_id, contact_id) {
  // Try contact
  const contactQuery = `SELECT id, CONCAT(first_name, ' ', last_name) as name, 'contact' as type FROM contacts WHERE tenant_id = $1 AND id = $2`;
  const contactResult = await pgPool.query(contactQuery, [tenant_id, contact_id]);
  if (contactResult.rows.length > 0) return contactResult.rows[0];

  // Try lead
  const leadQuery = `SELECT id, CONCAT(first_name, ' ', last_name) as name, 'lead' as type FROM leads WHERE tenant_id = $1 AND id = $2`;
  const leadResult = await pgPool.query(leadQuery, [tenant_id, contact_id]);
  if (leadResult.rows.length > 0) return leadResult.rows[0];

  return null;
}

/**
 * Create new lead from unknown caller
 */
async function createLeadFromCall(pgPool, tenant_id, phone, metadata = {}) {
  const insertQuery = `
    INSERT INTO leads (tenant_id, phone, first_name, last_name, source, status, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id, CONCAT(first_name, ' ', last_name) as name
  `;

  const firstName = metadata.caller_name || 'Unknown';
  const lastName = 'Caller';
  const source = metadata.source || 'inbound_call';
  const status = 'new';

  const result = await pgPool.query(insertQuery, [
    tenant_id,
    phone,
    firstName,
    lastName,
    source,
    status,
    JSON.stringify({ ...metadata, created_via: 'call_flow', phone_number: phone })
  ]);

  console.log(`[CallFlow] Created lead ${result.rows[0].id} for ${phone}`);
  return result.rows[0];
}

/**
 * Log call as activity
 */
async function logCallActivity(pgPool, data) {
  const {
    tenant_id,
    related_type,
    related_id,
    type,
    subject,
    description,
    status,
    direction,
    metadata
  } = data;

  const insertQuery = `
    INSERT INTO activities (
      tenant_id, related_type, related_id, type, subject, description, 
      status, metadata, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    RETURNING id
  `;

  const activityMetadata = {
    ...metadata,
    direction,
    call_type: type,
    logged_via: 'call_flow_handler'
  };

  const result = await pgPool.query(insertQuery, [
    tenant_id,
    related_type,
    related_id,
    type,
    subject,
    description,
    status,
    JSON.stringify(activityMetadata)
  ]);

  console.log(`[CallFlow] Created activity ${result.rows[0].id}`);
  return result.rows[0];
}

/**
 * Create note from call summary
 */
async function createNoteFromCall(pgPool, data) {
  const { tenant_id, related_type, related_id, content, metadata } = data;

  const insertQuery = `
    INSERT INTO notes (tenant_id, related_type, related_id, content, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id
  `;

  const result = await pgPool.query(insertQuery, [
    tenant_id,
    related_type,
    related_id,
    content,
    JSON.stringify({ ...metadata, note_type: 'call_summary' })
  ]);

  console.log(`[CallFlow] Created note ${result.rows[0].id}`);
  return result.rows[0];
}

/**
 * Analyze transcript using OpenAI
 */
async function analyzeTranscript(transcript) {
  // Stub implementation - integrate with OpenAI later
  console.log(`[CallFlow] Analyzing transcript (${transcript.length} chars)`);

  // TODO: Implement OpenAI integration
  // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // const completion = await openai.chat.completions.create({
  //   model: "gpt-4",
  //   messages: [{
  //     role: "system",
  //     content: "You are a call center analyst. Summarize this call transcript, extract key points, sentiment, and action items."
  //   }, {
  //     role: "user",
  //     content: transcript
  //   }]
  // });

  // For now, return mock analysis
  return {
    summary: `Call summary: ${transcript.substring(0, 100)}... [Full analysis pending OpenAI integration]`,
    sentiment: 'neutral',
    actionItems: [
      'Follow up with customer',
      'Send requested information'
    ]
  };
}

/**
 * Update lead status
 */
async function updateLeadStatus(pgPool, lead_id, status, notes) {
  const updateQuery = `
    UPDATE leads 
    SET status = $1, 
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status_notes}', to_jsonb($2::text)),
        updated_at = NOW()
    WHERE id = $3
  `;

  await pgPool.query(updateQuery, [status, notes, lead_id]);
  console.log(`[CallFlow] Updated lead ${lead_id} status to ${status}`);
}

/**
 * Update campaign progress (for AI campaigns)
 */
async function updateCampaignProgress(pgPool, tenant_id, campaign_id, contact_id, outcome, sentiment) {
  // Update target_contacts array with outcome
  const updateQuery = `
    UPDATE ai_campaigns
    SET 
      target_contacts = (
        SELECT jsonb_agg(
          CASE 
            WHEN elem->>'contact_id' = $3
            THEN elem || jsonb_build_object('status', $4, 'outcome', $5, 'sentiment', $6, 'completed_at', NOW()::text)
            ELSE elem
          END
        )
        FROM jsonb_array_elements(target_contacts) elem
      ),
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{progress,processed}',
        (COALESCE((metadata->'progress'->>'processed')::int, 0) + 1)::text::jsonb
      )
    WHERE tenant_id = $1 AND id = $2
  `;

  const status = outcome === 'answered' ? 'completed' : 'attempted';
  await pgPool.query(updateQuery, [tenant_id, campaign_id, contact_id, status, outcome, sentiment]);
  console.log(`[CallFlow] Updated campaign ${campaign_id} progress for contact ${contact_id}`);
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone) {
  if (!phone) return '';
  // eslint-disable-next-line no-useless-escape
  return phone.replace(/[\s\-\+\(\)]/g, '');
}
