// @ts-check
/**
 * Public (unauthenticated) DocuSeal endpoints
 *
 * GET /api/public/docuseal/sign/:slug/:token
 *   Looks up a docuseal_submissions row by id (`token`), validates that
 *   the row's tenant has the supplied `slug`, and returns the embed_src
 *   plus the tenant's branding so the white-label signing page can render.
 *
 * No auth middleware is applied to this route — recipients are not CRM
 * users. The `slug + token` pair is the authorization signal: a UUID
 * token is unguessable, and pairing it with the tenant slug means a
 * leaked URL is still bounded to one tenant.
 *
 * Returns 404 (not 401) on any mismatch so the route doesn't leak whether
 * a token exists for a different slug.
 */

import express from 'express';
import { getSupabaseAdmin } from '../lib/supabaseFactory.js';
import logger from '../lib/logger.js';

const router = express.Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_REGEX = /^[a-z0-9](-?[a-z0-9])+$/;

router.get('/sign/:slug/:token', async (req, res) => {
  const { slug, token } = req.params;

  // Cheap input shape check — fail fast with 404 (not 400) so probing
  // doesn't reveal what the route accepts.
  if (!slug || !SLUG_REGEX.test(slug) || slug.length > 64) {
    return res.status(404).json({ error: 'not_found' });
  }
  if (!token || !UUID_REGEX.test(token)) {
    return res.status(404).json({ error: 'not_found' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Single round-trip: pull the submission and the joined tenant in one
    // query via PostgREST nested select. Service-role bypasses RLS, which
    // is intentional — the slug+token is the only access control here.
    const { data: row, error } = await supabase
      .from('docuseal_submissions')
      .select(
        `id,
         tenant_id,
         status,
         template_name,
         recipient_name,
         recipient_email,
         metadata,
         signed_document_url,
         tenant:tenant_id (
           id,
           name,
           slug,
           branding_settings
         )`,
      )
      .eq('id', token)
      .maybeSingle();

    if (error) {
      logger.error('[PublicDocuseal] Lookup failed', error);
      return res.status(500).json({ error: 'lookup_failed' });
    }

    if (!row || !row.tenant) {
      return res.status(404).json({ error: 'not_found' });
    }

    // Slug check — the public access control. If the slug does not match,
    // return 404 (do NOT 403 — that would confirm the token exists).
    if (row.tenant.slug !== slug) {
      return res.status(404).json({ error: 'not_found' });
    }

    /** @type {import('../types/branding.types.ts').DocusealSubmissionMetadata} */
    const metadata = /** @type {any} */ (row.metadata) ?? {};
    /** @type {import('../types/branding.types.ts').TenantBranding} */
    const branding = /** @type {any} */ (row.tenant.branding_settings) ?? {};
    const embedSrc = metadata.embed_src || null;
    if (!embedSrc) {
      // Submission row exists and slug matches, but we never captured an
      // embed_src — typically because the submission was sent via the old
      // pre-4VD-7 flow (send_email: true, no embed token requested). Fall
      // back to the DocuSeal-hosted page so the link still works.
      return res.status(200).json({
        status: row.status,
        signed: row.status === 'completed',
        // Don't expose signed_document_url here unless we trust the recipient;
        // the embed_src absence indicates a legacy submission. Fall back to
        // a "please contact sender" prompt rather than leaking the URL.
        fallback: true,
        tenant: {
          name: row.tenant.name,
          logo_url: branding.logo_url || null,
          primary_color: branding.primary_color || null,
          accent_color: branding.accent_color || null,
        },
        template_name: row.template_name || 'Document',
        recipient_name: row.recipient_name || null,
      });
    }

    return res.status(200).json({
      status: row.status,
      signed: row.status === 'completed',
      fallback: false,
      embed_src: embedSrc,
      tenant: {
        name: row.tenant.name,
        logo_url: branding.logo_url || null,
        primary_color: branding.primary_color || null,
        accent_color: branding.accent_color || null,
      },
      template_name: row.template_name || 'Document',
      recipient_name: row.recipient_name || null,
      recipient_email: row.recipient_email,
    });
  } catch (err) {
    logger.error('[PublicDocuseal] Uncaught error', err);
    return res.status(500).json({ error: 'internal' });
  }
});

export default router;
