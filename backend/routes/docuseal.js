/**
 * DocuSeal CRM-side routes
 *
 * POST /api/docuseal/submissions          — create + send a signing request
 * GET  /api/docuseal/submissions          — list submissions for an entity
 *
 * All routes are tenant-scoped via validateTenantAccess middleware. The
 * tenant's DocuSeal API key + base URL are read from tenant_integrations
 * (integration_type='docuseal', is_active=true). If no row exists, returns
 * 400 "DocuSeal not configured".
 *
 * The webhook receiver lives at routes/docuseal-webhook.js and updates
 * docuseal_submissions.status as the signing lifecycle progresses.
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import logger from '../lib/logger.js';

const router = express.Router();

// All routes here require tenant context
router.use(validateTenantAccess);

// ---------------------------------------------------------------------------
// Helper: load tenant's DocuSeal config
// ---------------------------------------------------------------------------

async function loadDocusealConfig(supabase, tenantId) {
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('api_credentials, config, is_active')
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'docuseal')
    .maybeSingle();

  if (error) {
    logger.error('[Docuseal] Failed to load tenant integration', error);
    return { error: 'integration_lookup_failed' };
  }
  if (!data || !data.is_active) {
    return { error: 'docuseal_not_configured' };
  }
  const apiKey = data.api_credentials?.api_key;
  const baseUrl = data.config?.base_url;
  if (!apiKey || !baseUrl) {
    return { error: 'docuseal_not_configured' };
  }
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') };
}

// ---------------------------------------------------------------------------
// POST /api/docuseal/submissions — create + send
// ---------------------------------------------------------------------------

router.post('/submissions', async (req, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_context_missing' });
  }

  const {
    template_id,
    related_to,
    related_id,
    recipient_email,
    recipient_name,
    message,
  } = req.body || {};

  // Validation
  if (!template_id || !related_to || !related_id || !recipient_email) {
    return res.status(400).json({
      error: 'missing_fields',
      required: ['template_id', 'related_to', 'related_id', 'recipient_email'],
    });
  }
  if (!['contact', 'lead', 'account', 'opportunity'].includes(related_to)) {
    return res.status(400).json({ error: 'invalid_related_to' });
  }

  const supabase = getSupabaseClient();

  // Load DocuSeal config
  const cfg = await loadDocusealConfig(supabase, tenantId);
  if (cfg.error) {
    return res.status(400).json({
      error: cfg.error,
      message:
        cfg.error === 'docuseal_not_configured'
          ? 'DocuSeal not configured for this tenant. Add the integration in Settings → Integrations.'
          : 'Failed to load DocuSeal integration.',
    });
  }

  // Call DocuSeal — POST /api/submissions
  // DocuSeal API expects { template_id, send_email, submitters: [{ email, name, role? }] }
  let docusealResponse;
  try {
    const fetchRes = await fetch(`${cfg.baseUrl}/api/submissions`, {
      method: 'POST',
      headers: {
        'X-Auth-Token': cfg.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        template_id,
        send_email: true,
        message: message || undefined,
        submitters: [
          {
            email: recipient_email,
            name: recipient_name || undefined,
          },
        ],
      }),
    });

    if (!fetchRes.ok) {
      const errBody = await fetchRes.text();
      logger.warn('[Docuseal] Send failed', { status: fetchRes.status, body: errBody });
      return res.status(fetchRes.status >= 500 ? 503 : 400).json({
        error: 'docuseal_send_failed',
        status: fetchRes.status,
        body: errBody.slice(0, 500),
      });
    }

    docusealResponse = await fetchRes.json();
  } catch (err) {
    logger.error('[Docuseal] Network error sending submission', err);
    return res.status(503).json({ error: 'docuseal_unreachable', message: err.message });
  }

  // DocuSeal returns either a single submission object or an array. Normalize.
  const submissionPayload = Array.isArray(docusealResponse)
    ? docusealResponse[0]
    : docusealResponse;
  const docusealSubmissionId = String(
    submissionPayload?.id || submissionPayload?.submission_id || ''
  );
  if (!docusealSubmissionId) {
    logger.error('[Docuseal] Missing submission id in DocuSeal response', docusealResponse);
    return res.status(502).json({ error: 'docuseal_response_invalid' });
  }
  const templateName =
    submissionPayload?.template?.name ||
    submissionPayload?.template_name ||
    null;

  // Insert tracking row
  const { data: inserted, error: insertError } = await supabase
    .from('docuseal_submissions')
    .insert({
      tenant_id: tenantId,
      docuseal_submission_id: docusealSubmissionId,
      docuseal_template_id: String(template_id),
      template_name: templateName,
      related_to,
      related_id,
      recipient_name: recipient_name || null,
      recipient_email,
      status: 'sent',
      sent_at: new Date().toISOString(),
      created_by: req.user?.id || null,
      metadata: { send_message: message || null },
    })
    .select()
    .single();

  if (insertError) {
    logger.error('[Docuseal] Failed to insert submission row', insertError);
    return res.status(500).json({
      error: 'tracking_insert_failed',
      message: insertError.message,
      docuseal_submission_id: docusealSubmissionId,
    });
  }

  // Log activity (sent)
  try {
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      related_to,
      related_id,
      type: 'document_sent',
      subject: `Document sent — ${templateName || 'unnamed template'}`,
      body: `Sent to ${recipient_email}.`,
      status: 'completed',
      metadata: {
        docuseal_submission_id: docusealSubmissionId,
        docuseal_template_id: String(template_id),
      },
    });
  } catch (activityErr) {
    logger.warn('[Docuseal] Activity insert failed', { error: activityErr.message });
  }

  return res.status(201).json(inserted);
});

// ---------------------------------------------------------------------------
// GET /api/docuseal/submissions?related_to=&related_id=
// ---------------------------------------------------------------------------

router.get('/submissions', async (req, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_context_missing' });
  }

  const { related_to, related_id } = req.query;
  if (!related_to || !related_id) {
    return res
      .status(400)
      .json({ error: 'missing_query', required: ['related_to', 'related_id'] });
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('docuseal_submissions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('related_to', related_to)
    .eq('related_id', related_id)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[Docuseal] List submissions failed', error);
    return res.status(500).json({ error: 'list_failed', message: error.message });
  }

  return res.json(data || []);
});

export default router;
