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
import { getSupabaseClient, query as supabaseSqlQuery } from './supabase-db.js';

let workerInterval = null;
let supabase = null;
const webhookDb = { query: supabaseSqlQuery };
const TARGET_BATCH_SIZE = Number(process.env.CAMPAIGN_WORKER_TARGET_BATCH_SIZE || 25);

export function isCampaignWorkerEnabled(env = process.env) {
  return env?.CAMPAIGN_WORKER_ENABLED === 'true';
}

/**
 * Initialize and start the campaign worker
 */
export function startCampaignWorker(pool, intervalMs = 30000) {
  if (pool) {
    logger.debug('[CampaignWorker] Ignoring pgPool input; using Supabase client');
  }
  supabase = getSupabaseClient();
  const enabled = isCampaignWorkerEnabled(process.env);

  if (!enabled) {
    logger.info('[CampaignWorker] Disabled (set CAMPAIGN_WORKER_ENABLED=true to enable)');
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
  if (!supabase) return;

  try {
    // Phase A: pickup due scheduled campaigns.
    // Fetch a generous page (50) so that future-dated rows don't starve
    // due campaigns — isScheduledDue filters client-side after fetch.
    const { data: scheduledCampaigns, error: scheduledErr } = await supabase
      .from('ai_campaign')
      .select('id, tenant_id, name, metadata, campaign_type, status, workflow_id, created_at')
      .eq('status', 'scheduled')
      .order('created_at', { ascending: true })
      .limit(50);
    if (scheduledErr) throw scheduledErr;

    const dueScheduled = (scheduledCampaigns || []).filter(isScheduledDue);
    for (const campaign of dueScheduled) {
      await processCampaign(campaign);
    }

    // Phase B: process running campaigns
    const { data: runningCampaigns, error: runningErr } = await supabase
      .from('ai_campaign')
      .select('id, tenant_id, name, metadata, campaign_type, status, workflow_id, updated_at')
      .eq('status', 'running')
      .order('updated_at', { ascending: true })
      .limit(10);
    if (runningErr) throw runningErr;

    logger.info(
      {
        scheduledDue: dueScheduled.length,
        runningActive: (runningCampaigns || []).length,
      },
      '[CampaignWorker] Tick',
    );
    for (const campaign of runningCampaigns || []) {
      await processCampaign(campaign);
    }
  } catch (err) {
    logger.error({ err }, '[CampaignWorker] processPendingCampaigns error');
  }
}

/**
 * Process a single campaign
 */
async function processCampaign(campaign) {
  const { id, tenant_id, name } = campaign;

  try {
    logger.info(
      { campaignId: id, name, status: campaign.status },
      '[CampaignWorker] Processing campaign',
    );

    let campaignRow = campaign;
    if (campaign.status === 'scheduled') {
      const startedRow = await transitionScheduledCampaignToRunning(campaign);
      if (!startedRow) return;
      campaignRow = startedRow;
    }

    if (campaignRow.status !== 'running') return;

    await processRunningCampaignBatch(campaignRow);
  } catch (err) {
    logger.error({ err, campaignId: id }, '[CampaignWorker] Error processing campaign');

    // Mark as failed
    try {
      const metadataObj = toObject(campaign.metadata);
      metadataObj.lifecycle = toObject(metadataObj.lifecycle);
      metadataObj.lifecycle.failed_at = new Date().toISOString();
      metadataObj.error = err.message;

      const { error: updateErr } = await supabase
        .from('ai_campaign')
        .update({
          status: 'failed',
          metadata: metadataObj,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', tenant_id);
      if (updateErr) throw updateErr;
    } catch (updateErr) {
      logger.error({ err: updateErr }, '[CampaignWorker] Failed to update error status');
    }
  }
}

/**
 * Transition due scheduled campaign to running and emit start event.
 */
async function transitionScheduledCampaignToRunning(campaign) {
  const { id, tenant_id } = campaign;
  if (!isScheduledDue(campaign)) return null;

  const metadataObj = toObject(campaign.metadata);
  metadataObj.lifecycle = toObject(metadataObj.lifecycle);
  metadataObj.lifecycle.started_at = new Date().toISOString();

  const { data: updatedRows, error: updateErr } = await supabase
    .from('ai_campaign')
    .update({
      status: 'running',
      metadata: metadataObj,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .eq('status', 'scheduled')
    .select('*');
  if (updateErr) throw updateErr;
  if (!updatedRows || updatedRows.length === 0) return null;

  await insertCampaignEvent({
    tenant_id,
    campaign_id: id,
    contact_id: null,
    status: 'running',
    event_type: 'campaign_started',
    attempt_no: 0,
    payload: {
      campaign_type: updatedRows[0].campaign_type || 'call',
    },
  });

  return updatedRows[0];
}

/**
 * Process a single batch of running campaign targets.
 */
async function processRunningCampaignBatch(campaign) {
  const targets = await claimPendingTargets(campaign, TARGET_BATCH_SIZE);
  logger.info(
    {
      campaignId: campaign.id,
      claimedTargets: targets.length,
      batchSize: TARGET_BATCH_SIZE,
    },
    '[CampaignWorker] Batch claim',
  );

  if (targets.length > 0) {
    for (const target of targets) {
      try {
        await Promise.race([
          dispatchViaWorkflow(campaign, target),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Execution timeout')), 15000),
          ),
        ]);

        await markTargetCompleted(campaign, target);
      } catch (err) {
        console.error('Target execution error:', err);
        try {
          await markTargetFailed(campaign, target, err.message || 'Execution failed');
        } catch (markErr) {
          console.error('Target failure update error:', markErr);
          await supabase
            .from('ai_campaign_targets')
            .update({
              status: 'failed',
              error_message: err.message || 'Execution failed',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', target.id);
        }
      }
    }
  }

  const progress = await computeCampaignProgress(campaign.id, campaign.tenant_id);
  await updateCampaignProgress(campaign, progress);

  await emitTenantWebhooks(webhookDb, campaign.tenant_id, 'aicampaign.progress', {
    id: campaign.id,
    status: progress.pending === 0 && progress.processing === 0 ? 'completed' : 'running',
    progress,
  }).catch((err) => logger.error({ err }, '[CampaignWorker] Webhook emission failed'));
}

/**
 * Claim pending targets for processing using row locks.
 */
async function claimPendingTargets(campaign, batchSize) {
  const { data: pendingTargets, error: pendingErr } = await supabase
    .from('ai_campaign_targets')
    .select('*')
    .eq('tenant_id', campaign.tenant_id)
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize);
  if (pendingErr) throw pendingErr;

  const claimed = [];
  const now = new Date().toISOString();
  for (const target of pendingTargets || []) {
    const { data: updatedRows, error: updateErr } = await supabase
      .from('ai_campaign_targets')
      .update({
        status: 'processing',
        started_at: now,
        attempt_count: Number(target.attempt_count || 0) + 1,
        last_attempt_at: now,
        updated_at: now,
      })
      .eq('id', target.id)
      .eq('tenant_id', campaign.tenant_id)
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .select('*');
    if (updateErr) throw updateErr;
    if (updatedRows && updatedRows.length > 0) {
      claimed.push(updatedRows[0]);
    }
  }

  return claimed;
}

/**
 * Dispatch a single campaign target via the campaign's linked workflow webhook.
 */
async function dispatchViaWorkflow(campaign, target) {
  if (!campaign.workflow_id) {
    throw new Error('No workflow configured');
  }

  const { data: workflow, error: workflowErr } = await supabase
    .from('workflow')
    .select('id, metadata')
    .eq('id', campaign.workflow_id)
    .eq('tenant_id', campaign.tenant_id)
    .maybeSingle();
  if (workflowErr) throw workflowErr;
  if (!workflow) {
    throw new Error(`Workflow ${campaign.workflow_id} not found for tenant`);
  }

  let webhookUrl = workflow?.metadata?.webhook_url;
  if (!webhookUrl) {
    throw new Error('No webhook URL configured');
  }
  // Resolve relative URLs — workflow saves path-only URLs like /api/workflows/:id/webhook
  if (webhookUrl.startsWith('/')) {
    const backendUrl =
      process.env.BACKEND_URL ||
      `http://localhost:${process.env.BACKEND_PORT || process.env.PORT || 3001}`;
    webhookUrl = `${backendUrl}${webhookUrl}`;
  }

  const targetPayload =
    typeof target.target_payload === 'string'
      ? safeParseJson(target.target_payload, {})
      : toObject(target.target_payload);

  const campaignMeta = typeof campaign.metadata === 'object' ? campaign.metadata : {};
  // Prefer the assigned_to from the target record (snapshotted at audience resolution),
  // then campaign-level assignment. Never use scheduled_by — that is the user who
  // started the campaign, not the record owner.
  const assignedTo =
    targetPayload.assigned_to ||
    campaign.assigned_to ||
    campaignMeta.assigned_to ||
    null;

  const payload = {
    event: 'campaign.dispatch',
    tenant_id: campaign.tenant_id,
    campaign_id: campaign.id,
    target_id: target.id,
    channel: campaign.campaign_type,
    destination: target.destination,
    assigned_to: assignedTo,
    contact: targetPayload,
    campaign: {
      name: campaign.name,
      type: campaign.campaign_type,
      assigned_to: assignedTo,
      metadata: campaign.metadata,
    },
    idempotency_key: `${campaign.id}-${target.id}`,
  };

  logger.debug({ target_id: target.id, webhookUrl }, '[CampaignWorker] Dispatching target');

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(14000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    logger.warn({ target_id: target.id, status: response.status }, '[CampaignWorker] Webhook failed');
    throw new Error(`Webhook returned ${response.status}: ${text}`);
  }

  logger.info({ target_id: target.id }, '[CampaignWorker] Webhook success');
}

/**
 * Load tenant-scoped delivery integration configuration.
 * @deprecated Superseded by dispatchViaWorkflow. Kept for reference.
 */
async function getDeliveryContext(campaign) {
  const meta = toObject(campaign.metadata);
  const type = campaign.campaign_type || meta.campaign_type || 'call';

  if (type === 'email') {
    const sendingProfileId = meta?.ai_email_config?.sending_profile_id;
    if (!sendingProfileId) {
      throw new Error('No sending profile configured for email campaign');
    }

    const { data: integration, error: integrationErr } = await supabase
      .from('tenant_integrations')
      .select('*')
      .eq('tenant_id', campaign.tenant_id)
      .eq('id', sendingProfileId)
      .eq('is_active', true)
      .maybeSingle();
    if (integrationErr) throw integrationErr;
    if (!integration) {
      throw new Error('Sending profile not found or inactive');
    }

    return {
      type: 'email',
      integrationType: integration.integration_type,
      credentials: integration.credentials || {},
      subject: meta?.ai_email_config?.subject || 'No Subject',
      bodyTemplate: meta?.ai_email_config?.body_template || '',
    };
  }

  if (type === 'call') {
    const callIntegrationId = meta?.ai_call_integration_id;
    if (!callIntegrationId) {
      throw new Error('No call integration configured');
    }

    const { data: integration, error: integrationErr } = await supabase
      .from('tenant_integrations')
      .select('*')
      .eq('tenant_id', campaign.tenant_id)
      .eq('id', callIntegrationId)
      .eq('is_active', true)
      .maybeSingle();
    if (integrationErr) throw integrationErr;
    if (!integration) {
      throw new Error('Call integration not found or inactive');
    }

    return {
      type: 'call',
      integrationType: integration.integration_type,
      credentials: integration.credentials || {},
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
async function deliverTarget(campaign, target, deliveryContext) {
  const destination = target.destination || null;
  if (!destination) {
    throw new Error('Target destination is missing');
  }

  const payload =
    typeof target.target_payload === 'string'
      ? safeParseJson(target.target_payload, {})
      : toObject(target.target_payload);
  const campaignMeta = toObject(campaign.metadata);

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
async function markTargetCompleted(campaign, target) {
  const { error: updateErr } = await supabase
    .from('ai_campaign_targets')
    .update({
      status: 'completed',
      error_message: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id)
    .eq('tenant_id', campaign.tenant_id)
    .eq('campaign_id', campaign.id);
  if (updateErr) throw updateErr;

  await insertCampaignEvent({
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
async function markTargetFailed(campaign, target, errorMessage) {
  const safeMessage = String(errorMessage || 'Unknown target failure').slice(0, 2000);
  const { error: updateErr } = await supabase
    .from('ai_campaign_targets')
    .update({
      status: 'failed',
      error_message: safeMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id)
    .eq('tenant_id', campaign.tenant_id)
    .eq('campaign_id', campaign.id);
  if (updateErr) throw updateErr;

  await insertCampaignEvent({
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
async function computeCampaignProgress(campaignId, tenantId) {
  const { data: rows, error } = await supabase
    .from('ai_campaign_targets')
    .select('status')
    .eq('campaign_id', campaignId)
    .eq('tenant_id', tenantId);
  if (error) throw error;

  const progress = { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of rows || []) {
    progress.total += 1;
    if (row.status === 'pending') progress.pending += 1;
    if (row.status === 'processing') progress.processing += 1;
    if (row.status === 'completed') progress.completed += 1;
    if (row.status === 'failed') progress.failed += 1;
  }
  return progress;
}

/**
 * Persist progress and mark campaign complete when work is drained.
 */
async function updateCampaignProgress(campaign, progress) {
  const shouldComplete = Number(progress.pending) === 0 && Number(progress.processing) === 0;
  const metadataObj = toObject(campaign.metadata);
  metadataObj.progress = progress;

  if (shouldComplete) {
    metadataObj.lifecycle = toObject(metadataObj.lifecycle);
    // Mark as 'failed' if every target failed and nothing completed
    const allFailed = Number(progress.failed || 0) > 0 && Number(progress.completed || 0) === 0;
    const finalStatus = allFailed ? 'failed' : 'completed';
    metadataObj.lifecycle[`${finalStatus}_at`] = new Date().toISOString();
    const { data: completedRows, error: completedErr } = await supabase
      .from('ai_campaign')
      .update({
        status: finalStatus,
        metadata: metadataObj,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .eq('tenant_id', campaign.tenant_id)
      .eq('status', 'running')
      .select('id');
    if (completedErr) throw completedErr;

    if (completedRows && completedRows.length > 0) {
      await insertCampaignEvent({
        tenant_id: campaign.tenant_id,
        campaign_id: campaign.id,
        contact_id: null,
        status: finalStatus,
        event_type: allFailed ? 'campaign_failed' : 'campaign_completed',
        attempt_no: 0,
        payload: { progress },
      });
      await emitTenantWebhooks(webhookDb, campaign.tenant_id, `aicampaign.${finalStatus}`, {
        id: campaign.id,
        status: finalStatus,
        progress,
      }).catch((err) => logger.error({ err }, '[CampaignWorker] Final webhook emission failed'));
    }
    return;
  }

  const { error: updateErr } = await supabase
    .from('ai_campaign')
    .update({
      metadata: metadataObj,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id)
    .eq('tenant_id', campaign.tenant_id);
  if (updateErr) throw updateErr;
}

/**
 * Insert campaign execution event row.
 */
async function insertCampaignEvent(event) {
  const { error } = await supabase.from('ai_campaign_events').insert({
    tenant_id: event.tenant_id,
    campaign_id: event.campaign_id,
    contact_id: event.contact_id || null,
    status: event.status || 'pending',
    event_type: event.event_type,
    attempt_no: Number(event.attempt_no || 0),
    payload: event.payload || {},
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
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

    callContext = await prepareOutboundCall(webhookDb, {
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

function safeParseJson(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toObject(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') return safeParseJson(value, {});
  return {};
}

function isScheduledDue(campaign) {
  const metadata = toObject(campaign.metadata);
  const scheduledAt = metadata?.schedule?.scheduled_at;
  if (!scheduledAt) return true;
  const scheduledTime = new Date(scheduledAt);
  if (Number.isNaN(scheduledTime.getTime())) return true;
  return scheduledTime.getTime() <= Date.now();
}
