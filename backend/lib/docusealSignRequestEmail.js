/**
 * docusealSignRequestEmail.js
 *
 * Composes the tenant-branded HTML + plain-text body for a DocuSeal
 * white-label signing request (4VD-7). Pure function — no I/O — so it can
 * be unit-tested independently of the SMTP adapter.
 *
 * Inputs are sanitized minimally (HTML-escape) so embedding tenant-supplied
 * names doesn't open an XSS hole on the recipient's email client.
 */

function escapeHtml(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the email body.
 *
 * @param {object} params
 * @param {string} params.tenantName       — sender display name
 * @param {string} [params.tenantLogoUrl]  — optional logo (https URL)
 * @param {string} [params.primaryColor]   — CSS hex like '#06b6d4'
 * @param {string} [params.recipientName]
 * @param {string} params.templateName     — document template name
 * @param {string} [params.message]        — optional sender note
 * @param {string} params.signingUrl       — full https://app.aishacrm.com/sign/<slug>/<token>
 * @returns {{subject: string, html: string, text: string}}
 */
export function buildDocusealSignRequestEmail({
  tenantName,
  tenantLogoUrl,
  primaryColor,
  recipientName,
  templateName,
  message,
  signingUrl,
}) {
  const safeTenantName = escapeHtml(tenantName || 'A sender');
  const safeRecipientName = escapeHtml(recipientName || '');
  const safeTemplate = escapeHtml(templateName || 'a document');
  const safeMessage = message ? escapeHtml(message) : '';
  const color = /^#[0-9a-fA-F]{6}$/.test(primaryColor || '') ? primaryColor : '#2563eb';
  const safeSigningUrl = escapeHtml(signingUrl);
  const logoBlock =
    tenantLogoUrl && /^https?:\/\//i.test(tenantLogoUrl)
      ? `<img src="${escapeHtml(tenantLogoUrl)}" alt="${safeTenantName}" style="max-height:48px;display:block;margin-bottom:24px;">`
      : `<div style="font-size:18px;font-weight:600;margin-bottom:24px;color:#0f172a;">${safeTenantName}</div>`;

  const subject = `${tenantName || 'A sender'} sent you a document to sign: ${templateName || 'Document'}`;

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;color:#0f172a;line-height:1.5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;padding:32px;">
            <tr><td>
              ${logoBlock}
              <h1 style="margin:0 0 16px 0;font-size:20px;color:#0f172a;">
                ${safeRecipientName ? `Hi ${safeRecipientName},` : 'Hi,'}
              </h1>
              <p style="margin:0 0 16px 0;font-size:15px;color:#334155;">
                <strong>${safeTenantName}</strong> has sent you a document for signature: <strong>${safeTemplate}</strong>.
              </p>
              ${safeMessage ? `<div style="margin:0 0 16px 0;padding:12px 16px;background:#f1f5f9;border-left:3px solid ${color};font-size:14px;color:#334155;white-space:pre-wrap;">${safeMessage}</div>` : ''}
              <p style="margin:24px 0;text-align:center;">
                <a href="${safeSigningUrl}" style="background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:6px;display:inline-block;">Review and sign</a>
              </p>
              <p style="margin:24px 0 0 0;font-size:13px;color:#64748b;">
                Or copy and paste this link into your browser:<br/>
                <a href="${safeSigningUrl}" style="color:${color};word-break:break-all;">${safeSigningUrl}</a>
              </p>
            </td></tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;">
            This email was sent on behalf of ${safeTenantName}.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${recipientName ? `Hi ${recipientName},` : 'Hi,'}`,
    '',
    `${tenantName || 'A sender'} has sent you a document for signature: ${templateName || 'Document'}.`,
    message ? `\nMessage from sender:\n${message}\n` : '',
    `Review and sign: ${signingUrl}`,
    '',
    `This email was sent on behalf of ${tenantName || 'a sender'}.`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text };
}

export default { buildDocusealSignRequestEmail };
