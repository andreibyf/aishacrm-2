// @ts-check
/**
 * buildSigningReceiptEmail.js (4VD-43 day 5 PR 2 follow-up)
 *
 * Pure function: given a tenant row + recipient context + a public
 * /sign/<token>/signed-pdf-url, return { subject, html, text } for a
 * tenant-branded "your signed copy" email sent to the recipient AFTER
 * `finalizeSigningSession` has uploaded the stamped PDF.
 *
 * Mirrors buildSigningRequestEmail.js: same branding precedence, same
 * inlined-style HTML, same plain-text fallback. The two emails together
 * are the recipient's full thread:
 *   1. (request) "<Tenant> sent you a document to sign: <name>"
 *   2. (receipt) "Your signed copy: <name>"
 *
 * The signed PDF is attached to the email by the caller (finalizeSigningSession
 * passes `attachments` to sendTenantEmail). The optional `viewUrl` is
 * included in the body so the recipient can re-open the document in their
 * browser if their email client strips attachments or they want to forward
 * the URL rather than the PDF.
 *
 * Pure: no I/O, no DOM, no external libraries. Targeted by node:test.
 */

const DEFAULT_PRIMARY_COLOR = '#2563eb';
const DEFAULT_TEXT_COLOR = '#0f172a';
const DEFAULT_MUTED_COLOR = '#475569';
const DEFAULT_BORDER_COLOR = '#e2e8f0';
const DEFAULT_BG_COLOR = '#f8fafc';
const SUCCESS_COLOR = '#16a34a';

const URL_RE = /^https?:\/\/[^\s]+$/i;

/**
 * Minimal HTML escape — covers the four characters that can break the
 * surrounding template. Identical to buildSigningRequestEmail.js.
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
 * @param {object|null|undefined} tenant
 * @returns {string|null}
 */
export function pickLogoUrl(tenant) {
  if (!tenant) return null;
  const candidate = tenant?.branding_settings?.logo_url ?? tenant?.metadata?.logo_url ?? null;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!URL_RE.test(trimmed)) return null;
  return trimmed;
}

/**
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
 * @typedef {Object} BuildSigningReceiptEmailInput
 * @property {object} tenant            — row from public.tenant
 * @property {string} templateName      — human-readable document name
 * @property {string} [recipientName]
 * @property {string} [signedAtIso]     — ISO timestamp; renders as
 *                                        "Signed on <human date>"
 * @property {string} [viewUrl]         — public /sign/<token>/signed-pdf-url
 *                                        for recipients whose clients
 *                                        strip attachments
 */

/**
 * @param {BuildSigningReceiptEmailInput} input
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildSigningReceiptEmail(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('buildSigningReceiptEmail: input must be an object');
  }
  const { tenant, templateName, recipientName, signedAtIso, viewUrl } = input;

  if (typeof templateName !== 'string' || templateName.trim().length === 0) {
    throw new TypeError('buildSigningReceiptEmail: templateName must be a non-empty string');
  }
  if (viewUrl !== undefined && viewUrl !== null) {
    if (typeof viewUrl !== 'string' || !URL_RE.test(viewUrl)) {
      throw new RangeError(
        'buildSigningReceiptEmail: viewUrl must be a valid http(s) URL when provided',
      );
    }
  }

  const tenantName = pickTenantDisplayName(tenant);
  const logoUrl = pickLogoUrl(tenant);
  const primary = pickPrimaryColor(tenant);
  const safeTemplateName = escapeHtml(templateName.trim());
  const safeRecipientName = recipientName ? escapeHtml(recipientName.trim()) : null;
  const safeTenantName = escapeHtml(tenantName);
  const safeViewUrl = viewUrl ? escapeHtml(viewUrl) : null;

  let signedAtLine = null;
  if (signedAtIso) {
    const parsed = new Date(signedAtIso);
    if (!Number.isNaN(parsed.getTime())) {
      signedAtLine = `Signed on ${parsed.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} UTC`;
    }
  }

  const subject = `Your signed copy: ${templateName.trim()}`;

  // Plain-text fallback. Email clients that strip HTML or block remote
  // images still get a usable message + the view link as a paste-able URL.
  const textLines = [
    safeRecipientName ? `Hi ${recipientName.trim()},` : 'Hi,',
    '',
    `Thanks for signing "${templateName.trim()}". A copy is attached to this email for your records.`,
  ];
  if (signedAtLine) {
    textLines.push('');
    textLines.push(signedAtLine);
  }
  textLines.push('');
  textLines.push(
    'The attached PDF includes a Certificate of Completion with the audit trail (IP address, timestamp, signer details) for legal record-keeping.',
  );
  if (viewUrl) {
    textLines.push('');
    textLines.push(
      'You can also view the signed document online here (link expires in 5 minutes):',
    );
    textLines.push(viewUrl);
  }
  textLines.push('');
  textLines.push(`— ${tenantName}`);
  const text = textLines.join('\n');

  // HTML body. Inlined styles only.
  const headerBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeTenantName}" style="max-height:48px;display:block;margin:0 auto 12px;" />`
    : `<h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:${DEFAULT_TEXT_COLOR};text-align:center;">${safeTenantName}</h1>`;

  const greeting = safeRecipientName ? `Hi ${safeRecipientName},` : 'Hi,';

  const signedAtBlock = signedAtLine
    ? `<p style="font-size:13px;color:${DEFAULT_MUTED_COLOR};margin:4px 0 0;">${escapeHtml(signedAtLine)}</p>`
    : '';

  const viewButtonBlock = safeViewUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 0;">
        <tr>
          <td align="center" bgcolor="${primary}" style="border-radius:6px;">
            <a href="${safeViewUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">View signed document</a>
          </td>
        </tr>
      </table>
      <p style="font-size:11px;color:${DEFAULT_MUTED_COLOR};margin:8px 0 0;text-align:center;">This link expires in 5 minutes. The attached PDF is your permanent copy.</p>`
    : '';

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
                <div style="margin:16px 0 8px;padding:12px 16px;background:${DEFAULT_BG_COLOR};border-left:4px solid ${SUCCESS_COLOR};border-radius:4px;">
                  <p style="font-size:15px;color:${DEFAULT_TEXT_COLOR};margin:0;line-height:1.5;">
                    Thanks for signing <strong>${safeTemplateName}</strong>.
                    A copy is attached for your records.
                  </p>
                  ${signedAtBlock}
                </div>
                <p style="font-size:13px;color:${DEFAULT_MUTED_COLOR};margin:16px 0 0;line-height:1.5;">
                  The attached PDF includes a Certificate of Completion with the audit trail
                  (IP address, timestamp, signer details) for legal record-keeping.
                </p>
                ${viewButtonBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px;border-top:1px solid ${DEFAULT_BORDER_COLOR};">
                <p style="font-size:14px;color:${DEFAULT_MUTED_COLOR};margin:8px 0 0;">— ${safeTenantName}</p>
              </td>
            </tr>
          </table>
          <p style="font-size:11px;color:${DEFAULT_MUTED_COLOR};margin:16px 0 0;text-align:center;">
            You received this email because you signed a document sent by ${safeTenantName}.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

export default { buildSigningReceiptEmail };
