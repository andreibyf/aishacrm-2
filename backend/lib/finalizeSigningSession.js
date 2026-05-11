// @ts-check
/**
 * finalizeSigningSession (4VD-43 day 5).
 *
 * Orchestrates the post-submit pipeline that turns a `signed` signing_session
 * into a `completed` one with a stored signed PDF + Certificate of Completion.
 *
 * Pipeline
 * ========
 *   1. Re-load the session row + the parent template's pdf_storage_path.
 *   2. Download the original template PDF from Supabase Storage.
 *   3. SHA-256 the original bytes (the "binding hash" for the CoC).
 *   4. Stamp the recipient's field_values onto the PDF (signPdf.js).
 *   5. Build the Certificate of Completion and append it.
 *   6. Upload the stamped+CoC PDF to
 *      `tenant-assets/{tenant_id}/signed/{session_id}.pdf`.
 *   7. Update signing_sessions: signed_pdf_storage_path,
 *      status='completed', completed_at=now(), audit += {completed}.
 *   8. Best-effort: updateActivityForSign already moved the activity row
 *      to status='completed' on submit; we just ensure metadata.completed_at
 *      is set.
 *
 * Failure semantics
 * =================
 * - If we got here, the row is already at status='signed' with the
 *   recipient's field_values + a 'signed' audit entry. That's the legal
 *   intent-to-sign record and stays put even if stamping fails.
 * - On any pipeline step failure we log + return { ok:false, reason }.
 *   The caller (public-sign.js) returns 500 to the recipient with an
 *   error code; the recipient's success-page UX still shows because the
 *   submit handler itself has already returned. This finalize step runs
 *   "after the response" semantically (best-effort write-behind).
 * - Operators can re-run finalize manually via a console / one-off
 *   script — the pipeline is idempotent (re-stamping produces the same
 *   bytes, re-uploading uses upsert:true).
 */

import crypto from 'node:crypto';
import logger from './logger.js';
import { signPdf } from './signPdf.js';
import { appendCertificateOfCompletion } from './buildCertificateOfCompletion.js';
import { sendTenantEmail } from './sendTenantEmail.js';
import { buildSigningReceiptEmail } from './buildSigningReceiptEmail.js';

/**
 * Storage object key for a signed PDF. Mirrors `buildTemplateStorageKey`
 * in routes/templates.js so the layout is consistent:
 *   tenant-assets/{tenant_id}/templates/{template_id}.pdf  (source)
 *   tenant-assets/{tenant_id}/signed/{session_id}.pdf      (signed)
 *
 * Pure — exported so callers can reconstruct the path for the
 * download-URL endpoint without a DB hit.
 */
export function buildSignedPdfStorageKey({ tenantId, sessionId }) {
  return `${tenantId}/signed/${sessionId}.pdf`;
}

/**
 * SHA-256 hex digest of a buffer / Uint8Array. Pure helper exposed so
 * tests can pin the hash logic and downstream callers can verify the
 * binding hash on the CoC matches the stored original.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} bytes
 * @returns {string}
 */
export function sha256Hex(bytes) {
  const hash = crypto.createHash('sha256');
  if (bytes instanceof Buffer) {
    hash.update(bytes);
  } else if (bytes instanceof Uint8Array) {
    hash.update(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } else if (bytes instanceof ArrayBuffer) {
    hash.update(Buffer.from(bytes));
  } else {
    throw new TypeError('sha256Hex: unsupported input type');
  }
  return hash.digest('hex');
}

/**
 * Find the most relevant audit entry for a given action. Used to extract
 * the IP/UA of the 'signed' event for the CoC.
 *
 * @param {Array<{action: string}>|null|undefined} audit
 * @param {string} action
 */
function findAuditEntry(audit, action) {
  if (!Array.isArray(audit)) return null;
  return audit.find((e) => e && e.action === action) || null;
}

/**
 * Append a `completed` audit entry. Pure helper.
 *
 * @param {Array<object>|null|undefined} audit
 * @param {{ at: string }} extras
 * @returns {Array<object>}
 */
function appendCompletedEntry(audit, { at }) {
  const arr = Array.isArray(audit) ? [...audit] : [];
  arr.push({ action: 'completed', at });
  return arr;
}

/**
 * Public entrypoint. Run the full finalize pipeline for a signing_session
 * that's just been transitioned to status='signed'. Best-effort: catches
 * every failure and returns a structured result instead of throwing.
 *
 * @param {object} params
 * @param {object} params.supabase   service-role supabase client
 * @param {string} params.bucket     Supabase Storage bucket name (typically 'tenant-assets')
 * @param {string} params.sessionId  signing_sessions.id
 * @param {string} params.signerName recipient-typed name (passed through as PDF metadata + CoC)
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   signedPdfStoragePath?: string,
 *   originalSha256?: string
 * }>}
 */
export async function finalizeSigningSession({ supabase, bucket, sessionId, signerName }) {
  if (!supabase || !bucket || !sessionId) {
    return { ok: false, reason: 'missing_args' };
  }

  // 1. Re-load session + template metadata
  const { data: session, error: sessErr } = await supabase
    .from('signing_sessions')
    .select(
      'id, tenant_id, template_id, recipient_email, recipient_name, signed_at, audit, field_values, status',
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (sessErr || !session) {
    logger.warn('[finalize] session lookup failed', {
      sessionId,
      message: sessErr?.message || 'not_found',
    });
    return { ok: false, reason: 'session_lookup_failed' };
  }
  if (session.status === 'completed') {
    // Idempotent re-run: already done.
    return { ok: true, reason: 'already_completed' };
  }

  const { data: template, error: tplErr } = await supabase
    .from('signing_templates')
    .select('id, name, pdf_storage_path, fields')
    .eq('id', session.template_id)
    .eq('tenant_id', session.tenant_id)
    .maybeSingle();
  if (tplErr || !template) {
    logger.warn('[finalize] template lookup failed', {
      sessionId,
      templateId: session.template_id,
      message: tplErr?.message || 'not_found',
    });
    return { ok: false, reason: 'template_lookup_failed' };
  }

  // 2. Download original template PDF
  const { data: originalBlob, error: dlErr } = await supabase.storage
    .from(bucket)
    .download(template.pdf_storage_path);
  if (dlErr || !originalBlob) {
    logger.warn('[finalize] original PDF download failed', {
      sessionId,
      path: template.pdf_storage_path,
      message: dlErr?.message,
    });
    return { ok: false, reason: 'original_download_failed' };
  }
  const originalBuffer = Buffer.from(await originalBlob.arrayBuffer());

  // 3. Hash the original (binding hash for the CoC)
  const originalSha256 = sha256Hex(originalBuffer);

  // 4. Stamp recipient values onto the original
  let stampedBytes;
  try {
    stampedBytes = await signPdf({
      originalPdf: originalBuffer,
      fields: Array.isArray(template.fields) ? template.fields : [],
      fieldValues: session.field_values || {},
      signatureDataUrl: (session.field_values && session.field_values._signature_data_url) || null,
      signerName: signerName || session.field_values?._signer_name || session.recipient_name || '',
      signedAt: session.signed_at || new Date(),
      title: template.name || 'Signed document',
    });
  } catch (err) {
    logger.error('[finalize] signPdf stamping failed', {
      sessionId,
      message: err?.message,
    });
    return { ok: false, reason: 'stamp_failed' };
  }

  // 5. Build + append Certificate of Completion
  const signedAuditEntry = findAuditEntry(session.audit, 'signed');
  let mergedBytes;
  try {
    mergedBytes = await appendCertificateOfCompletion(stampedBytes, {
      documentName: template.name || '(untitled template)',
      envelopeId: session.id,
      originalPdfSha256: originalSha256,
      tenantName: undefined, // tenant join would be a separate query; keep CoC self-contained
      recipientEmail: session.recipient_email,
      recipientName: session.recipient_name || undefined,
      signerTypedName: signerName || session.field_values?._signer_name || undefined,
      signerIp: signedAuditEntry?.ip,
      signerUserAgent: signedAuditEntry?.ua,
      signedAt: session.signed_at || undefined,
      auditTrail: Array.isArray(session.audit) ? session.audit : [],
    });
  } catch (err) {
    logger.error('[finalize] CoC append failed', {
      sessionId,
      message: err?.message,
    });
    return { ok: false, reason: 'coc_failed' };
  }

  // 6. Upload to storage
  const signedPdfStoragePath = buildSignedPdfStorageKey({
    tenantId: session.tenant_id,
    sessionId: session.id,
  });
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(signedPdfStoragePath, Buffer.from(mergedBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (upErr) {
    logger.error('[finalize] storage upload failed', {
      sessionId,
      path: signedPdfStoragePath,
      message: upErr.message,
    });
    return { ok: false, reason: 'storage_upload_failed' };
  }

  // 7. Update session row
  const completedAtIso = new Date().toISOString();
  const newAudit = appendCompletedEntry(session.audit, { at: completedAtIso });
  const { error: updErr } = await supabase
    .from('signing_sessions')
    .update({
      signed_pdf_storage_path: signedPdfStoragePath,
      status: 'completed',
      completed_at: completedAtIso,
      audit: newAudit,
    })
    .eq('id', sessionId);
  if (updErr) {
    logger.error('[finalize] session update failed', {
      sessionId,
      message: updErr.message,
    });
    // The PDF is already in storage; the row is the source of truth for
    // status. Surface the failure so the caller can retry or alert.
    return { ok: false, reason: 'session_update_failed', signedPdfStoragePath };
  }

  // 8. Best-effort: email the recipient their signed copy with the PDF
  //    attached. Failure here does NOT roll back the signing_session —
  //    the row is at status='completed' and the operator can re-trigger
  //    the email manually if needed. We log and continue.
  //
  //    The receipt email is intentionally separate from the request
  //    email path (buildSigningRequestEmail / sendTenantEmail at submit
  //    time) so a failed receipt doesn't undo the legal recording of
  //    the signature.
  try {
    // Load tenant branding for the email's logo + primary color. Same
    // payload shape buildSigningRequestEmail consumes during the send.
    const { data: tenantRow } = await supabase
      .from('tenant')
      .select('id, tenant_id, name, branding_settings, metadata')
      .eq('id', session.tenant_id)
      .maybeSingle();

    const built = buildSigningReceiptEmail({
      tenant: tenantRow || { name: 'Your team' },
      templateName: template.name || 'Signed document',
      recipientName: session.recipient_name || undefined,
      signedAtIso: completedAtIso,
      // viewUrl intentionally omitted here — the public sign URL only
      // works while signed_pdf_storage_path is set, which it now is,
      // but exposing a token-bearing URL via email duplicates the
      // attachment + adds a phishing-look-alike surface. The attached
      // PDF is the recipient's canonical copy. We can revisit this if
      // operators specifically want a "view online" link.
    });

    const emailResult = await sendTenantEmail({
      tenantId: session.tenant_id,
      to: session.recipient_email,
      recipientName: session.recipient_name || undefined,
      subject: built.subject,
      html: built.html,
      text: built.text,
      attachments: [
        {
          filename: buildAttachmentFilename(template.name || 'signed-document'),
          content: Buffer.from(mergedBytes),
          contentType: 'application/pdf',
        },
      ],
    });

    if (!emailResult.ok) {
      logger.warn('[finalize] recipient receipt email failed', {
        sessionId,
        reason: emailResult.reason,
      });
    }
  } catch (err) {
    logger.warn('[finalize] recipient receipt email threw', {
      sessionId,
      message: err?.message || String(err),
    });
  }

  return {
    ok: true,
    signedPdfStoragePath,
    originalSha256,
  };
}

/**
 * Build a safe filename for the email attachment. Template names can
 * contain anything; we collapse non-alphanumeric runs to '-' and cap
 * length so we don't ship a filename like "Service Agreement / NDA
 * (FINAL).pdf" that some mail clients refuse to display.
 *
 * Exported for unit-testing.
 *
 * @param {string} templateName
 * @returns {string}
 */
export function buildAttachmentFilename(templateName) {
  const base =
    String(templateName || 'signed-document')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'signed-document';
  return `${base}.pdf`;
}
