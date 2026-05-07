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
import { computeDocumentDueFields } from '../lib/docusealActivityDueAt.js';
import { resolveRelatedEntityFields } from '../lib/resolveRelatedEntityFields.js';
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
//
// 4VD-15: `externalId` is the CRM tenant_id. Stamping it on every submission
// lets the webhook handler validate that inbound events match the tenant
// they were created against, and lets us filter `GET /api/submissions` by
// tenant in CRM proxy without per-tenant DocuSeal users.
export function buildDocusealSubmissionPayload({
  template_id,
  recipient_email,
  recipient_name,
  externalId,
}) {
  return {
    template_id,
    send_email: false,
    ...(externalId ? { external_id: String(externalId) } : {}),
    submitters: [
      {
        email: recipient_email,
        ...(recipient_name ? { name: recipient_name } : {}),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helper: load DocuSeal config
// ---------------------------------------------------------------------------
//
// 4VD-15 architecture: DocuSeal is a SHARED install across all CRM tenants.
// DocuSeal Community only allows ONE API key (the per-user X-Auth-Token),
// so we use that as the platform-level key and isolate tenants at the
// application layer via the `external_id` field on templates and submissions.
//
// Required env (Doppler-injected):
//   DOCUSEAL_PLATFORM_API_KEY   — the X-Auth-Token from DocuSeal admin
//   DOCUSEAL_PLATFORM_BASE_URL  — e.g. https://docuseal.aishacrm.com
//
// Both must be set; if either is missing the route returns 400 so the
// operator notices immediately. The function `supabase` and `tenantId`
// arguments are kept on the signature for now in case a future feature
// (e.g., per-tenant DocuSeal accounts on Pro) wants to override at the
// tenant level — today they're unused.
//
// Exported for unit tests.
// eslint-disable-next-line no-unused-vars
export async function loadDocusealConfig(supabase, tenantId) {
  const platformKey = process.env.DOCUSEAL_PLATFORM_API_KEY;
  const platformBaseUrl = process.env.DOCUSEAL_PLATFORM_BASE_URL;
  if (!platformKey || !platformBaseUrl) {
    return { error: 'docuseal_platform_not_configured' };
  }
  return {
    apiKey: platformKey,
    baseUrl: platformBaseUrl.replace(/\/$/, ''),
  };
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
    // 4VD-33: frontend may supply "Follow up by" as wall-clock fields. The
    // activities table stores `due_date date` + `due_time time` (matching the
    // existing convention used by calcom-webhook). No timezone math here —
    // datetime-local input is wall-clock by definition.
    due_date: dueDateOverride,
    due_time: dueTimeOverride,
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
    externalId: tenantId, // 4VD-15: stamp tenant_id for cross-tenant isolation
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

  // 4VD-34: DocuSeal Community's POST /api/submissions response does NOT
  // include the template name (only template_id, slug, embed_src, etc.).
  // Resolve via the per-tenant templates cache populated by GET /templates —
  // the user just used the dropdown, so the cache is almost always warm and
  // this is a free lookup. Falls through to one upstream fetch on cold-cache,
  // returns null on error (graceful — submission still succeeds).
  // Optimistic read of submission response first in case future DocuSeal
  // versions start including the name; fall back to the cache resolver.
  const templateNameFromResponse =
    submissionPayload?.template?.name || submissionPayload?.template_name || null;
  const templateName =
    templateNameFromResponse ||
    (await resolveTemplateNameForTenant({
      tenantId,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      templateId: template_id,
    }));

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

  // 4VD-33: log a single status-tracking activity row for this submission.
  //   - status starts at 'pending' (NOT 'completed') so the row reflects
  //     "waiting on signature, follow up by `due_at`"
  //   - due_at defaults to next day 5pm in the tenant's timezone; the
  //     frontend can override via the request body (SendDocumentDialog's
  //     "Follow up by" picker)
  //   - subsequent webhook events (viewed/signed/completed/declined/expired)
  //     UPDATE this same row instead of inserting more rows; the docuseal
  //     submission_id in metadata is the join key
  // Validate the override (if any). Frontend sends YYYY-MM-DD + HH:MM[:SS];
  // anything malformed falls through to the computed default rather than
  // poisoning the row with garbage.
  const isValidDate = typeof dueDateOverride === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDateOverride);
  const isValidTime =
    typeof dueTimeOverride === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(dueTimeOverride);

  let dueDate = isValidDate ? dueDateOverride : null;
  let dueTime = isValidTime
    ? dueTimeOverride.length === 5
      ? `${dueTimeOverride}:00`
      : dueTimeOverride
    : null;

  if (!dueDate || !dueTime) {
    try {
      const defaults = await computeDocumentDueFields(supabase, tenantId);
      if (!dueDate) dueDate = defaults.due_date;
      if (!dueTime) dueTime = defaults.due_time;
    } catch (err) {
      logger.warn('[Docuseal] computeDocumentDueFields failed; row inserts without due fields', {
        tenantId,
        error: err.message,
      });
      // best-effort: leave nulls so the row still inserts
    }
  }

  // 4VD-39: resolve related entity's display name + email so the activity
  // timeline renders "[Lead Name]" as the hyperlink instead of "View Lead".
  // Activities.jsx reads activity.related_name and falls back to "View {entity}"
  // when null. Helper degrades gracefully (null) on lookup failure.
  const { related_name, related_email } = await resolveRelatedEntityFields(
    supabase,
    tenantId,
    related_to,
    related_id,
  );

  // 4VD-33 follow-up (PR review P1): UPDATE-OR-INSERT instead of unconditional
  // INSERT. Symmetric with the webhook's createActivity. If a webhook (e.g.,
  // form.viewed) beats this code to creating the row via its fallback INSERT
  // path, our INSERT here would produce a SECOND row for the same submission —
  // exactly the duplicate-row bug 4VD-33 is supposed to eliminate. By doing
  // an upsert keyed on metadata->>docuseal_submission_id, whichever path
  // arrives first wins the INSERT and the other does an UPDATE that merges
  // its initial-send fields (signing_url, sent_at, due_date, etc.) into the
  // existing row WITHOUT clobbering any lifecycle progress already made.
  const sendInitialMetadata = {
    docuseal_submission_id: docusealSubmissionId,
    docuseal_template_id: String(template_id),
    signing_url: signingUrl,
    email_sent: emailResult.ok,
    email_reason: emailResult.ok ? null : emailResult.reason,
    sent_at: new Date().toISOString(),
    // Pre-create webhook lifecycle slots so the UPDATE path has somewhere
    // to land its values; webhooks fill these in.
    viewed_at: null,
    signed_at: null,
    completed_at: null,
    declined_at: null,
  };
  const sendInitialSubject = `Document sent — ${templateName || 'unnamed template'}`;
  const sendInitialBody = emailResult.ok
    ? `Sent to ${recipient_email} (branded email delivered).`
    : `Sent to ${recipient_email}. Signing link: ${signingUrl || '(unavailable)'}`;

  try {
    const { data: existingRows } = await supabase
      .from('activities')
      .select('id, status, metadata')
      .eq('tenant_id', tenantId)
      .filter('metadata->>docuseal_submission_id', 'eq', docusealSubmissionId)
      .limit(1);

    if (existingRows && existingRows.length > 0) {
      // Webhook beat us. Merge our send-side metadata WITHOUT clobbering
      // anything the webhook already stamped (viewed_at / signed_at / etc.).
      // Status: don't downgrade — if the webhook already moved the row to
      // completed/cancelled, leave it; only set to 'pending' from null/undefined.
      const row = existingRows[0];
      const mergedMetadata = {
        ...sendInitialMetadata,
        ...(row.metadata || {}),
        // The send-side fields that are unconditionally authoritative for
        // any newly-created row by the webhook fallback: it didn't have
        // these, so we provide them.
        signing_url: signingUrl,
        email_sent: emailResult.ok,
        email_reason: emailResult.ok ? null : emailResult.reason,
        sent_at: (row.metadata && row.metadata.sent_at) || sendInitialMetadata.sent_at,
      };
      const update = {
        // Only set initial subject/body if the row is still pending (no lifecycle
        // event has rewritten them yet). Otherwise leave the webhook's update.
        ...(row.status && row.status !== 'pending' ? {} : {
          subject: sendInitialSubject,
          body: sendInitialBody,
        }),
        ...(row.status ? {} : { status: 'pending' }),
        ...(related_name ? { related_name } : {}),
        ...(related_email ? { related_email } : {}),
        ...(dueDate ? { due_date: dueDate } : {}),
        ...(dueTime ? { due_time: dueTime } : {}),
        metadata: mergedMetadata,
      };
      await supabase.from('activities').update(update).eq('id', row.id);
    } else {
      await supabase.from('activities').insert({
        tenant_id: tenantId,
        related_to,
        related_id,
        ...(related_name ? { related_name } : {}),
        ...(related_email ? { related_email } : {}),
        type: 'document_sent',
        subject: sendInitialSubject,
        body: sendInitialBody,
        status: 'pending',
        ...(dueDate ? { due_date: dueDate } : {}),
        ...(dueTime ? { due_time: dueTime } : {}),
        metadata: sendInitialMetadata,
      });
    }
  } catch (activityErr) {
    logger.warn('[Docuseal] Activity upsert failed', { error: activityErr.message });
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

// ---------------------------------------------------------------------------
// GET /api/docuseal/templates — list non-archived templates for a tenant
// ---------------------------------------------------------------------------
//
// Tenant isolation model:
//
//   - validateTenantAccess middleware sets req.tenant.id from auth context
//   - loadDocusealConfig looks up the integration row for THAT tenant_id only
//   - the X-Auth-Token header sent to DocuSeal is the per-tenant API key
//     stored on tenant_integrations.api_credentials.api_key
//   - DocuSeal Community filters templates by the user that owns the API key,
//     so the returned list never contains another DocuSeal user's templates
//
// The cache below is keyed by tenant_id ONLY. Cross-tenant leakage would
// require a bug here — the unit tests in docuseal-templates.test.js pin
// the isolation invariant ("tenant A's cached list is never returned for
// tenant B") so a future "share the cache across tenants for performance"
// PR can't silently regress it. If you ever need a shared cache layer
// (e.g., Redis), the key MUST include tenant_id.

const TEMPLATES_CACHE_TTL_MS = 60 * 1000; // 60s — DocuSeal templates change rarely; tighten if stale views become a complaint
const templatesCache = new Map(); // tenantId -> { data, expiresAt }

/** Test seam: clear the per-tenant templates cache. */
export function _clearTemplatesCacheForTest() {
  templatesCache.clear();
}

/**
 * Normalise a DocuSeal template record to the shape the dropdown needs.
 * Exported so tests can pin the contract independent of fetch behaviour.
 */
export function normalizeDocusealTemplate(t) {
  if (!t || typeof t !== 'object') return null;
  const id = t.id ?? t.template_id ?? null;
  if (id == null) return null;
  return {
    id: String(id),
    name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : `Template ${id}`,
    slug: typeof t.slug === 'string' ? t.slug : null,
    archived_at: t.archived_at || null,
    created_at: t.created_at || null,
    updated_at: t.updated_at || null,
  };
}

/**
 * Call DocuSeal `GET /api/templates` with the platform API key. Returns the
 * normalised list (non-archived, sorted by name) or throws on transport /
 * upstream error. Pure with respect to the in-process cache — caller wraps
 * with caching.
 *
 * 4VD-15: when `externalId` is provided, the upstream call appends
 * `&external_id=<id>` so DocuSeal returns only templates tagged with that
 * CRM tenant_id. This is the primary tenant isolation enforcement point.
 * Verified via DocuSeal source: `app/controllers/api/templates_controller.rb:95`
 *   templates = templates.where(external_id: params[:external_id]) if params[:external_id].present?
 * Live probe 2026-05-06: filter returns 1 for matching tag, 0 for unknown tag.
 *
 * `fetchImpl` is injectable for tests.
 */
/**
 * 4VD-34: Resolve a template name for a tenant by template_id, using the
 * per-tenant cache as the primary source. DocuSeal Community's
 * `POST /api/submissions` response does NOT include the template name, so we
 * have to look it up separately. The cache populated by `GET /api/docuseal/templates`
 * (the dropdown that the user just selected from) is almost always warm —
 * meaning this is a free O(1) lookup on the hot send path. Cold-cache or
 * cache-miss paths fall through to one upstream `GET /api/templates` round-trip,
 * gracefully returning null on error so the send still succeeds (template_name
 * stays null in the row, same as the legacy behaviour).
 *
 * Tenant isolation: `fetchDocusealTemplates` always passes `externalId: tenantId`,
 * so a template_id from another tenant simply won't be in the result and this
 * returns null. That's a defense-in-depth layer beyond the upstream-side
 * external_id filter — Option C surfaces cross-tenant leaks naturally.
 *
 * @param {object} args
 * @param {string} args.tenantId
 * @param {string} args.apiKey - DocuSeal API key (from loadDocusealConfig)
 * @param {string} args.baseUrl - DocuSeal base URL (from loadDocusealConfig)
 * @param {string|number} args.templateId
 * @param {Function} [args.fetchImpl] - injectable for tests
 * @returns {Promise<string|null>}
 */
export async function resolveTemplateNameForTenant({
  tenantId,
  apiKey,
  baseUrl,
  templateId,
  fetchImpl = fetch,
}) {
  if (!tenantId || templateId == null) return null;
  const want = String(templateId);

  // Hot path: cache is warm (the user just opened the dropdown), look up O(1).
  const cached = templatesCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    const hit = cached.data.find((t) => t.id === want);
    if (hit) return hit.name;
    // Cache hit but template not in list — could mean the user picked a
    // template added after the dropdown loaded, OR a template_id was somehow
    // injected from outside this tenant's scope. Fall through to a fresh
    // fetch to disambiguate; if it's still missing, return null.
  }

  // Cold path: fetch + populate the same cache the dropdown uses.
  let templates;
  try {
    templates = await fetchDocusealTemplates({
      apiKey,
      baseUrl,
      externalId: tenantId,
      fetchImpl,
    });
  } catch (err) {
    // Graceful degrade — submission still succeeds, just template_name=null.
    // Better than blocking a legitimate send because the templates fetch hiccups.
    logger.warn('[Docuseal] resolveTemplateNameForTenant fetch failed', {
      tenantId,
      templateId: want,
      status: err.status,
      message: err.message,
    });
    return null;
  }
  templatesCache.set(tenantId, {
    data: templates,
    expiresAt: Date.now() + TEMPLATES_CACHE_TTL_MS,
  });
  const hit = templates.find((t) => t.id === want);
  return hit ? hit.name : null;
}

export async function fetchDocusealTemplates({ apiKey, baseUrl, externalId, fetchImpl = fetch }) {
  const params = new URLSearchParams({ limit: '200' });
  if (externalId) {
    params.set('external_id', String(externalId));
  }
  const url = `${baseUrl}/api/templates?${params.toString()}`;
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: {
      'X-Auth-Token': apiKey,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    const err = new Error(`docuseal_templates_failed: ${res.status}`);
    err.status = res.status;
    err.body = errBody.slice(0, 500);
    throw err;
  }
  const json = await res.json();
  // DocuSeal returns either a bare array or { data: [...] } depending on version
  const raw = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
  return raw
    .map(normalizeDocusealTemplate)
    .filter((t) => t && !t.archived_at)
    .sort((a, b) => a.name.localeCompare(b.name));
}

router.get('/templates', async (req, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) {
    return res.status(400).json({ error: 'tenant_context_missing' });
  }

  const refresh = String(req.query.refresh || '') === '1';

  // Cache hit (per-tenant). Cache key is tenant_id ONLY — never leaks across
  // tenants. The integration tests pin this invariant.
  if (!refresh) {
    const cached = templatesCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ data: cached.data, cached: true });
    }
  }

  const supabase = getSupabaseClient();
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

  let templates;
  try {
    // 4VD-15: external_id == tenantId is THE tenant isolation boundary.
    // The platform key has access to ALL tenants' templates upstream; this
    // filter is what makes the response tenant-scoped.
    templates = await fetchDocusealTemplates({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      externalId: tenantId,
    });
  } catch (err) {
    logger.warn('[Docuseal] Templates fetch failed', {
      tenantId,
      status: err.status,
      message: err.message,
    });
    if (err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({
        error: 'docuseal_templates_failed',
        status: err.status,
        body: err.body || null,
      });
    }
    return res.status(503).json({ error: 'docuseal_unreachable', message: err.message });
  }

  templatesCache.set(tenantId, { data: templates, expiresAt: Date.now() + TEMPLATES_CACHE_TTL_MS });
  return res.json({ data: templates, cached: false });
});

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
