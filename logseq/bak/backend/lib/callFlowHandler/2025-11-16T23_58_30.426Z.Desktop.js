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
    caller_name, // AI agent extracts from conversation: "Hi, this is John"
    caller_email, // Optional: AI agent extracts if caller provides it
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
    const callerInfo = {
      name: caller_name,
      email: caller_email,
      ...metadata
    };
    const newLead = await createLeadFromCall(pgPool, tenant_id, from_number, callerInfo);
    contactId = newLead.id;
    contactType = 'lead';
    contactName = newLead.name;
  }

  // Step 3: Generate summary from transcript (if provided)
  let summary = null;
  let sentiment = null;
  let actionItems = [];
  let analysis = {};

  if (transcript) {
    analysis = await analyzeTranscript(transcript);
    summary = analysis.summary;
    sentiment = analysis.sentiment;
    actionItems = analysis.actionItems || [];
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
    const noteContent = buildNoteContent(summary, sentiment, actionItems);
    await createNoteFromCall(pgPool, {
      tenant_id,
      related_type: contactType,
      related_id: contactId,
      content: noteContent,
      metadata: {
        activity_id: activity.id,
        sentiment,
        action_items: actionItems,
        customer_requests: analysis.customerRequests || [],
        commitments_made: analysis.commitmentsMade || [],
        call_sid
      }
    });
  }

  // Step 6: Create actionable activities for high-priority items
  if (actionItems && actionItems.length > 0) {
    await createActionActivities(pgPool, {
      tenant_id,
      related_type: contactType,
      related_id: contactId,
      contact_name: contactName,
      action_items: actionItems,
      call_activity_id: activity.id
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
  let analysis = {};

  if (transcript && outcome === 'answered') {
    analysis = await analyzeTranscript(transcript);
    summary = analysis.summary;
    sentiment = analysis.sentiment;
    actionItems = analysis.actionItems || [];
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
    const noteContent = buildNoteContent(summary, sentiment, actionItems);
    await createNoteFromCall(pgPool, {
      tenant_id,
      related_type: contactType,
      related_id: contactId,
      content: noteContent,
      metadata: {
        activity_id: activity.id,
        sentiment,
        action_items: actionItems,
        customer_requests: analysis.customerRequests || [],
        commitments_made: analysis.commitmentsMade || [],
        outcome,
        call_sid
      }
    });
  }

  // Step 4b: Create actionable activities for follow-ups
  if (actionItems && actionItems.length > 0) {
    await createActionActivities(pgPool, {
      tenant_id,
      related_type: contactType,
      related_id: contactId,
      contact_name: contactName,
      action_items: actionItems,
      call_activity_id: activity.id
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
 * Intelligently parses name provided by AI agent during conversation
 */
async function createLeadFromCall(pgPool, tenant_id, phone, callerInfo = {}) {
  // Parse name from AI agent extraction
  let firstName = 'Unknown';
  let lastName = 'Caller';
  
  if (callerInfo.name) {
    // AI agent extracted name from conversation (e.g., "Hi, this is John Smith")
    const nameParts = callerInfo.name.trim().split(/\s+/);
    if (nameParts.length === 1) {
      firstName = nameParts[0];
      lastName = ''; // Single name only
    } else if (nameParts.length >= 2) {
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' '); // Handle middle names
    }
  }

  // Prepare metadata
  const leadMetadata = {
    ...callerInfo,
    created_via: 'call_flow',
    phone_number: phone,
    ai_extracted_name: callerInfo.name || null,
    ai_extracted_email: callerInfo.email || null
  };
  delete leadMetadata.name; // Remove from metadata since it's in columns
  delete leadMetadata.email; // Will be in email column if provided

  const insertQuery = `
    INSERT INTO leads (tenant_id, phone, first_name, last_name, email, source, status, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING id, CONCAT(first_name, ' ', COALESCE(last_name, '')) as name
  `;

  const source = callerInfo.source || 'inbound_call';
  const status = 'new';
  const email = callerInfo.email || null; // Optional: AI agent may extract from conversation

  const result = await pgPool.query(insertQuery, [
    tenant_id,
    phone,
    firstName,
    lastName,
    email,
    source,
    status,
    JSON.stringify(leadMetadata)
  ]);

  console.log(`[CallFlow] Created lead ${result.rows[0].id} for ${phone} (${firstName} ${lastName})`);
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
 * Build formatted note content with action items
 */
function buildNoteContent(summary, sentiment, actionItems) {
  let content = summary;

  // Add sentiment indicator
  if (sentiment === 'positive') {
    content += '\n\n✅ Call went well.';
  } else if (sentiment === 'negative') {
    content += '\n\n⚠️ Customer had concerns.';
  }

  // Add action items section
  if (actionItems && actionItems.length > 0) {
    content += '\n\n**Action Items:**';
    actionItems.forEach((item, index) => {
      const priorityIcon = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';
      const taskText = typeof item === 'string' ? item : item.task;
      content += `\n${index + 1}. ${priorityIcon} ${taskText}`;
    });
  }

  return content;
}

/**
 * Create actionable activities from call action items
 * These appear as tasks in the CRM for follow-up
 */
async function createActionActivities(pgPool, data) {
  const { tenant_id, related_type, related_id, contact_name, action_items, call_activity_id } = data;

  for (const item of action_items) {
    // Only create activity for high/medium priority or specific types
    const actionItem = typeof item === 'string' ? { task: item, priority: 'medium', type: 'general' } : item;
    
    if (actionItem.priority === 'low') continue;

    const activityType = mapActionTypeToActivityType(actionItem.type);
    const subject = `Action: ${actionItem.task}`;
    const description = `Follow-up required for ${contact_name}. Origin: Call activity #${call_activity_id}`;

    const insertQuery = `
      INSERT INTO activities (
        tenant_id, related_type, related_id, type, subject, description,
        status, due_date, metadata, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id
    `;

    const dueDate = actionItem.dueDate || calculateDefaultDueDate(actionItem.priority);

    const activityMetadata = {
      priority: actionItem.priority,
      action_type: actionItem.type,
      origin_activity_id: call_activity_id,
      auto_created: true,
      created_from: 'call_transcript_analysis'
    };

    const result = await pgPool.query(insertQuery, [
      tenant_id,
      related_type,
      related_id,
      activityType,
      subject,
      description,
      'pending', // status
      dueDate,
      JSON.stringify(activityMetadata)
    ]);

    console.log(`[CallFlow] Created action activity ${result.rows[0].id}: ${subject}`);
  }
}

/**
 * Map action item type to activity type
 */
function mapActionTypeToActivityType(actionType) {
  const typeMap = {
    'email': 'email',
    'call': 'call',
    'meeting': 'meeting',
    'task': 'task',
    'general': 'task'
  };
  return typeMap[actionType] || 'task';
}

/**
 * Calculate default due date based on priority
 */
function calculateDefaultDueDate(priority) {
  const now = new Date();
  const daysToAdd = priority === 'high' ? 1 : priority === 'medium' ? 3 : 7;
  now.setDate(now.getDate() + daysToAdd);
  return now.toISOString();
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
 * Extracts summary, sentiment, and actionable tasks
 */
async function analyzeTranscript(transcript) {
  console.log(`[CallFlow] Analyzing transcript (${transcript.length} chars)`);

  // TODO: Implement OpenAI integration
  // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // const completion = await openai.chat.completions.create({
  //   model: "gpt-4",
  //   messages: [{
  //     role: "system",
  //     content: `You are a call center analyst. Analyze this call transcript and return JSON with:
  //     - summary: Brief overview (2-3 sentences)
  //     - sentiment: positive/neutral/negative
  //     - actionItems: Array of objects with {task, priority, dueDate, assignedTo}
  //     - customerRequests: What the customer asked for
  //     - commitmentsMade: What was promised during the call`
  //   }, {
  //     role: "user",
  //     content: transcript
  //   }],
  //   response_format: { type: "json_object" }
  // });
  // const analysis = JSON.parse(completion.choices[0].message.content);
  // return analysis;

  // For now, extract basic patterns and return mock analysis
  const analysis = extractBasicPatterns(transcript);
  
  return {
    summary: analysis.summary || `Call summary: ${transcript.substring(0, 100)}... [Full analysis pending OpenAI integration]`,
    sentiment: analysis.sentiment || 'neutral',
    actionItems: analysis.actionItems,
    customerRequests: analysis.customerRequests,
    commitmentsMade: analysis.commitmentsMade
  };
}

/**
 * Extract basic patterns from transcript until OpenAI integration
 * Looks for common action phrases and commitments
 */
function extractBasicPatterns(transcript) {
  const actionItems = [];
  const customerRequests = [];
  const commitmentsMade = [];
  let sentiment = 'neutral';

  const lowerTranscript = transcript.toLowerCase();

  // Detect sentiment from common phrases
  if (lowerTranscript.includes('great') || lowerTranscript.includes('excellent') || lowerTranscript.includes('thank you')) {
    sentiment = 'positive';
  } else if (lowerTranscript.includes('disappointed') || lowerTranscript.includes('frustrated') || lowerTranscript.includes('issue')) {
    sentiment = 'negative';
  }

  // Extract follow-up requests
  if (lowerTranscript.includes('send me') || lowerTranscript.includes('email me')) {
    const match = transcript.match(/send(?:ing)?\s+(?:me\s+)?([\w\s]+?)(?:\.|,|\?|$)/i);
    if (match) {
      actionItems.push({
        task: `Send ${match[1].trim()}`,
        priority: 'high',
        dueDate: null,
        type: 'email'
      });
      customerRequests.push(`Requested: ${match[1].trim()}`);
    }
  }

  // Extract callback requests
  if (lowerTranscript.includes('call me back') || lowerTranscript.includes('follow up')) {
    actionItems.push({
      task: 'Follow up call',
      priority: 'medium',
      dueDate: null,
      type: 'call'
    });
  }

  // Extract meeting/appointment requests
  if (lowerTranscript.includes('schedule') || lowerTranscript.includes('meeting') || lowerTranscript.includes('appointment')) {
    actionItems.push({
      task: 'Schedule meeting',
      priority: 'high',
      dueDate: null,
      type: 'meeting'
    });
    customerRequests.push('Requested meeting/appointment');
  }

  // Extract commitments (what was promised)
  if (lowerTranscript.includes('i will') || lowerTranscript.includes('we will') || lowerTranscript.includes("i'll")) {
    const commitmentMatch = transcript.match(/(?:i will|we will|i'll|we'll)\s+([^.!?]+)/gi);
    if (commitmentMatch) {
      commitmentMatch.forEach(commit => {
        commitmentsMade.push(commit.trim());
      });
    }
  }

  // Extract questions to be answered
  if (lowerTranscript.includes('can you') || lowerTranscript.includes('could you')) {
    const questionMatch = transcript.match(/(?:can you|could you)\s+([^.!?]+)/gi);
    if (questionMatch) {
      questionMatch.forEach(q => {
        customerRequests.push(q.trim());
      });
    }
  }

  // Default action items if none found
  if (actionItems.length === 0) {
    actionItems.push({
      task: 'Follow up with customer',
      priority: 'medium',
      dueDate: null,
      type: 'general'
    });
  }

  // Generate summary
  const summary = `Call with customer discussing ${sentiment === 'positive' ? 'positive' : sentiment === 'negative' ? 'concerns' : 'general topics'}. ${actionItems.length} action item(s) identified.`;

  return {
    summary,
    sentiment,
    actionItems,
    customerRequests,
    commitmentsMade
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
 * Prepare outbound call context for AI agent
 * Fetches contact details, recent interactions, and call purpose
 * AI agent uses this to know WHO to call, WHAT number, and WHAT to discuss
 */
export async function prepareOutboundCall(pgPool, params) {
  const { tenant_id, contact_id, campaign_id, call_purpose } = params;

  console.log(`[CallFlow] Preparing outbound call for contact ${contact_id}`);

  // Step 1: Fetch contact/lead details
  const contact = await getContactDetailsById(pgPool, tenant_id, contact_id);
  
  if (!contact) {
    throw new Error(`Contact ${contact_id} not found`);
  }

  if (!contact.phone && !contact.mobile) {
    throw new Error(`Contact ${contact_id} has no phone number`);
  }

  // Step 2: Fetch recent interactions (last 5 activities)
  const recentInteractions = await getRecentInteractions(pgPool, tenant_id, contact_id, contact.type);

  // Step 3: Fetch campaign context if provided
  let campaignInfo = null;
  if (campaign_id) {
    campaignInfo = await getCampaignContext(pgPool, tenant_id, campaign_id);
  }

  // Step 4: Build call context with talking points
  const callContext = {
    purpose: call_purpose || campaignInfo?.call_script || 'General follow-up call',
    talking_points: buildTalkingPoints(contact, campaignInfo, recentInteractions),
    campaign_info: campaignInfo,
    recent_interactions: recentInteractions.map(i => ({
      date: i.created_at,
      type: i.type,
      subject: i.subject,
      outcome: i.metadata?.outcome
    }))
  };

  // Step 5: Return complete call preparation
  return {
    contact: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone || contact.mobile,
      email: contact.email,
      company: contact.company,
      title: contact.title,
      type: contact.type,
      status: contact.status
    },
    call_context: callContext
  };
}

/**
 * Get detailed contact information by ID
 */
async function getContactDetailsById(pgPool, tenant_id, contact_id) {
  // Try contacts table
  const contactQuery = `
    SELECT 
      id,
      CONCAT(first_name, ' ', COALESCE(last_name, '')) as name,
      first_name,
      last_name,
      phone,
      mobile,
      email,
      company,
      title,
      'contact' as type,
      metadata
    FROM contacts 
    WHERE tenant_id = $1 AND id = $2
  `;
  
  const contactResult = await pgPool.query(contactQuery, [tenant_id, contact_id]);
  if (contactResult.rows.length > 0) {
    return contactResult.rows[0];
  }

  // Try leads table
  const leadQuery = `
    SELECT 
      id,
      CONCAT(first_name, ' ', COALESCE(last_name, '')) as name,
      first_name,
      last_name,
      phone,
      NULL as mobile,
      email,
      company,
      NULL as title,
      'lead' as type,
      status,
      metadata
    FROM leads 
    WHERE tenant_id = $1 AND id = $2
  `;
  
  const leadResult = await pgPool.query(leadQuery, [tenant_id, contact_id]);
  if (leadResult.rows.length > 0) {
    return leadResult.rows[0];
  }

  return null;
}

/**
 * Get recent interactions with contact
 */
async function getRecentInteractions(pgPool, tenant_id, contact_id, contact_type) {
  const query = `
    SELECT 
      id,
      type,
      subject,
      description,
      created_at,
      metadata
    FROM activities
    WHERE tenant_id = $1 
      AND related_type = $2 
      AND related_id = $3
    ORDER BY created_at DESC
    LIMIT 5
  `;

  const result = await pgPool.query(query, [tenant_id, contact_type, contact_id]);
  return result.rows;
}

/**
 * Get campaign context and script
 */
async function getCampaignContext(pgPool, tenant_id, campaign_id) {
  const query = `
    SELECT 
      id,
      name,
      campaign_type,
      metadata
    FROM ai_campaigns
    WHERE tenant_id = $1 AND id = $2
  `;

  const result = await pgPool.query(query, [tenant_id, campaign_id]);
  if (result.rows.length === 0) return null;

  const campaign = result.rows[0];
  return {
    name: campaign.name,
    type: campaign.campaign_type,
    call_script: campaign.metadata?.call_script || campaign.metadata?.message,
    offer: campaign.metadata?.offer,
    goal: campaign.metadata?.goal
  };
}

/**
 * Build talking points for AI agent based on context
 */
function buildTalkingPoints(contact, campaignInfo, recentInteractions) {
  const points = [];

  // Greeting with name
  points.push(`Greet ${contact.first_name || contact.name} by name`);

  // Campaign-specific points
  if (campaignInfo) {
    points.push(`Discuss: ${campaignInfo.name}`);
    if (campaignInfo.offer) {
      points.push(`Mention offer: ${campaignInfo.offer}`);
    }
  }

  // Recent interaction context
  if (recentInteractions.length > 0) {
    const lastInteraction = recentInteractions[0];
    points.push(`Reference last interaction: ${lastInteraction.subject}`);
  }

  // Contact-specific context
  if (contact.company) {
    points.push(`Reference their company: ${contact.company}`);
  }

  // Default closing
  points.push('Ask if they have any questions');
  points.push('Schedule follow-up if interested');

  return points;
}

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone) {
  if (!phone) return '';
  // eslint-disable-next-line no-useless-escape
  return phone.replace(/[\s\-\+\(\)]/g, '');
}
