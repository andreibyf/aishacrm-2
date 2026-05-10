// @ts-check
/**
 * signPdf (4VD-43 day 5).
 *
 * Pure stamping pipeline: takes the original template PDF + template field
 * definitions + recipient-supplied values + the server-side signed_at
 * timestamp, returns a new PDF Uint8Array with values stamped into each
 * field's normalised box.
 *
 * Coordinate systems
 * ==================
 * Template fields use top-left-origin normalised areas in [0,1] (per
 * src/lib/signingFieldCoords.js):
 *   { page, x, y, w, h }
 * pdf-lib uses bottom-left-origin pixel coordinates. We convert:
 *   x_pdf = area.x * width
 *   y_pdf = height - (area.y + area.h) * height
 * That puts the box's top-left corner at the right pixel and lets pdf-lib
 * size from there.
 *
 * Field semantics (v1)
 * ====================
 *   signature → embed PNG of the recipient's signature; falls back to the
 *               session-level signatureDataUrl if no per-field value.
 *   text / name / email → drawText with Helvetica sized to fit the area
 *               height (clamped 6-14pt). Top-aligned within the area.
 *   checkbox  → drawText 'X' centered in the area when value is truthy.
 *   date      → ALWAYS stamps the server-side signed_at, NEVER the
 *               recipient-typed value. ESIGN/eIDAS admissibility: the
 *               "DATE: ___" lines on a contract are legally the date the
 *               document was executed, not whatever the signer typed.
 *               Format: MM/DD/YYYY in the recipient's UTC offset (we don't
 *               know their tz; UTC is the safe legal default).
 *
 * Failure modes
 * =============
 * Throws on unparseable PDF input or on any pdf-lib error. The caller
 * (public-sign.js submit handler) catches and returns 500; the
 * signing_sessions row stays at status='signed' so the legal record of
 * intent-to-sign is preserved even when stamping fails. Re-running the
 * stamp on a fresh request would idempotently produce the same output
 * provided the inputs are identical.
 *
 * Out of scope (v2):
 *   - Field rotation / non-axis-aligned boxes
 *   - Multi-line text wrapping inside a small box
 *   - Custom font embedding (we use the 14 standard PDF fonts only)
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * @typedef {Object} TemplateField
 * @property {string} name
 * @property {'signature'|'text'|'name'|'email'|'date'|'checkbox'} type
 * @property {Array<{ page: number, x: number, y: number, w: number, h: number }>} areas
 * @property {boolean} [required]
 */

/**
 * Format a Date as MM/DD/YYYY using the given timezone (defaults to UTC).
 * Pure helper so the caller can override tz for tenant-local stamping
 * (the Day-4 due-date helper already uses Intl.DateTimeFormat for that).
 *
 * @param {Date} d
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatDateMMDDYYYY(d, timeZone = 'UTC') {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-US returns "MM/DD/YYYY" already; we just take it as-is.
  return fmt.format(d);
}

/**
 * Decode a `data:image/png;base64,...` (or octet-stream-encoded) data URL
 * into a Uint8Array suitable for pdf-lib's embedPng.
 *
 * @param {string} dataUrl
 * @returns {Uint8Array}
 */
export function decodeDataUrlPng(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new TypeError('signature_data_url must be a data: URL');
  }
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new TypeError('signature_data_url is malformed (no comma)');
  }
  const header = dataUrl.slice(0, commaIdx);
  if (!header.includes('base64')) {
    throw new TypeError('signature_data_url must be base64-encoded');
  }
  const b64 = dataUrl.slice(commaIdx + 1);
  const buf = Buffer.from(b64, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Compute font size that fits a box of `heightPx` pixels at the standard
 * pdf-lib font metrics for Helvetica. We aim for ~70% of box height as
 * the cap-height; clamp to a sane min/max so a tiny box doesn't get
 * unreadable 2pt text and a giant box doesn't get a 60pt heading.
 *
 * @param {number} heightPx
 * @returns {number}
 */
export function fitFontSize(heightPx) {
  const target = heightPx * 0.7;
  return Math.max(6, Math.min(14, target));
}

/**
 * Resolve a value for a non-signature field from the recipient-supplied
 * field_values bag. Returns undefined when nothing was provided so the
 * caller can decide whether to stamp blank (most types) or skip (date,
 * which always stamps signed_at).
 *
 * @param {string} fieldName
 * @param {Record<string, unknown>} fieldValues
 * @returns {unknown}
 */
function lookupValue(fieldName, fieldValues) {
  if (!fieldValues) return undefined;
  return fieldValues[fieldName];
}

/**
 * Convert a normalised top-left-origin area to pdf-lib's bottom-left-origin
 * pixel coordinates for a page of widthPx × heightPx.
 *
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
function areaToPdfPixels(area, widthPx, heightPx) {
  const x = area.x * widthPx;
  const w = area.w * widthPx;
  const h = area.h * heightPx;
  // top-of-box in PDF coords = page height - top-of-box in top-left coords
  // top-of-box in top-left coords = area.y * heightPx
  // bottom-of-box in PDF coords = page height - (area.y + area.h) * heightPx
  const y = heightPx - (area.y + area.h) * heightPx;
  return { x, y, w, h };
}

/**
 * Stamp every template field onto its page. Mutates `pdfDoc` in place.
 *
 * @param {object} params
 * @param {import('pdf-lib').PDFDocument} params.pdfDoc
 * @param {TemplateField[]} params.fields
 * @param {Record<string, unknown>} params.fieldValues
 * @param {string|null} params.signatureDataUrl   single-signer fallback
 * @param {Date} params.signedAt                  server-side timestamp
 * @param {string} [params.dateTimezone]          IANA zone for date stamping; default UTC
 */
async function stampFields({
  pdfDoc,
  fields,
  fieldValues,
  signatureDataUrl,
  signedAt,
  dateTimezone = 'UTC',
}) {
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  // Embed signature once (lazy — only if we'll need it). Reused across
  // multiple signature fields in the same document.
  let cachedSignatureImage = null;
  /** @returns {Promise<import('pdf-lib').PDFImage|null>} */
  async function getSignatureImage(perFieldDataUrl) {
    const dataUrl = perFieldDataUrl || signatureDataUrl;
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    if (cachedSignatureImage && dataUrl === signatureDataUrl) {
      return cachedSignatureImage;
    }
    try {
      const bytes = decodeDataUrlPng(dataUrl);
      const img = await pdfDoc.embedPng(bytes);
      if (dataUrl === signatureDataUrl) {
        cachedSignatureImage = img;
      }
      return img;
    } catch {
      return null;
    }
  }

  const dateStamp = formatDateMMDDYYYY(signedAt, dateTimezone);

  for (const field of fields || []) {
    if (!field || !Array.isArray(field.areas) || field.areas.length === 0) {
      continue;
    }
    for (const area of field.areas) {
      if (
        typeof area.page !== 'number' ||
        area.page < 0 ||
        area.page >= pages.length
      ) {
        continue;
      }
      const page = pages[area.page];
      const { width, height } = page.getSize();
      const box = areaToPdfPixels(area, width, height);

      switch (field.type) {
        case 'signature': {
          const perFieldVal = lookupValue(field.name, fieldValues);
          const img = await getSignatureImage(
            typeof perFieldVal === 'string' ? perFieldVal : null,
          );
          if (!img) break;
          // Preserve aspect ratio: scale image to fit inside the box.
          const imgW = img.width;
          const imgH = img.height;
          const scale = Math.min(box.w / imgW, box.h / imgH);
          const drawW = imgW * scale;
          const drawH = imgH * scale;
          const drawX = box.x + (box.w - drawW) / 2;
          const drawY = box.y + (box.h - drawH) / 2;
          page.drawImage(img, {
            x: drawX,
            y: drawY,
            width: drawW,
            height: drawH,
          });
          break;
        }

        case 'text':
        case 'name':
        case 'email': {
          const v = lookupValue(field.name, fieldValues);
          if (typeof v !== 'string' || v.length === 0) break;
          const fontSize = fitFontSize(box.h);
          // Position text near top of box (pdf-lib y is the BASELINE).
          // Place baseline at y + h - fontSize so cap-height sits inside.
          page.drawText(v, {
            x: box.x + 2,
            y: box.y + box.h - fontSize,
            size: fontSize,
            font: helv,
            color: rgb(0, 0, 0),
            maxWidth: Math.max(0, box.w - 4),
          });
          break;
        }

        case 'checkbox': {
          const v = lookupValue(field.name, fieldValues);
          if (!v) break;
          const fontSize = fitFontSize(box.h);
          page.drawText('X', {
            x: box.x + box.w / 2 - fontSize / 3,
            y: box.y + box.h / 2 - fontSize / 3,
            size: fontSize,
            font: helv,
            color: rgb(0, 0, 0),
          });
          break;
        }

        case 'date': {
          // Always server-stamped. Recipient-typed value is intentionally
          // discarded — see file-level docblock for the legal rationale.
          const fontSize = fitFontSize(box.h);
          page.drawText(dateStamp, {
            x: box.x + 2,
            y: box.y + box.h - fontSize,
            size: fontSize,
            font: helv,
            color: rgb(0, 0, 0),
            maxWidth: Math.max(0, box.w - 4),
          });
          break;
        }

        default:
          // Unknown field type — silently skip rather than blow up the
          // whole stamp. Validation on template create rejects unknown
          // types anyway, so this only fires on data-corruption paths.
          break;
      }
    }
  }
}

/**
 * Public entrypoint. Stamp the recipient's responses onto the original
 * template PDF and return the signed PDF bytes.
 *
 * @param {object} params
 * @param {Buffer|Uint8Array|ArrayBuffer} params.originalPdf
 * @param {TemplateField[]} params.fields
 * @param {Record<string, unknown>} params.fieldValues
 * @param {string|null} [params.signatureDataUrl]
 * @param {string} params.signerName              for embedding into PDF metadata
 * @param {Date|string} params.signedAt           server-side timestamp
 * @param {string} [params.dateTimezone]
 * @param {string} [params.title]                 PDF title metadata; defaults to "Signed document"
 * @returns {Promise<Uint8Array>}
 */
export async function signPdf({
  originalPdf,
  fields,
  fieldValues,
  signatureDataUrl = null,
  signerName,
  signedAt,
  dateTimezone = 'UTC',
  title = 'Signed document',
}) {
  if (!originalPdf) throw new TypeError('originalPdf is required');
  const signedAtDate =
    signedAt instanceof Date ? signedAt : new Date(signedAt || Date.now());

  const pdfDoc = await PDFDocument.load(originalPdf, {
    // Some templates have weird XRef tables; ignoreEncryption is for
    // password-protected PDFs (we'd reject those upstream but defending
    // here costs nothing).
    ignoreEncryption: true,
  });

  await stampFields({
    pdfDoc,
    fields: Array.isArray(fields) ? fields : [],
    fieldValues: fieldValues || {},
    signatureDataUrl,
    signedAt: signedAtDate,
    dateTimezone,
  });

  // Embed metadata for legal traceability. Pdf-lib's setX methods are
  // safe to call multiple times; values are written into the document's
  // info dictionary on save.
  pdfDoc.setTitle(title);
  if (signerName) pdfDoc.setAuthor(signerName);
  pdfDoc.setSubject(`Signed by ${signerName || '(anonymous)'} at ${signedAtDate.toISOString()}`);
  pdfDoc.setProducer('AiSHA CRM eSign engine (4VD-43)');
  pdfDoc.setCreationDate(signedAtDate);
  pdfDoc.setModificationDate(signedAtDate);

  // useObjectStreams: false produces a slightly larger PDF but maximally
  // compatible with all PDF readers + text-extraction tools. pdf-lib's
  // default object-stream encoding is valid PDF 1.5+ but trips pdf.js
  // forks (pdf-parse) on the FlateDecode pass. Recipients open these
  // PDFs in Adobe / Preview / Chrome's built-in viewer; the size delta
  // is negligible (a few KB on a typical document).
  return await pdfDoc.save({ useObjectStreams: false });
}
