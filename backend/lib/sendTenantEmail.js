/**
 * sendTenantEmail.js
 *
 * Thin wrapper for one-off transactional emails sent on behalf of a tenant.
 *
 * The existing `resolveCommunicationsProviderConnection` helper requires a
 * mailboxId or mailboxAddress because it's designed for inbox-style flows
 * (paired imap+smtp with replies threading into a specific mailbox).
 * Transactional sends (in-house signing-request emails, invitations, etc.)
 * don't need that pairing — any active outbound-capable provider on the
 * tenant will do.
 *
 * Two integration types are accepted, in this precedence order:
 *   1. `gmail_smtp` — organization-wide Gmail/Google Workspace app-password
 *      SMTP. Simpler shape (smtp_user + smtp_password), no IMAP. Preferred
 *      for transactional sends because it doesn't depend on inbox pairing.
 *   2. `communications_provider` — paired IMAP+SMTP via the inbox flow.
 *      Used for the Inbox feature; works here too if no gmail_smtp row
 *      exists. Requires the existing communicationsConfig pipeline.
 *
 * Returns:
 *   { ok: true, info }                — message handed to SMTP successfully
 *   { ok: false, reason: 'no_provider' }  — tenant has no active outbound provider
 *   { ok: false, reason: 'send_failed', error } — provider rejected the message
 *
 * Caller is responsible for fallback behaviour (e.g., return the URL to the
 * UI for manual copy/paste).
 */

import nodemailer from 'nodemailer';
import { getSupabaseClient } from './supabase-db.js';
import {
  buildCommunicationsProviderConnection,
  isCommunicationsProviderIntegration,
} from './communicationsConfig.js';
import { loadImapSmtpAdapter } from './communications/adapters/imapSmtpAdapter.js';
import logger from './logger.js';

// Gmail Workspace SMTP. Per the 2026-04 staging-SMTP runbook entry in
// CHANGELOG.md, port 465 SSL is the only reliable path on Supabase too —
// 587 STARTTLS hangs intermittently. Reuse here.
const GMAIL_SMTP_HOST = 'smtp.gmail.com';
const GMAIL_SMTP_PORT = 465;
const GMAIL_SMTP_SECURE = true;

// Allow tests to inject a fake transport factory.
let gmailTransportFactory = (cfg) => nodemailer.createTransport(cfg);
export function _setGmailTransportFactoryForTest(fn) {
  gmailTransportFactory = fn;
}
export function _resetGmailTransportFactory() {
  gmailTransportFactory = (cfg) => nodemailer.createTransport(cfg);
}

// Allow tests to inject a fake supabase client. ESM bindings are immutable
// so monkey-patching the import doesn't work; this hook is the testable
// seam. Production code never calls these.
let supabaseClientOverride = null;
export function _setSupabaseClientForTest(client) {
  supabaseClientOverride = client;
}
export function _resetSupabaseClientOverride() {
  supabaseClientOverride = null;
}

/**
 * Build a nodemailer transport from a `gmail_smtp` integration row.
 * Strips literal whitespace from the app password — Google's UI shows
 * app passwords as "abcd efgh ijkl mnop" for readability but the actual
 * value is the 16 chars concatenated (the staging SMTP setup hit this).
 */
function buildGmailTransport(integrationRow) {
  const creds = integrationRow.api_credentials || {};
  const user = creds.smtp_user;
  const passRaw = creds.smtp_password;
  if (!user || !passRaw) {
    return { error: 'gmail_smtp_missing_credentials' };
  }
  const pass = String(passRaw).replace(/\s+/g, '');
  const transport = gmailTransportFactory({
    host: GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_PORT,
    secure: GMAIL_SMTP_SECURE,
    auth: { user, pass },
  });
  const fromAddress = integrationRow.config?.from_address || user;
  return { transport, fromAddress, user };
}

function normalizeIntegrationRecord(record = {}) {
  return {
    ...record,
    config: record.config || record.configuration || {},
    api_credentials: record.api_credentials || record.credentials || {},
  };
}

/**
 * Send a transactional email from a tenant's first active outbound-capable
 * communications provider.
 *
 * @param {object} params
 * @param {string} params.tenantId         — tenant UUID
 * @param {string} params.to               — recipient email
 * @param {string} params.subject
 * @param {string} [params.html]           — HTML body
 * @param {string} [params.text]           — plain-text body (falls back to subject if absent)
 * @param {string} [params.recipientName]  — used to compose `Name <email>` if provided
 * @param {string} [params.replyTo]
 * @returns {Promise<{ok: boolean, reason?: string, error?: Error, info?: any}>}
 */
export async function sendTenantEmail({
  tenantId,
  to,
  subject,
  html,
  text,
  recipientName,
  replyTo,
}) {
  if (!tenantId || !to || !subject) {
    return { ok: false, reason: 'missing_required_args' };
  }

  const supabase = supabaseClientOverride || getSupabaseClient();
  // Pull both supported types in one query; precedence is enforced below.
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('id, tenant_id, integration_type, integration_name, api_credentials, config, is_active')
    .eq('tenant_id', tenantId)
    .in('integration_type', ['gmail_smtp', 'communications_provider'])
    .eq('is_active', true);

  if (error) {
    logger.error('[sendTenantEmail] Provider lookup failed', error);
    return { ok: false, reason: 'lookup_failed', error };
  }

  const rows = (data || []).map(normalizeIntegrationRecord);
  const toField = recipientName ? `"${recipientName.replace(/"/g, "'")}" <${to}>` : to;

  // Precedence 1: gmail_smtp (organization Gmail/Workspace app-password SMTP).
  const gmail = rows.find((r) => r.integration_type === 'gmail_smtp');
  if (gmail) {
    const { transport, fromAddress, error: buildErr } = buildGmailTransport(gmail);
    if (buildErr) {
      logger.error('[sendTenantEmail] gmail_smtp build failed', { tenantId, reason: buildErr });
      return { ok: false, reason: buildErr };
    }
    try {
      const info = await transport.sendMail({
        from: fromAddress,
        to: toField,
        subject,
        html: html || undefined,
        text: text || subject,
        replyTo: replyTo || undefined,
      });
      return { ok: true, info, provider: 'gmail_smtp' };
    } catch (sendErr) {
      logger.warn('[sendTenantEmail] gmail_smtp rejected message', {
        tenantId,
        error: sendErr.message,
      });
      return { ok: false, reason: 'send_failed', error: sendErr, provider: 'gmail_smtp' };
    }
  }

  // Precedence 2: communications_provider (inbox-paired IMAP+SMTP).
  const candidate = rows.find(
    (r) =>
      isCommunicationsProviderIntegration(r.integration_type) &&
      r.config?.features?.outbound_enabled !== false,
  );

  if (!candidate) {
    return { ok: false, reason: 'no_provider' };
  }

  let adapter;
  try {
    const built = buildCommunicationsProviderConnection(candidate);
    adapter = loadImapSmtpAdapter(built.connection);
  } catch (buildErr) {
    logger.error('[sendTenantEmail] Failed to build adapter', buildErr);
    return { ok: false, reason: 'adapter_build_failed', error: buildErr };
  }

  try {
    const info = await adapter.sendMessage({
      to: toField,
      subject,
      html_body: html || undefined,
      text_body: text || subject,
      reply_to: replyTo || undefined,
    });
    return { ok: true, info, provider: 'communications_provider' };
  } catch (sendErr) {
    logger.warn('[sendTenantEmail] Provider rejected message', {
      tenantId,
      error: sendErr.message,
    });
    return {
      ok: false,
      reason: 'send_failed',
      error: sendErr,
      provider: 'communications_provider',
    };
  }
}

export default { sendTenantEmail };
