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
import logger from './logger.js';

let workerInterval = null;
let pgPool = null;
const TARGET_BATCH_SIZE = Number(process.env.CAMPAIGN_WORKER_TARGET_BATCH_SIZE || 25);

/**
 * Initialize and start the campaign worker
 */
export function startCampaignWorker(pool, intervalMs = 30000) {
  if (!pool) {
    logger.warn('[CampaignWorker] No database pool provided - worker disabled');
    return;
  }

  pgPool = pool;
  const enabled = process.env.CAMPAIGN_WORKER_ENABLED === 'true';

  if (!enabled) {
    logger.info('[CampaignWorker] Disabled (CAMPAIGN_WORKER_ENABLED not true)');
    return;
  }

  logger.info({ intervalMs }, '[CampaignWorker] Starting');

  // Run immediately on start
  processPendingCampaigns().catch((err) =>
    logger.error({ err }, '[CampaignWorker] Initial run error'),
  );

  // Then run on interval
  workerInterval = setInterval(() => {
    processPendingCampaigns().catch((err) => logger.error({ err }, '[CampaignWorker] Error'));
  }, intervalMs);

  logger.info('[CampaignWorker] Started');
}

/**
 * Stop the campaign worker
 */
export function stopCampaignWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info('[CampaignWorker] Stopped');
  }
}

/**
 * Main processing loop - finds and executes scheduled campaigns
 */
async function processPendingCampaigns() {
  if (!pgPool) return;

  try {
    // Phase A: pickup due scheduled campaigns
    const scheduledQuery = `
      SELECT id, tenant_id, name, metadata, campaign_type, status
      FROM ai_campaign
      WHERE status = 'scheduled'
        AND (
          (metadata->'schedule'->>'scheduled_at') IS NULL
          OR (metadata->'schedule'->>'scheduled_at') = ''
          OR (metadata->'schedule'->>'scheduled_at')::timestamptz <= NOW()
        )
      ORDER BY created_at ASC
      LIMIT 10
    `;

    const scheduledResult = await pgPool.query(scheduledQuery);
    for (const campaign of scheduledResult.rows) {
      await processCampaign(campaign);
    }

    // Phase B: process running campaigns
    const runningQuery = `
      SELECT id, tenant_id, name, metadata, campaign_type, status
      FROM ai_campaign
      WHERE status = 'running'
      ORDER BY updated_at ASC
      LIMIT 10
    `;

    const runningResult = await pgPool.query(runningQuery);
    for (const campaign of runningResult.rows) {
      await processCampaign(campaign);
    }
  } catch (err) {
    logger.error({ err }, '[CampaignWorker] processPendingCampaigns error');
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

    logger.info(
      { campaignId: id, name, status: campaign.status },
      '[CampaignWorker] Processing campaign',
    );

    let campaignRow = campaign;
    if (campaign.status === 'scheduled') {
      const startedRow = await transitionScheduledCampaignToRunning(client, campaign);
      if (!startedRow) return;
      campaignRow = startedRow;
    }

    if (campaignRow.status !== 'running') return;

    await processRunningCampaignBatch(client, campaignRow);
  } catch (err) {
    logger.error({ err, campaignId: id }, '[CampaignWorker] Error processing campaign');

    // Mark as failed
    if (client) {
      try {
        await client.query(
          `
          UPDATE ai_campaign
          SET status = 'failed',
              metadata = jsonb_set(
                jsonb_set(metadata, '{lifecycle,failed_at}', to_jsonb(NOW()::text)),
                '{error}', to_jsonb($1::text)
              )
          WHERE id = $2 AND tenant_id = $3
        `,
          [err.message, id, tenant_id],
        );
      } catch (updateErr) {
        logger.error({ err: updateErr }, '[CampaignWorker] Failed to update error status');
      }
    }
  } finally {
    // Release advisory lock
    if (client) {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
      } catch (unlockErr) {
        logger.error({ err: unlockErr }, '[CampaignWorker] Failed to release lock');
      }
      client.release();
    }
  }
}

/**
 * Transition due scheduled campaign to running and emit start event.
 */
async function transitionScheduledCampaignToRunning(client, campaign) {
  const { id, tenant_id } = campaign;
  const updateResult = await client.query(
    `
    UPDATE ai_campaign
    SET status = 'running',
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{lifecycle,started_at}',
          to_jsonb(NOW()::text),
          true
        ),
        updated_at = NOW()
    WHERE id = $1
      AND tenant_id = $2
      AND status = 'scheduled'
      AND (
        (metadata->'schedule'->>'scheduled_at') IS NULL
        OR (metadata->'schedule'->>'scheduled_at') = ''
        OR (metadata->'schedule'->>'scheduled_at')::timestamptz <= NOW()
      )
    RETURNING *
  `,
    [id, tenant_id],
  );

  if (updateResult.rows.length === 0) return null;

  await insertCampaignEvent(client, {
    tenant_id,
    campaign_id: id,
    contact_id: null,
    status: 'running',
    event_type: 'campaign_started',
    attempt_no: 0,
    payload: {
      campaign_type: updateResult.rows[0].campaign_type || 'call',
    },
  });

  return updateResult.rows[0];
}

/**
 * Process a single batch of running campaign targets.
 */
async function processRunningCampaignBatch(client, campaign) {
  const targets = await claimPendingTargets(client, campaign, TARGET_BATCH_SIZE);

  if (targets.length > 0) {
    let deliveryContext = null;
    try {
      deliveryContext = await getDeliveryContext(client, campaign);
    } catch (err) {
      deliveryContext = { type: 'error', error: err.message };
    }

    for (const target of targets) {
      if (deliveryContext?.type === 'error') {
        await markTargetFailed(client, campaign, target, deliveryContext.error);
        continue;
      }

      try {
        await deliverTarget(client, campaign, target, deliveryContext);
        await markTargetCompleted(client, campaign, target);
      } catch (err) {
        await markTargetFailed(client, campaign, target, err.message || 'Unknown target error');
      }
    }
  }

  const progress = await computeCampaignProgress(client, campaign.id, campaign.tenant_id);
  await updateCampaignProgress(client, campaign, progress);

  await emitTenantWebhooks(pgPool, campaign.tenant_id, 'aicampaign.progress', {
    id: campaign.id,
    status: progress.pending === 0 && progress.processing === 0 ? 'completed' : 'running',
    progress,
  }).catch((err) => logger.error({ err }, '[CampaignWorker] Webhook emission failed'));
}

/**
 * Claim pending targets for processing using row locks.
 */
async function claimPendingTargets(client, campaign, batchSize) {
  const result = await client.query(
    `
    WITH to_claim AS (
      SELECT id
      FROM ai_campaign_targets
      WHERE tenant_id = $1
        AND campaign_id = $2
        AND status = 'pending'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $3
    )
    UPDATE ai_campaign_targets t
    SET status = 'processing',
        started_at = NOW(),
        attempt_count = COALESCE(t.attempt_count, 0) + 1,
        last_attempt_at = NOW(),
        updated_at = NOW()
    FROM to_claim
    WHERE t.id = to_claim.id
    RETURNING t.*
  `,
    [campaign.tenant_id, campaign.id, batchSize],
  );
  return result.rows;
}

/**
 * Load tenant-scoped delivery integration configuration.
 */
async function getDeliveryContext(client, campaign) {
  const meta = campaign.metadata || {};
  const type = campaign.campaign_type || meta.campaign_type || 'call';

  if (type === 'email') {
    const sendingProfileId = meta?.ai_email_config?.sending_profile_id;
    if (!sendingProfileId) {
      throw new Error('No sending profile configured for email campaign');
    }

    const integrationResult = await client.query(
      'SELECT * FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 AND is_active = true LIMIT 1',
      [campaign.tenant_id, sendingProfileId],
    );
    if (integrationResult.rows.length === 0) {
      throw new Error('Sending profile not found or inactive');
    }

    return {
      type: 'email',
      integrationType: integrationResult.rows[0].integration_type,
      credentials: integrationResult.rows[0].credentials || {},
      subject: meta?.ai_email_config?.subject || 'No Subject',
      bodyTemplate: meta?.ai_email_config?.body_template || '',
    };
  }

  if (type === 'call') {
    const callIntegrationId = meta?.ai_call_integration_id;
    if (!callIntegrationId) {
      throw new Error('No call integration configured');
    }

    const integrationResult = await client.query(
      'SELECT * FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 AND is_active = true LIMIT 1',
      [campaign.tenant_id, callIntegrationId],
    );
    if (integrationResult.rows.length === 0) {
      throw new Error('Call integration not found or inactive');
    }

    return {
      type: 'call',
      integrationType: integrationResult.rows[0].integration_type,
      credentials: integrationResult.rows[0].credentials || {},
    };
  }

  return {
    type: 'unsupported',
    error: 'Unsupported campaign type',
  };
}

/**
 * Deliver a single target based on campaign type.
 */
async function deliverTarget(_client, campaign, target, deliveryContext) {
  const destination = target.destination || null;
  if (!destination) {
    throw new Error('Target destination is missing');
  }

  const payload = target.target_payload || {};
  const campaignMeta = campaign.metadata || {};

  if (deliveryContext.type === 'email') {
    const templateInput = {
      first_name: payload.first_name || payload.contact_name || '',
      last_name: payload.last_name || '',
      email: payload.email || destination,
      phone: payload.phone || '',
      company: payload.company || '',
    };
    const personalizedBody = personalizeTemplate(deliveryContext.bodyTemplate, templateInput);
    await sendEmail(
      deliveryContext.integrationType,
      deliveryContext.credentials,
      destination,
      deliveryContext.subject,
      personalizedBody,
    );
    return;
  }

  if (deliveryContext.type === 'call') {
    await triggerAICall(deliveryContext.integrationType, deliveryContext.credentials, destination, {
      ...campaignMeta,
      tenant_id: campaign.tenant_id,
      campaign_id: campaign.id,
      contact_id: target.contact_id,
    });
    return;
  }

  throw new Error(deliveryContext.error || 'Unsupported campaign type');
}

/**
 * Update target as completed and emit event.
 */
async function markTargetCompleted(client, campaign, target) {
  await client.query(
    `
    UPDATE ai_campaign_targets
    SET status = 'completed',
        error_message = NULL,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
      AND tenant_id = $2
      AND campaign_id = $3
  `,
    [target.id, campaign.tenant_id, campaign.id],
  );

  await insertCampaignEvent(client, {
    tenant_id: campaign.tenant_id,
    campaign_id: campaign.id,
    contact_id: target.contact_id,
    status: 'completed',
    event_type: 'target_completed',
    attempt_no: target.attempt_count || 0,
    payload: {
      target_id: target.id,
      destination: target.destination || null,
    },
  });
}

/**
 * Update target as failed and emit event.
 */
async function markTargetFailed(client, campaign, target, errorMessage) {
  const safeMessage = String(errorMessage || 'Unknown target failure').slice(0, 2000);
  await client.query(
    `
    UPDATE ai_campaign_targets
    SET status = 'failed',
        error_message = $4,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
      AND tenant_id = $2
      AND campaign_id = $3
  `,
    [target.id, campaign.tenant_id, campaign.id, safeMessage],
  );

  await insertCampaignEvent(client, {
    tenant_id: campaign.tenant_id,
    campaign_id: campaign.id,
    contact_id: target.contact_id,
    status: 'failed',
    event_type: 'target_failed',
    attempt_no: target.attempt_count || 0,
    payload: {
      target_id: target.id,
      destination: target.destination || null,
      error_message: safeMessage,
    },
  });
}

/**
 * Aggregate target status counts for campaign metadata rollup.
 */
async function computeCampaignProgress(client, campaignId, tenantId) {
  const countsResult = await client.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
    FROM ai_campaign_targets
    WHERE campaign_id = $1
      AND tenant_id = $2
  `,
    [campaignId, tenantId],
  );
  return (
    countsResult.rows[0] || {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    }
  );
}

/**
 * Persist progress and mark campaign complete when work is drained.
 */
async function updateCampaignProgress(client, campaign, progress) {
  const shouldComplete = Number(progress.pending) === 0 && Number(progress.processing) === 0;

  if (shouldComplete) {
    const completeResult = await client.query(
      `
      UPDATE ai_campaign
      SET status = 'completed',
          metadata = jsonb_set(
            jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{progress}',
              $3::jsonb,
              true
            ),
            '{lifecycle,completed_at}',
            to_jsonb(NOW()::text),
            true
          ),
          updated_at = NOW()
      WHERE id = $1
        AND tenant_id = $2
        AND status = 'running'
      RETURNING id
    `,
      [campaign.id, campaign.tenant_id, JSON.stringify(progress)],
    );

    if (completeResult.rows.length > 0) {
      await insertCampaignEvent(client, {
        tenant_id: campaign.tenant_id,
        campaign_id: campaign.id,
        contact_id: null,
        status: 'completed',
        event_type: 'campaign_completed',
        attempt_no: 0,
        payload: { progress },
      });
      await emitTenantWebhooks(pgPool, campaign.tenant_id, 'aicampaign.completed', {
        id: campaign.id,
        status: 'completed',
        progress,
      }).catch((err) => logger.error({ err }, '[CampaignWorker] Final webhook emission failed'));
    }
    return;
  }

  await client.query(
    `
    UPDATE ai_campaign
    SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{progress}',
          $3::jsonb,
          true
        ),
        updated_at = NOW()
    WHERE id = $1
      AND tenant_id = $2
  `,
    [campaign.id, campaign.tenant_id, JSON.stringify(progress)],
  );
}

/**
 * Insert campaign execution event row.
 */
async function insertCampaignEvent(client, event) {
  await client.query(
    `
    INSERT INTO ai_campaign_events (
      tenant_id,
      campaign_id,
      contact_id,
      status,
      event_type,
      attempt_no,
      payload,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
  `,
    [
      event.tenant_id,
      event.campaign_id,
      event.contact_id || null,
      event.status || 'pending',
      event.event_type,
      Number(event.attempt_no || 0),
      JSON.stringify(event.payload || {}),
    ],
  );
}

/**
 * Send email via integration
 */
async function sendEmail(integrationType, credentials, toEmail, _subject, _body) {
  // Stub implementation - to be expanded with actual providers
  logger.debug({ integrationType, toEmail }, '[CampaignWorker] Sending email via integration');

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
  logger.debug({ integrationType, phone }, '[CampaignWorker] Triggering AI call via integration');

  // Step 1: Prepare call context with contact details and talking points
  const { contact_id, campaign_id, tenant_id } = metadata;

  let callContext;
  try {
    const { prepareOutboundCall } = await import('./callFlowHandler.js');
    const { pgPool } = await import('../config/db.js');

    callContext = await prepareOutboundCall(pgPool, {
      tenant_id,
      contact_id,
      campaign_id,
    });
  } catch (error) {
    logger.error({ err: error }, '[CampaignWorker] Failed to prepare call context');
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

  logger.debug(
    {
      to: callContext.contact.phone,
      name: callContext.contact.name,
      purpose: callContext.call_context.purpose,
    },
    '[CampaignWorker] CallFluent call triggered (stub)',
  );

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

  logger.debug(
    {
      to: callContext.contact.phone,
      name: callContext.contact.name,
      purpose: callContext.call_context.purpose,
    },
    '[CampaignWorker] Thoughtly call triggered (stub)',
  );

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
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
