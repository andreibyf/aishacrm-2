// @ts-check
/**
 * buildDigitalSignatureMetadata (4VD-43 day 5 post-PR3 follow-up).
 *
 * Builds the structured digital-signature metadata block that gets
 * embedded into the stamped+CoC PDF's Info dictionary under a custom
 * key (`AiSHASignature`). The block is JSON-encoded as a string so
 * any PDF reader's properties panel can display it, and `pdfinfo`
 * + our own verification endpoints can parse + validate it.
 *
 * What this is vs. isn't
 * ======================
 * IS: a forensic record embedded inline in the PDF — survives email
 *     forwarding, downloads, copies. Machine-readable. Captures the
 *     full audit context at the moment of signing.
 *
 * IS NOT: a PKI-backed digital signature. Adobe Reader will NOT show
 *     the green "✓ Signed by" badge — that requires PAdES + a signing
 *     certificate (PKCS#7 / CAdES embedded in a signature field).
 *     We can layer that on top later via node-signpdf if needed;
 *     the metadata block here is independent and stands on its own.
 *
 * Schema (JSON keys, all snake_case, ISO-8601 for timestamps)
 * ============================================================
 *   schema_version:      "1"  (bump when adding required fields)
 *   producer:            "AiSHA CRM eSign engine"  (signature line)
 *   producer_version:    string (e.g. "3.x.y" — package.json version)
 *   envelope_id:         signing_sessions.id (UUID)
 *   template_name:       string (document name as displayed to signer)
 *   signed_at:           ISO 8601 UTC timestamp (server stamp)
 *   signer:
 *     name:              string | null  (recipient_name or typed name)
 *     email:             string         (recipient_email)
 *     ip:                string | null  (from audit "signed" entry)
 *     user_agent:        string | null  (from audit "signed" entry)
 *     method:            "drawn" | "typed" | "unknown"
 *                                       (signature capture mode)
 *   hashes:
 *     original_pdf_sha256:    hex string (binding hash — what the CoC shows)
 *     signature_image_sha256: hex string | null (hash of recipient PNG)
 *     final_pdf_sha256:       hex string (THIS PDF, computed before
 *                                         embedding this metadata block;
 *                                         see chicken-and-egg note below)
 *   audit_trail_count:   integer (number of audit entries on the session)
 *
 * Chicken-and-egg note
 * ====================
 * Embedding the final-PDF hash IN the final PDF is self-referential.
 * We resolve it by hashing the bytes RIGHT BEFORE the metadata is
 * added: the hash represents "the PDF content after stamping + CoC
 * append, before this metadata block was set." Verifiers can extract
 * the metadata block, remove it from the PDF's Info dict, re-hash,
 * and compare to `final_pdf_sha256`. (A future verification endpoint
 * will do this automatically.)
 *
 * Pure: no I/O, no DOM, no external libraries. Targeted by node:test.
 */

import crypto from 'node:crypto';

const SCHEMA_VERSION = '1';
const PRODUCER = 'AiSHA CRM eSign engine';

/**
 * SHA-256 hex digest of a buffer/Uint8Array/ArrayBuffer/string.
 * Pure helper exposed so callers can reuse instead of re-importing
 * node:crypto.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer|string} bytes
 * @returns {string}
 */
export function sha256Hex(bytes) {
  const hash = crypto.createHash('sha256');
  if (typeof bytes === 'string') {
    hash.update(bytes);
  } else if (bytes instanceof Buffer) {
    hash.update(bytes);
  } else if (bytes instanceof Uint8Array) {
    hash.update(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } else if (bytes instanceof ArrayBuffer) {
    hash.update(Buffer.from(bytes));
  } else if (bytes === null || bytes === undefined) {
    return '';
  } else {
    throw new TypeError('sha256Hex: unsupported input type');
  }
  return hash.digest('hex');
}

/**
 * Find the most recent audit entry for a given action. Reuses the
 * pattern from finalizeSigningSession.js's findAuditEntry but is
 * exposed publicly so callers can inspect the audit trail without
 * duplicating the array walk.
 *
 * @param {Array<{action: string}>|null|undefined} audit
 * @param {string} action
 * @returns {object|null}
 */
export function findAuditEntry(audit, action) {
  if (!Array.isArray(audit)) return null;
  // Walk in reverse so the MOST RECENT entry wins — handles re-signing
  // edge cases where status moved through pending → viewed → signed
  // and we want the actual "signed" event, not an earlier one.
  for (let i = audit.length - 1; i >= 0; i -= 1) {
    const entry = audit[i];
    if (entry && entry.action === action) return entry;
  }
  return null;
}

/**
 * @typedef {Object} BuildDigitalSignatureMetadataInput
 * @property {object} session         signing_sessions row
 * @property {string} session.id      envelope_id (UUID)
 * @property {string} session.recipient_email
 * @property {string} [session.recipient_name]
 * @property {string|Date} session.signed_at  ISO or Date
 * @property {Array<object>} [session.audit]
 * @property {object} [session.field_values]   captures signature method via
 *                                              _signer_name / _signature_data_url
 * @property {object} template        signing_templates row
 * @property {string} template.name
 * @property {string} originalPdfSha256
 * @property {string} finalPdfSha256
 * @property {string} [signatureImageSha256]
 * @property {string} [producerVersion]    e.g. package.json version
 */

/**
 * Detect whether the signer used drawn or typed mode. Heuristic:
 * field_values._signature_data_url is the PNG produced by the
 * SignaturePad component for BOTH modes (Draw + Type pipelines both
 * call trimSignatureCanvas → toDataURL). We can't reliably tell
 * mode from the data URL alone since both end in 'image/png'. The
 * frontend doesn't currently flag the mode in field_values, so we
 * return 'unknown' for now and document the gap.
 *
 * Future enhancement: SignaturePad sets field_values._signature_mode
 * = 'draw' | 'type' so this returns the actual mode. Tracked as
 * a v2 improvement; not blocking the metadata block landing.
 *
 * @param {object|undefined} fieldValues
 * @returns {'drawn'|'typed'|'unknown'}
 */
export function detectSignatureMethod(fieldValues) {
  if (!fieldValues || typeof fieldValues !== 'object') return 'unknown';
  const mode = fieldValues._signature_mode;
  if (mode === 'draw' || mode === 'drawn') return 'drawn';
  if (mode === 'type' || mode === 'typed') return 'typed';
  return 'unknown';
}

/**
 * Build the structured digital-signature metadata object. Pure.
 *
 * @param {BuildDigitalSignatureMetadataInput} input
 * @returns {object}  the metadata payload (caller JSON.stringify's it)
 */
export function buildDigitalSignatureMetadata(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('buildDigitalSignatureMetadata: input must be an object');
  }
  const {
    session,
    template,
    originalPdfSha256,
    finalPdfSha256,
    signatureImageSha256,
    producerVersion,
  } = input;
  if (!session || typeof session !== 'object') {
    throw new TypeError('buildDigitalSignatureMetadata: session is required');
  }
  if (!template || typeof template !== 'object') {
    throw new TypeError('buildDigitalSignatureMetadata: template is required');
  }
  if (typeof originalPdfSha256 !== 'string' || originalPdfSha256.length === 0) {
    throw new TypeError('buildDigitalSignatureMetadata: originalPdfSha256 is required');
  }
  if (typeof finalPdfSha256 !== 'string' || finalPdfSha256.length === 0) {
    throw new TypeError('buildDigitalSignatureMetadata: finalPdfSha256 is required');
  }

  const signedAtIso =
    session.signed_at instanceof Date
      ? session.signed_at.toISOString()
      : typeof session.signed_at === 'string'
        ? new Date(session.signed_at).toISOString()
        : new Date().toISOString();

  const signedAudit = findAuditEntry(session.audit, 'signed');
  const method = detectSignatureMethod(session.field_values);

  // Build signer-typed name from the recipient form when present
  // (the "I agree the signature image I drew is legally equivalent to
  // my handwritten signature" attestation captures this name).
  const typedName = session.field_values?._signer_name;
  const signerName =
    (typeof typedName === 'string' && typedName.trim()) || session.recipient_name || null;

  return {
    schema_version: SCHEMA_VERSION,
    producer: PRODUCER,
    producer_version: producerVersion || '0.0.0',
    envelope_id: session.id,
    template_name: template.name || '(untitled template)',
    signed_at: signedAtIso,
    signer: {
      name: signerName,
      email: session.recipient_email,
      ip: signedAudit?.ip || null,
      user_agent: signedAudit?.ua || null,
      method,
    },
    hashes: {
      original_pdf_sha256: originalPdfSha256,
      signature_image_sha256: signatureImageSha256 || null,
      final_pdf_sha256: finalPdfSha256,
    },
    audit_trail_count: Array.isArray(session.audit) ? session.audit.length : 0,
  };
}

export const __TEST__ = {
  SCHEMA_VERSION,
  PRODUCER,
};
