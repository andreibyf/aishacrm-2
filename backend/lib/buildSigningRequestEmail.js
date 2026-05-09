// @ts-check
/**
 * buildSigningRequestEmail.js (4VD-43 day 2)
 *
 * Pure function: given a tenant row, the recipient context, and the signing
 * URL, return { subject, html, text } for a tenant-branded signing-request
 * email.
 *
 * Branding sources (in precedence order):
 *   tenant.branding_settings.logo_url     — preferred
 *   tenant.metadata.logo_url              — legacy fallback for older rows
 *
 *   tenant.branding_settings.primary_color — used for the call-to-action
 *                                            button background; falls back
 *                                            to a sane neutral if missing.
 *
 *   tenant.name                            — header brand label fallback
 *                                            when no logo URL is set.
 *
 * Pure: no I/O, no DOM, no external libraries. Targeted by node:test.
 */

const DEFAULT_PRIMARY_COLOR = '#2563eb'; // tailwind blue-600 — matches the
// CRM's accent palette; only used when the tenant hasn't set their own.
const DEFAULT_TEXT_COLOR = '#0f172a';
const DEFAULT_MUTED_COLOR = '#475569';
const DEFAULT_BORDER_COLOR = '#e2e8f0';
const DEFAULT_BG_COLOR = '#f8fafc';

const URL_RE = /^https?:\/\/[^\s]+$/i;

/**
 * Minimal HTML escape — covers the four characters that can break the
 * surrounding template (no need for full XML escaping; this is email-body
 * text not attribute content).
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Pull the tenant logo URL out of the row, accepting both the canonical
 * branding_settings location and the legacy metadata fallback.
 *
 * @param {object|null|undefined} tenant
 * @returns {string|null}
 */
export function pickLogoUrl(tenant) {
  if (!tenant) return null;
  const candidate =
    tenant?.branding_settings?.logo_url ?? tenant?.metadata?.logo_url ?? null;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!URL_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Pull the tenant primary colour from branding_settings; fall back to the
 * default neutral when missing or malformed. We accept any string starting
 * with '#' so 3- and 6-digit hex both work.
 *
 * @param {object|null|undefined} tenant
 * @returns {string}
 */
export function pickPrimaryColor(tenant) {
  const candidate = tenant?.branding_settings?.primary_color;
  if (typeof candidate === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(candidate.trim())) {
    return candidate.trim();
  }
  return DEFAULT_PRIMARY_COLOR;
}

/**
 * Compose a friendly tenant display name. Uses tenant.name first, then the
 * slug as a degraded fallback.
 *
 * @param {object|null|undefined} tenant
 * @returns {string}
 */
export function pickTenantDisplayName(tenant) {
  if (!tenant) return 'Your team';
  const candidate = tenant.name || tenant.tenant_id || '';
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  return 'Your team';
}

/**
 * @typedef {Object} BuildSigningRequestEmailInput
 * @property {object} tenant            — row from public.tenant
 *                                        (branding_settings + name + tenant_id)
 * @property {string} signingUrl        — public /sign/<...>/<token> URL
 * @property {string} templateName      — human-readable template name
 * @property {string} [recipientName]   — recipient first/last name
 * @property {string} [senderName]      — operator who clicked Send (for the
 *                                        "Sent by" line)
 * @property {string} [message]         — optional free-text note from the
 *                                        operator
 * @property {Date}   [expiresAt]       — when the signing_token expires;
 *                                        included in body if present
 */

/**
 * @param {BuildSigningRequestEmailInput} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildSigningRequestEmail(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('buildSigningRequestEmail: input must be an object');
  }
  const { tenant, signingUrl, templateName, recipientName, senderName, message, expiresAt } = input;

  if (typeof signingUrl !== 'string' || !URL_RE.test(signingUrl)) {
    throw new RangeError('buildSigningRequestEmail: signingUrl must be a valid http(s) URL');
  }
  if (typeof templateName !== 'string' || templateName.trim().length === 0) {
    throw new TypeError('buildSigningRequestEmail: templateName must be a non-empty string');
  }

  const tenantName = pickTenantDisplayName(tenant);
  const logoUrl = pickLogoUrl(tenant);
  const primary = pickPrimaryColor(tenant);
  const safeTemplateName = escapeHtml(templateName.trim());
  const safeRecipientName = recipientName ? escapeHtml(recipientName.trim()) : null;
  const safeSenderName = senderName ? escapeHtml(senderName.trim()) : null;
  const safeMessage = message ? escapeHtml(message.trim()).replace(/\n/g, '<br>') : null;
  const safeTenantName = escapeHtml(tenantName);
  const safeSigningUrl = escapeHtml(signingUrl);

  const expiresLine = expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime())
    ? `This link expires on ${expiresAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`
    : null;

  const subject = `${tenantName} sent you a document to sign: ${templateName.trim()}`;

  // Plain-text fallback. Email clients that strip HTML or are blocked from
  // loading remote images still get a fully usable message + link.
  const textLines = [
    safeRecipientName ? `Hi ${recipientName.trim()},` : 'Hi,',
    '',
    `${tenantName} has sent you a document to review and sign: "${templateName.trim()}".`,
  ];
  if (message) {
    textLines.push('');
    textLines.push('Message from sender:');
    textLines.push(message.trim());
  }
  textLines.push('');
  textLines.push('Click the link below to open the document and sign:');
  textLines.push(signingUrl);
  if (expiresLine) {
    textLines.push('');
    textLines.push(expiresLine);
  }
  if (senderName) {
    textLines.push('');
    textLines.push(`— ${senderName.trim()} at ${tenantName}`);
  } else {
    textLines.push('');
    textLines.push(`— ${tenantName}`);
  }
  const text = textLines.join('\n');

  // HTML body. Inlined styles only — most email clients strip <style>
  // blocks. Logo is loaded over https; if the recipient's client blocks
  // remote images they fall back to the alt text + the brand-name H1.
  const headerBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeTenantName}" style="max-height:48px;display:block;margin:0 auto 12px;" />`
    : `<h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:${DEFAULT_TEXT_COLOR};text-align:center;">${safeTenantName}</h1>`;

  const greeting = safeRecipientName ? `Hi ${safeRecipientName},` : 'Hi,';

  const messageBlock = safeMessage
    ? `<div style="background:${DEFAULT_BG_COLOR};border-left:4px solid ${primary};padding:12px 16px;margin:16px 0;color:${DEFAULT_TEXT_COLOR};font-size:14px;line-height:1.5;border-radius:4px;">
      <strong style="display:block;margin-bottom:4px;color:${DEFAULT_MUTED_COLOR};font-weight:500;">Message from ${safeSenderName || safeTenantName}:</strong>
      ${safeMessage}
    </div>`
    : '';

  const expiresBlock = expiresLine
    ? `<p style="font-size:12px;color:${DEFAULT_MUTED_COLOR};margin:24px 0 0;">${escapeHtml(expiresLine)}</p>`
    : '';

  const signoff = safeSenderName
    ? `<p style="font-size:14px;color:${DEFAULT_MUTED_COLOR};margin:8px 0 0;">— ${safeSenderName} at ${safeTenantName}</p>`
    : `<p style="font-size:14px;color:${DEFAULT_MUTED_COLOR};margin:8px 0 0;">— ${safeTenantName}</p>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${DEFAULT_BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${DEFAULT_TEXT_COLOR};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${DEFAULT_BG_COLOR};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid ${DEFAULT_BORDER_COLOR};border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px 8px;">
                ${headerBlock}
                <p style="font-size:15px;color:${DEFAULT_TEXT_COLOR};margin:16px 0 0;">${greeting}</p>
                <p style="font-size:15px;color:${DEFAULT_TEXT_COLOR};margin:8px 0 0;line-height:1.5;">
                  <strong>${safeTenantName}</strong> has sent you a document to review and sign:
                </p>
                <p style="font-size:16px;color:${DEFAULT_TEXT_COLOR};margin:8px 0 16px;font-weight:600;">${safeTemplateName}</p>
                ${messageBlock}
                <p style="font-size:14px;color:${DEFAULT_MUTED_COLOR};margin:16px 0 24px;">Click the button below to open the document and sign.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td align="center" bgcolor="${primary}" style="border-radius:6px;">
                      <a href="${safeSigningUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">Review &amp; Sign</a>
                    </td>
                  </tr>
                </table>
                <p style="font-size:12px;color:${DEFAULT_MUTED_COLOR};margin:24px 0 0;text-align:center;word-break:break-all;">
                  Or copy this link: <a href="${safeSigningUrl}" style="color:${primary};text-decoration:underline;">${safeSigningUrl}</a>
                </p>
                ${expiresBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px;border-top:1px solid ${DEFAULT_BORDER_COLOR};">
                ${signoff}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
