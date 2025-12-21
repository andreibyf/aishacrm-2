/**
 * Campaign Worker - Executes scheduled AI campaigns
 * 
 * Architecture:
 * - Polls for campaigns with status='scheduled' every CAMPAIGN_WORKER_INTERVAL_MS
 * - Uses Postgres advisory locks to prevent duplicate processing across multiple backend instances
 * - Executes email sends or AI calls based on campaign_type
 * - Updates progress in metadata and emits webhook events
 * - Runs only when CAMPAIGN_WORKER_ENABLED=true
 */

import { emitTenantWebhooks } from './webhookEmitter.js';

let workerInterval = null;
let pgPool = null;

/**
 * Initialize and start the campaign worker
 */
export function startCampaignWorker(pool, intervalMs = 30000) {
  if (!pool) {
    console.warn('[CampaignWorker] No database pool provided - worker disabled');
    return;
  }

  pgPool = pool;
  const enabled = process.env.CAMPAIGN_WORKER_ENABLED === 'true';
  
  if (!enabled) {
    console.log('[CampaignWorker] Disabled (CAMPAIGN_WORKER_ENABLED not true)');
    return;
  }

  console.log(`[CampaignWorker] Starting with ${intervalMs}ms interval`);
  
  // Run immediately on start
  processPendingCampaigns().catch(err => 
    console.error('[CampaignWorker] Initial run error:', err.message)
  );

  // Then run on interval
  workerInterval = setInterval(() => {
    processPendingCampaigns().catch(err => 
      console.error('[CampaignWorker] Error:', err.message)
    );
  }, intervalMs);

  console.log('[CampaignWorker] Started');
}

/**
 * Stop the campaign worker
 */
export function stopCampaignWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[CampaignWorker] Stopped');
  }
}

/**
 * Main processing loop - finds and executes scheduled campaigns
 */
async function processPendingCampaigns() {
  if (!pgPool) return;

  try {
    // Find scheduled campaigns (not yet picked up by any worker)
    const query = `
      SELECT id, tenant_id, name, metadata, target_contacts, campaign_type
      FROM ai_campaigns
      WHERE status = 'scheduled'
        AND (metadata->'lifecycle'->>'started_at' IS NULL OR metadata->'lifecycle'->>'started_at' = '')
      ORDER BY created_at ASC
      LIMIT 10
    `;
    
    const result = await pgPool.query(query);
    
    if (result.rows.length === 0) {
      // No work to do
      return;
    }

    console.log(`[CampaignWorker] Found ${result.rows.length} pending campaign(s)`);

    // Process each campaign
    for (const campaign of result.rows) {
      await processCampaign(campaign);
    }
  } catch (err) {
    console.error('[CampaignWorker] processPendingCampaigns error:', err.message);
  }
}

/**
 * Process a single campaign with advisory locking
 */
async function processCampaign(campaign) {
  const { id, tenant_id, name } = campaign;
  
  // Advisory lock ID (hash campaign ID to int)
  const lockId = hashStringToInt(id);

  let client = null;
  try {
    // Get a dedicated client for this transaction
    client = await pgPool.connect();
    
    // Try to acquire advisory lock (non-blocking)
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) as locked', [lockId]);
    
    if (!lockResult.rows[0].locked) {
      // Another worker is processing this campaign
      return;
    }

    console.log(`[CampaignWorker] Processing campaign ${id} (${name})`);

    // Mark as running and stamp start time
    await client.query(`
      UPDATE ai_campaigns
      SET status = 'running',
          metadata = jsonb_set(
            jsonb_set(metadata, '{lifecycle,started_at}', to_jsonb(NOW()::text)),
            '{progress}', '{"total": 0, "processed": 0, "success": 0, "failed": 0}'::jsonb
          )
      WHERE id = $1 AND tenant_id = $2
    `, [id, tenant_id]);

    // Emit progress webhook (started)
    await emitTenantWebhooks(tenant_id, 'aicampaign.progress', {
      id,
      status: 'running',
      progress: { total: 0, processed: 0, success: 0, failed: 0 }
    }).catch(err => console.error('[CampaignWorker] Webhook emission failed:', err.message));

    // Execute the campaign based on type
    const result = await executeCampaign(campaign, client);

    // Update final status and metrics
    const finalStatus = result.success ? 'completed' : 'failed';
    await client.query(`
      UPDATE ai_campaigns
      SET status = $1,
          metadata = jsonb_set(
            jsonb_set(
              jsonb_set(metadata, '{lifecycle,${finalStatus}_at}', to_jsonb(NOW()::text)),
              '{progress}', to_jsonb($2::jsonb)
            ),
            '{execution_result}', to_jsonb($3::jsonb)
          )
      WHERE id = $4 AND tenant_id = $5
    `, [finalStatus, JSON.stringify(result.progress), JSON.stringify(result.details), id, tenant_id]);

    // Emit final webhook
    const event = result.success ? 'aicampaign.completed' : 'aicampaign.failed';
    await emitTenantWebhooks(tenant_id, event, {
      id,
      status: finalStatus,
      progress: result.progress,
      details: result.details
    }).catch(err => console.error('[CampaignWorker] Final webhook emission failed:', err.message));

    console.log(`[CampaignWorker] Campaign ${id} finished: ${finalStatus}`);

  } catch (err) {
    console.error(`[CampaignWorker] Error processing campaign ${id}:`, err.message);
    
    // Mark as failed
    if (client) {
      try {
        await client.query(`
          UPDATE ai_campaigns
          SET status = 'failed',
              metadata = jsonb_set(
                jsonb_set(metadata, '{lifecycle,failed_at}', to_jsonb(NOW()::text)),
                '{error}', to_jsonb($1::text)
              )
          WHERE id = $2 AND tenant_id = $3
        `, [err.message, id, tenant_id]);
      } catch (updateErr) {
        console.error('[CampaignWorker] Failed to update error status:', updateErr.message);
      }
    }
  } finally {
    // Release advisory lock
    if (client) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
      } catch (unlockErr) {
        console.error('[CampaignWorker] Failed to release lock:', unlockErr.message);
      }
      client.release();
    }
  }
}

/**
 * Execute a campaign based on its type
 */
async function executeCampaign(campaign, client) {
  const { id: _id, tenant_id: _tenant_id, metadata, target_contacts, campaign_type } = campaign;
  
  const type = metadata?.campaign_type || campaign_type || 'call';
  const contacts = Array.isArray(target_contacts) ? target_contacts : [];
  
  const progress = {
    total: contacts.length,
    processed: 0,
    success: 0,
    failed: 0
  };

  if (contacts.length === 0) {
    return {
      success: true,
      progress,
      details: { message: 'No contacts to process' }
    };
  }

  // Execute based on type
  try {
    if (type === 'email') {
      await executeEmailCampaign(campaign, contacts, progress, client);
    } else if (type === 'call') {
      await executeCallCampaign(campaign, contacts, progress, client);
    } else {
      throw new Error(`Unsupported campaign type: ${type}`);
    }

    return {
      success: true,
      progress,
      details: { message: `Processed ${progress.processed} contacts` }
    };
  } catch (err) {
    return {
      success: false,
      progress,
      details: { error: err.message }
    };
  }
}

/**
 * Execute email campaign
 */
async function executeEmailCampaign(campaign, contacts, progress, client) {
  const { tenant_id, metadata } = campaign;
  
  // Get sending profile (email integration)
  const sendingProfileId = metadata?.ai_email_config?.sending_profile_id;
  if (!sendingProfileId) {
    throw new Error('No sending profile configured for email campaign');
  }

  // Load integration credentials (tenant-scoped)
  const integrationResult = await client.query(
    'SELECT * FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 AND is_active = true LIMIT 1',
    [tenant_id, sendingProfileId]
  );

  if (integrationResult.rows.length === 0) {
    throw new Error('Sending profile not found or inactive');
  }

  const integration = integrationResult.rows[0];
  const credentials = integration.credentials || {};

  // Email template from metadata
  const subject = metadata?.ai_email_config?.subject || 'No Subject';
  const bodyTemplate = metadata?.ai_email_config?.body_template || '';

  // Process each contact
  for (const contact of contacts) {
    try {
      // Personalize email body (simple template replace)
      const personalizedBody = personalizeTemplate(bodyTemplate, contact);

      // Send email based on integration type
      await sendEmail(integration.integration_type, credentials, contact.email, subject, personalizedBody);

      progress.success++;
    } catch (err) {
      console.error(`[CampaignWorker] Failed to send email to ${contact.email}:`, err.message);
      progress.failed++;
    }
    
    progress.processed++;

    // Emit progress webhook every 10 contacts
    if (progress.processed % 10 === 0) {
      await emitTenantWebhooks(tenant_id, 'aicampaign.progress', {
        id,
        status: 'running',
        progress: { ...progress }
      }).catch(() => {});
    }
  }
}

/**
 * Execute AI call campaign
 */
async function executeCallCampaign(campaign, contacts, progress, client) {
  const { id, tenant_id, metadata } = campaign;
  
  // Get call integration
  const callIntegrationId = metadata?.ai_call_integration_id;
  if (!callIntegrationId) {
    throw new Error('No call integration configured');
  }

  // Load integration credentials (tenant-scoped)
  const integrationResult = await client.query(
    'SELECT * FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 AND is_active = true LIMIT 1',
    [tenant_id, callIntegrationId]
  );

  if (integrationResult.rows.length === 0) {
    throw new Error('Call integration not found or inactive');
  }

  const integration = integrationResult.rows[0];
  const credentials = integration.credentials || {};

  // Process each contact
  for (const contact of contacts) {
    try {
      // Trigger AI call via integration
      await triggerAICall(integration.integration_type, credentials, contact.phone, metadata);

      progress.success++;
    } catch (err) {
      console.error(`[CampaignWorker] Failed to trigger call to ${contact.phone}:`, err.message);
      progress.failed++;
    }
    
    progress.processed++;

    // Emit progress webhook every 10 contacts
    if (progress.processed % 10 === 0) {
      await emitTenantWebhooks(tenant_id, 'aicampaign.progress', {
        id,
        status: 'running',
        progress: { ...progress }
      }).catch(() => {});
    }
  }
}

/**
 * Send email via integration
 */
async function sendEmail(integrationType, credentials, toEmail, _subject, _body) {
  // Stub implementation - to be expanded with actual providers
  console.log(`[CampaignWorker] Sending email via ${integrationType} to ${toEmail}`);
  
  switch (integrationType) {
    case 'gmail':
      // TODO: Implement Gmail API send
      throw new Error('Gmail integration not yet implemented');
      
    case 'outlook_email':
      // TODO: Implement Outlook/Microsoft Graph send
      throw new Error('Outlook integration not yet implemented');
      
    case 'webhook_email':
      // TODO: Send to webhook endpoint
      if (!credentials.webhook_url) {
        throw new Error('No webhook URL configured');
      }
      // Implement webhook POST
      throw new Error('Webhook email integration not yet implemented');
      
    default:
      throw new Error(`Unsupported email integration: ${integrationType}`);
  }
}

/**
 * Trigger AI call via integration
 */
async function triggerAICall(integrationType, credentials, phone, metadata) {
  console.log(`[CampaignWorker] Triggering AI call via ${integrationType} to ${phone}`);
  
  // Step 1: Prepare call context with contact details and talking points
  const { contact_id, campaign_id, tenant_id } = metadata;
  
  let callContext;
  try {
    const { prepareOutboundCall } = await import('./callFlowHandler.js');
    const { pgPool } = await import('../config/db.js');
    
    callContext = await prepareOutboundCall(pgPool, {
      tenant_id,
      contact_id,
      campaign_id
    });
  } catch (error) {
    console.error('[CampaignWorker] Failed to prepare call context:', error);
    throw new Error('Failed to prepare call context');
  }
  
  // Step 2: Trigger call with full context via provider
  switch (integrationType) {
    case 'callfluent':
      return await triggerCallFluentCall(credentials, callContext, campaign_id);
      
    case 'thoughtly':
      return await triggerThoughtlyCall(credentials, callContext, campaign_id);
      
    default:
      throw new Error(`Unsupported call integration: ${integrationType}`);
  }
}

/**
 * Trigger CallFluent AI call with full contact context
 */
async function triggerCallFluentCall(credentials, callContext, _campaign_id) {
  const { api_key: _api_key, agent_id: _agent_id } = credentials;
  
  // TODO: Integrate with CallFluent API
  // const response = await fetch('https://api.callfluent.com/v1/calls', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${api_key}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     agent_id: agent_id,
  //     to: callContext.contact.phone,
  //     context: {
  //       contact_name: callContext.contact.name,
  //       contact_email: callContext.contact.email,
  //       contact_company: callContext.contact.company,
  //       call_purpose: callContext.call_context.purpose,
  //       talking_points: callContext.call_context.talking_points,
  //       campaign_id: campaign_id
  //     },
  //     webhook_url: `${process.env.BACKEND_URL}/api/telephony/webhook/callfluent/outbound`
  //   })
  // });
  
  console.log('[CampaignWorker] CallFluent call triggered (stub):', {
    to: callContext.contact.phone,
    name: callContext.contact.name,
    purpose: callContext.call_context.purpose,
    talking_points: callContext.call_context.talking_points
  });
  
  return { success: true, provider: 'callfluent', status: 'initiated' };
}

/**
 * Trigger Thoughtly AI call with full contact context
 */
async function triggerThoughtlyCall(credentials, callContext, _campaign_id) {
  const { api_key: _api_key, agent_id: _agent_id } = credentials;
  
  // TODO: Integrate with Thoughtly API
  // const response = await fetch('https://api.thoughtly.ai/v1/calls', {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${api_key}`,
  //     'Content-Type': 'application/json'
  //   },
  //   body: JSON.stringify({
  //     agent_id: agent_id,
  //     phone_number: callContext.contact.phone,
  //     contact_info: {
  //       name: callContext.contact.name,
  //       email: callContext.contact.email,
  //       company: callContext.contact.company
  //     },
  //     script: callContext.call_context.purpose,
  //     talking_points: callContext.call_context.talking_points,
  //     metadata: {
  //       campaign_id: campaign_id,
  //       contact_id: callContext.contact.id
  //     },
  //     callback_url: `${process.env.BACKEND_URL}/api/telephony/webhook/thoughtly/outbound`
  //   })
  // });
  
  console.log('[CampaignWorker] Thoughtly call triggered (stub):', {
    to: callContext.contact.phone,
    name: callContext.contact.name,
    purpose: callContext.call_context.purpose,
    talking_points: callContext.call_context.talking_points
  });
  
  return { success: true, provider: 'thoughtly', status: 'initiated' };
}

/**
 * Personalize template with contact data
 */
function personalizeTemplate(template, contact) {
  let result = template;
  
  // Replace common placeholders
  const replacements = {
    '{{first_name}}': contact.first_name || '',
    '{{last_name}}': contact.last_name || '',
    '{{email}}': contact.email || '',
    '{{phone}}': contact.phone || '',
    '{{company}}': contact.company || '',
  };
  
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(placeholder, 'g'), value);
  }
  
  return result;
}

/**
 * Hash string to integer for advisory lock
 */
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
