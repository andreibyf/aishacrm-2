// @ts-check
/**
 * buildCertificateOfCompletion (4VD-43 day 5).
 *
 * Generates a Certificate of Completion that gets appended to every signed
 * PDF before it's stored. This is the legally admissible audit record —
 * without it, the standalone signed PDF has no portable proof of who
 * signed when from which IP. Standard ESIGN Act / eIDAS expectation.
 *
 * Layout (single page, US Letter)
 * ===============================
 *   [Header band]   "Certificate of Completion"
 *                   AiSHA CRM eSign engine
 *
 *   [Document]      Document name
 *                   Envelope ID (signing_session.id)
 *                   Original PDF SHA-256
 *
 *   [Sender]        Tenant name + the user who clicked Send
 *
 *   [Recipient]     Recipient name + email + typed signer_name
 *                   Signing IP + user-agent
 *                   Signed at (ISO timestamp)
 *
 *   [Audit trail]   Tabular: action | timestamp | ip | ua  (one row per audit entry)
 *
 *   [Footer]        "This certificate is the legal record of this transaction."
 *
 * Pure function: takes a metadata object + an optional appendTo PDFDocument,
 * returns a fresh PDFDocument or appends a page to the supplied doc.
 *
 * Out of scope:
 *   - Multi-page CoC when the audit trail is huge (>30 events). v1 truncates.
 *     Real CoC for a routine signing has 4-6 events; we have headroom.
 *   - Logo / branding image embedding. Tenant logo could go top-right
 *     in v2; v1 is text-only to keep things deterministic.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE_WIDTH = 612; // US Letter @ 72dpi
const PAGE_HEIGHT = 792;
const MARGIN = 54; // 0.75 inch
const COLOR_HEADER = rgb(0.13, 0.32, 0.61); // navy
const COLOR_TEXT = rgb(0.1, 0.1, 0.1);
const COLOR_MUTED = rgb(0.45, 0.45, 0.45);
const COLOR_RULE = rgb(0.85, 0.85, 0.85);

/**
 * @typedef {Object} CoCAuditEntry
 * @property {string} action       e.g. 'sent' | 'viewed' | 'signed' | 'completed' | 'declined'
 * @property {string} at           ISO-8601 timestamp
 * @property {string} [ip]
 * @property {string} [ua]
 * @property {string} [signer_name]
 * @property {string} [reason]
 */

/**
 * @typedef {Object} CoCParams
 * @property {string} documentName
 * @property {string} envelopeId               signing_session.id
 * @property {string} originalPdfSha256        hex digest
 * @property {string} [tenantName]
 * @property {string} [sentByEmail]
 * @property {string} [sentByName]
 * @property {string} recipientEmail
 * @property {string} [recipientName]
 * @property {string} [signerTypedName]
 * @property {string} [signerIp]
 * @property {string} [signerUserAgent]
 * @property {string|Date} [signedAt]
 * @property {CoCAuditEntry[]} [auditTrail]
 * @property {string} [generatedAt]            override for tests
 */

/**
 * Truncate a string to maxLen graphemes (approx — we use chars), appending
 * an ellipsis when truncated. Pure helper.
 *
 * @param {string|undefined|null} s
 * @param {number} maxLen
 * @returns {string}
 */
function clip(s, maxLen) {
  if (!s) return '';
  const str = String(s);
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 1)) + '…';
}

/**
 * Format a timestamp for the CoC. ISO with second precision is the legal
 * convention — preserves timezone unambiguously.
 *
 * @param {string|Date|undefined|null} v
 * @returns {string}
 */
function fmtTs(v) {
  if (!v) return '';
  try {
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  } catch {
    return String(v);
  }
}

/**
 * Draw a horizontal rule at the given y. Mutates page.
 */
function drawRule(page, y) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: COLOR_RULE,
  });
}

/**
 * Draw a label/value row. Returns the y after the row.
 */
function drawRow(page, fonts, x, y, label, value, opts = {}) {
  const labelSize = opts.labelSize || 9;
  const valueSize = opts.valueSize || 10;
  const labelWidth = opts.labelWidth || 110;
  page.drawText(label, {
    x,
    y,
    size: labelSize,
    font: fonts.bold,
    color: COLOR_MUTED,
  });
  page.drawText(String(value || ''), {
    x: x + labelWidth,
    y,
    size: valueSize,
    font: fonts.regular,
    color: COLOR_TEXT,
    maxWidth: PAGE_WIDTH - MARGIN - x - labelWidth,
  });
  return y - (valueSize + 6);
}

/**
 * Build the Certificate of Completion as a fresh single-page PDFDocument.
 * Caller can then merge it onto an existing signed PDF via copyPages.
 *
 * @param {CoCParams} params
 * @returns {Promise<import('pdf-lib').PDFDocument>}
 */
export async function buildCertificateOfCompletion(params) {
  if (!params || typeof params !== 'object') {
    throw new TypeError('CoC params required');
  }
  if (!params.documentName) {
    throw new TypeError('CoC requires documentName');
  }
  if (!params.envelopeId) {
    throw new TypeError('CoC requires envelopeId');
  }
  if (!params.recipientEmail) {
    throw new TypeError('CoC requires recipientEmail');
  }
  if (!params.originalPdfSha256) {
    throw new TypeError('CoC requires originalPdfSha256');
  }

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular: helv, bold: helvBold };

  let y = PAGE_HEIGHT - MARGIN;

  // ── Header ─────────────────────────────────────────────────────────
  page.drawText('Certificate of Completion', {
    x: MARGIN,
    y: y - 22,
    size: 22,
    font: helvBold,
    color: COLOR_HEADER,
  });
  y -= 32;
  page.drawText('AiSHA CRM eSign engine', {
    x: MARGIN,
    y: y - 12,
    size: 10,
    font: helv,
    color: COLOR_MUTED,
  });
  y -= 28;
  drawRule(page, y);
  y -= 16;

  // ── Document section ───────────────────────────────────────────────
  page.drawText('Document', {
    x: MARGIN,
    y,
    size: 11,
    font: helvBold,
    color: COLOR_HEADER,
  });
  y -= 16;
  y = drawRow(page, fonts, MARGIN, y, 'Document name', clip(params.documentName, 80));
  y = drawRow(page, fonts, MARGIN, y, 'Envelope ID', params.envelopeId);
  y = drawRow(
    page,
    fonts,
    MARGIN,
    y,
    'Original SHA-256',
    clip(params.originalPdfSha256, 80),
    { valueSize: 8 },
  );
  y -= 6;
  drawRule(page, y);
  y -= 16;

  // ── Sender section ─────────────────────────────────────────────────
  page.drawText('Sender', {
    x: MARGIN,
    y,
    size: 11,
    font: helvBold,
    color: COLOR_HEADER,
  });
  y -= 16;
  y = drawRow(page, fonts, MARGIN, y, 'Tenant', clip(params.tenantName || '(unknown)', 80));
  if (params.sentByName || params.sentByEmail) {
    const senderLine = params.sentByName
      ? `${params.sentByName}${params.sentByEmail ? ` <${params.sentByEmail}>` : ''}`
      : params.sentByEmail || '';
    y = drawRow(page, fonts, MARGIN, y, 'Sent by', clip(senderLine, 80));
  }
  y -= 6;
  drawRule(page, y);
  y -= 16;

  // ── Recipient section ──────────────────────────────────────────────
  page.drawText('Recipient', {
    x: MARGIN,
    y,
    size: 11,
    font: helvBold,
    color: COLOR_HEADER,
  });
  y -= 16;
  if (params.recipientName) {
    y = drawRow(page, fonts, MARGIN, y, 'Name', clip(params.recipientName, 80));
  }
  y = drawRow(page, fonts, MARGIN, y, 'Email', params.recipientEmail);
  if (params.signerTypedName) {
    y = drawRow(page, fonts, MARGIN, y, 'Typed name', clip(params.signerTypedName, 80));
  }
  if (params.signerIp) {
    y = drawRow(page, fonts, MARGIN, y, 'IP address', clip(params.signerIp, 80));
  }
  if (params.signerUserAgent) {
    y = drawRow(
      page,
      fonts,
      MARGIN,
      y,
      'User agent',
      clip(params.signerUserAgent, 100),
      { valueSize: 8 },
    );
  }
  if (params.signedAt) {
    y = drawRow(page, fonts, MARGIN, y, 'Signed at', fmtTs(params.signedAt));
  }
  y -= 6;
  drawRule(page, y);
  y -= 16;

  // ── Audit trail section ────────────────────────────────────────────
  page.drawText('Audit trail', {
    x: MARGIN,
    y,
    size: 11,
    font: helvBold,
    color: COLOR_HEADER,
  });
  y -= 16;
  // Column widths
  const colActionX = MARGIN;
  const colTimeX = MARGIN + 90;
  const colIpX = MARGIN + 230;
  const colUaX = MARGIN + 320;
  // Headers
  page.drawText('Action', { x: colActionX, y, size: 8, font: helvBold, color: COLOR_MUTED });
  page.drawText('Timestamp (UTC)', {
    x: colTimeX,
    y,
    size: 8,
    font: helvBold,
    color: COLOR_MUTED,
  });
  page.drawText('IP', { x: colIpX, y, size: 8, font: helvBold, color: COLOR_MUTED });
  page.drawText('User agent (truncated)', {
    x: colUaX,
    y,
    size: 8,
    font: helvBold,
    color: COLOR_MUTED,
  });
  y -= 4;
  drawRule(page, y);
  y -= 12;

  const trail = Array.isArray(params.auditTrail) ? params.auditTrail : [];
  // v1 truncates at 30 entries — typical signing has 4-6, so this is a
  // generous ceiling. v2 can paginate if any tenant ever needs it.
  const visible = trail.slice(0, 30);
  for (const entry of visible) {
    if (y < MARGIN + 80) break; // leave space for footer
    page.drawText(clip(entry.action || '', 18), {
      x: colActionX,
      y,
      size: 9,
      font: helv,
      color: COLOR_TEXT,
    });
    page.drawText(fmtTs(entry.at), {
      x: colTimeX,
      y,
      size: 9,
      font: helv,
      color: COLOR_TEXT,
    });
    page.drawText(clip(entry.ip || '', 18), {
      x: colIpX,
      y,
      size: 9,
      font: helv,
      color: COLOR_TEXT,
    });
    page.drawText(clip(entry.ua || '', 50), {
      x: colUaX,
      y,
      size: 7,
      font: helv,
      color: COLOR_MUTED,
    });
    y -= 14;
  }
  if (trail.length > visible.length) {
    page.drawText(`+ ${trail.length - visible.length} earlier event(s) recorded in the source database`, {
      x: MARGIN,
      y,
      size: 8,
      font: helv,
      color: COLOR_MUTED,
    });
    y -= 14;
  }

  // ── Footer ─────────────────────────────────────────────────────────
  const footerY = MARGIN;
  drawRule(page, footerY + 30);
  page.drawText(
    'This certificate is the legal record of this transaction. The audit trail above is sourced',
    { x: MARGIN, y: footerY + 18, size: 8, font: helv, color: COLOR_MUTED },
  );
  page.drawText(
    'from the AiSHA CRM signing_sessions database; the SHA-256 of the original PDF binds this',
    { x: MARGIN, y: footerY + 8, size: 8, font: helv, color: COLOR_MUTED },
  );
  page.drawText(
    `record to that document. Generated ${fmtTs(params.generatedAt || new Date())}.`,
    { x: MARGIN, y: footerY - 2, size: 8, font: helv, color: COLOR_MUTED },
  );

  return doc;
}

/**
 * Convenience: build the CoC and append it onto the given signed PDF
 * document, returning the merged Uint8Array.
 *
 * Saves with `useObjectStreams: false` for maximum reader/parser
 * compatibility (see signPdf.js for the rationale). The output of this
 * function is what gets uploaded to Supabase Storage and downloaded by
 * recipients + the operator-side "View signed PDF" link, so portability
 * matters more than the few KB of size optimisation.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} signedPdfBytes  signed PDF (no CoC yet)
 * @param {CoCParams} cocParams
 * @returns {Promise<Uint8Array>}
 */
export async function appendCertificateOfCompletion(signedPdfBytes, cocParams) {
  const signedDoc = await PDFDocument.load(signedPdfBytes, { ignoreEncryption: true });
  const cocDoc = await buildCertificateOfCompletion(cocParams);
  const cocPages = await signedDoc.copyPages(cocDoc, cocDoc.getPageIndices());
  for (const p of cocPages) signedDoc.addPage(p);
  return await signedDoc.save({ useObjectStreams: false });
}
