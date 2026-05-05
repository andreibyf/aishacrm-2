// @ts-check
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
import { sendTenantEmail } from '../lib/sendTenantEmail.js';
import { buildDocusealSignRequestEmail } from '../lib/docusealSignRequestEmail.js';
import logger from '../lib/logger.js';

const router = express.Router();

// All routes here require tenant context
router.use(validateTenantAccess);

// ---------------------------------------------------------------------------
// Helper: rewrite DocuSeal's embed_src to the configured tenant base_url
// ---------------------------------------------------------------------------
// DocuSeal generates `embed_src` URLs against its own configured `HOST` env.
// Today that's the sslip URL the container was deployed with — meaning the
// CRM stores http://docuseal-vv17a...sslip.io/s/<token> on submission rows
// and the white-label SignPage tries to render an iframe pointed there.
// Browsers block HTTP iframes embedded in HTTPS pages (mixed content), and
// the sslip URL isn't reliably resolvable from end-user networks.
//
// Until 4VD-14 lands a Coolify env change to set DocuSeal's HOST to
// `docuseal.aishacrm.com`, this helper rewrites the host to the tunnel URL
// that's configured on the tenant's docuseal integration. The Cloudflare
// tunnel routes both hosts to the same DocuSeal container, so the `/s/<token>`
// path resolves identically — only the URL the iframe loads changes.
//
// Exported for the unit test in __tests__/lib/docuseal-embed-src-rewrite.test.js.
export function rewriteEmbedSrcToBaseUrl(embedSrc, baseUrl) {
  if (!embedSrc || !baseUrl) return embedSrc;
  try {
    const src = new URL(embedSrc);
    const tunnel = new URL(baseUrl);
    src.protocol = tunnel.protocol;
    src.host = tunnel.host;
    return src.toString();
  } catch {
    // If either URL is malformed, return the original — fall back to whatever
    // DocuSeal gave us rather than corrupting the link.
    return embedSrc;
  }
}

// ---------------------------------------------------------------------------
// Helper: build the DocuSeal POST /api/submissions request body
// ---------------------------------------------------------------------------
// Pure function so the wire format is unit-testable without HTTP. DocuSeal's
// `message` field expects an Object ({subject, body}) and is only honored
// when DocuSeal sends the email itself; with send_email=false it has no
// effect, and forwarding a string crashes DocuSeal with HTTP 422
// "message must be a Object". The user-typed message belongs to OUR branded
// email, not DocuSeal's — so this helper deliberately has no message field.
//
// Exported for the unit test in __tests__/routes/docuseal-submission-payload.test.js.
export function buildDocusealSubmissionPayload({ template_id, recipient_email, recipient_name }) {
  return {
    template_id,
    send_email: false,
    submitters: [
      {
        email: recipient_email,
        ...(recipient_name ? { name: recipient_name } : {}),
      },
    ],
  };
}

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

  const { template_id, related_to, related_id, recipient_email, recipient_name, message } =
    req.body || {};

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
  //
  // 4VD-7 white-label change: send_email is now FALSE so DocuSeal does not
  // send its own branded email. The CRM owns the recipient experience —
  // we send a tenant-branded email below (with graceful fallback if no
  // tenant SMTP provider is configured). The DocuSeal response includes
  // a per-submitter `embed_src` URL we store on the submission row; the
  // public /sign/<slug>/<token> page uses it to render the embedded form.
  //
  // NOTE: DocuSeal's `message` field expects an Object ({subject, body}),
  // and is only used when DocuSeal itself sends the email. With
  // send_email=false it has no effect. The user-typed message from the
  // dialog flows into our branded email via buildDocusealSignRequestEmail
  // below — sending it to DocuSeal here would either be a no-op (correct
  // shape) or a 422 (string shape). Don't forward it.
  const docusealRequestBody = buildDocusealSubmissionPayload({
    template_id,
    recipient_email,
    recipient_name,
  });
  let docusealResponse;
  try {
    const fetchRes = await fetch(`${cfg.baseUrl}/api/submissions`, {
      method: 'POST',
      headers: {
        'X-Auth-Token': cfg.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(docusealRequestBody),
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
  // The response is shaped per-submitter: each entry has its own `embed_src`
  // (the URL DocuSeal's `<docuseal-form>` web component is configured with).
  // Single-recipient flow uses index 0.
  const submitters = Array.isArray(docusealResponse) ? docusealResponse : [docusealResponse];
  const submissionPayload = submitters[0];
  const docusealSubmissionId = String(
    submissionPayload?.submission_id || submissionPayload?.id || '',
  );
  if (!docusealSubmissionId) {
    logger.error('[Docuseal] Missing submission id in DocuSeal response', docusealResponse);
    return res.status(502).json({ error: 'docuseal_response_invalid' });
  }
  // Rewrite embed_src to use the tenant's configured base_url instead of
  // whatever DocuSeal's HOST env was when the container was deployed.
  // See rewriteEmbedSrcToBaseUrl docs above.
  const rawEmbedSrc = submissionPayload?.embed_src || null;
  const embedSrc = rewriteEmbedSrcToBaseUrl(rawEmbedSrc, cfg.baseUrl);
  const templateName =
    submissionPayload?.template?.name || submissionPayload?.template_name || null;

  // Insert tracking row — store embed_src on metadata for the public route
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
      metadata: {
        send_message: message || null,
        embed_src: embedSrc,
      },
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

  // Build the white-label signing URL. FRONTEND_URL is the canonical base
  // (set per-environment in Doppler). Falls back to localhost for dev safety.
  const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:4000').replace(/\/$/, '');

  // Look up tenant slug + branding for the email + URL.
  // NOTE: `tenant` has only `name`, `slug`, and `branding_settings` (jsonb).
  // logo_url / primary_color / accent_color are NOT top-level columns —
  // they live inside `branding_settings`. Selecting them as columns triggers
  // PostgREST 400 ("column tenant.logo_url does not exist"), and supabase-js
  // .maybeSingle() swallows that error into `data: null`, which manifests
  // downstream as "Tenant has no slug — signing URL not constructable" even
  // though slug is populated. Read branding fields off branding_settings only.
  const { data: tenantRow, error: tenantLookupError } = await supabase
    .from('tenant')
    .select('name, slug, branding_settings')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantLookupError) {
    logger.error('[Docuseal] Tenant lookup failed', tenantLookupError);
  }

  let signingUrl = null;
  /** @type {{ ok: boolean, reason: string }} */
  let emailResult = { ok: false, reason: 'not_attempted' };
  if (tenantRow?.slug) {
    signingUrl = `${frontendBase}/sign/${tenantRow.slug}/${inserted.id}`;
    /** @type {import('../types/branding.types.ts').TenantBranding} */
    const branding = /** @type {any} */ (tenantRow.branding_settings) ?? {};
    const {
      subject: emailSubject,
      html,
      text,
    } = buildDocusealSignRequestEmail({
      tenantName: tenantRow.name,
      tenantLogoUrl: branding.logo_url || null,
      primaryColor: branding.primary_color || null,
      recipientName: recipient_name || null,
      templateName: templateName || 'Document',
      message: message || null,
      signingUrl,
    });
    const sendResult = await sendTenantEmail({
      tenantId,
      to: recipient_email,
      recipientName: recipient_name,
      subject: emailSubject,
      html,
      text,
    });
    emailResult = {
      ok: !!sendResult.ok,
      reason: sendResult.reason || (sendResult.ok ? 'sent' : 'unknown'),
    };
    if (!emailResult.ok) {
      logger.warn('[Docuseal] Branded email send skipped/failed', {
        tenantId,
        submissionId: inserted.id,
        reason: emailResult.reason,
      });
    }
  } else {
    logger.warn('[Docuseal] Tenant has no slug — signing URL not constructable', { tenantId });
  }

  // Log activity (sent)
  try {
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      related_to,
      related_id,
      type: 'document_sent',
      subject: `Document sent — ${templateName || 'unnamed template'}`,
      body: emailResult.ok
        ? `Sent to ${recipient_email} (branded email delivered).`
        : `Sent to ${recipient_email}. Signing link: ${signingUrl || '(unavailable)'}`,
      status: 'completed',
      metadata: {
        docuseal_submission_id: docusealSubmissionId,
        docuseal_template_id: String(template_id),
        signing_url: signingUrl,
        email_sent: emailResult.ok,
        email_reason: emailResult.ok ? null : emailResult.reason,
      },
    });
  } catch (activityErr) {
    logger.warn('[Docuseal] Activity insert failed', { error: activityErr.message });
  }

  return res.status(201).json({
    ...inserted,
    signing_url: signingUrl,
    email_sent: emailResult.ok,
    email_reason: emailResult.ok ? null : emailResult.reason,
  });
});

// ---------------------------------------------------------------------------
// GET /api/docuseal/submissions?related_to=&related_id=
// ---------------------------------------------------------------------------

/**
 * Resolve a Supabase Storage path to a viewable URL. Mirrors the pattern in
 * routes/storage.js: prefer the bucket's public URL, fall back to a 7-day
 * signed URL if the bucket is configured private. Returns null on failure.
 *
 * Exported so tests can stub the storage client.
 */
export async function resolveSupabaseStorageUrl(supabase, bucket, path) {
  if (!path) return null;
  try {
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    if (pub?.publicUrl) return pub.publicUrl;
    const { data: signed, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (error) {
      logger.warn('[Docuseal] Storage signed-url generation failed', {
        path,
        bucket,
        error: error.message,
      });
      return null;
    }
    return signed?.signedUrl || null;
  } catch (e) {
    logger.warn('[Docuseal] resolveSupabaseStorageUrl threw', { path, error: e.message });
    return null;
  }
}

/**
 * Enrich a submissions list with `mirror_url` — the resolved Supabase
 * Storage URL of the signed PDF, when supabase_storage_path is set. Frontend
 * prefers `mirror_url` over the DocuSeal-hosted `signed_document_url` for
 * durability: the mirror survives a DocuSeal volume loss; the DocuSeal URL
 * does not. Exported so other endpoints can reuse the same enrichment.
 */
export async function enrichSubmissionsWithMirrorUrl(
  supabase,
  submissions,
  { bucket = 'tenant-assets' } = {},
) {
  if (!Array.isArray(submissions) || submissions.length === 0) return submissions || [];
  return Promise.all(
    submissions.map(async (s) => {
      if (!s?.supabase_storage_path) return s;
      const mirror_url = await resolveSupabaseStorageUrl(supabase, bucket, s.supabase_storage_path);
      return mirror_url ? { ...s, mirror_url } : s;
    }),
  );
}

router.get('/submissions', async (req, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_context_missing' });
  }

  const { related_to, related_id } = req.query;
  if (!related_to || !related_id) {
    return res.status(400).json({ error: 'missing_query', required: ['related_to', 'related_id'] });
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

  const enriched = await enrichSubmissionsWithMirrorUrl(supabase, data || []);
  return res.json(enriched);
});

export default router;
