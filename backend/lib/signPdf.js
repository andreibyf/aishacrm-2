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
 *               height (clamped 6-14pt). Baseline aligned to the bottom
 *               of the area (+2px lift to clear descenders), because the
 *               visual underline on a typical signing-form line sits at
 *               the box's bottom edge — the recipient expects their typed
 *               value to rest on that line, not float above it.
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

import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';

/**
 * Signatures may render up to this multiple of the field box's height,
 * extending UPWARD past the box's top edge if the natural aspect ratio
 * needs more room than the box provides. 1.3 means a 25px-tall signature
 * box can render up to 32.5px tall (7.5px above the box top).
 *
 * Why: signatures are inherently wider-than-tall (the SignaturePad canvas
 * is now 6:1 to encourage this), but operators draw signature underlines
 * as thin strips — say 10:1 — so the natural signature aspect is still
 * narrower than the box aspect. Strict aspect-fit shrinks the signature
 * horizontally to fit, producing a small signature in a wide-short box.
 * Allowing modest upward overflow (anchored to the box's BOTTOM edge so
 * the signature still rests on the underline) lets the renderer scale
 * by width while letting the height spill into the white space above.
 *
 * Safe because trimSignature.js converted the canvas's white background
 * to alpha 0 — only the ink strokes render, not a white rectangle that
 * would obscure the line above. 1.3x is conservative: even on single-
 * line-spaced documents there's typically more than 30% of a line of
 * vertical white space above the underline (the descender-to-baseline
 * gap of the line above plus the underline's own padding).
 */
const SIGNATURE_HEIGHT_MULTIPLIER = 1.3;

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
 * pdf-lib font metrics for Helvetica.
 *
 * Sizing model: target = heightPx * 0.85, clamped to [8, 14]. The 0.85
 * factor (was 0.7) lets a moderately-thin box hold a comfortably-sized
 * font — important for inline fill-in-the-blank fields ("I, ____, the
 * ____ of ___") drawn against single-line-spaced sentences. The
 * operator wants to draw the field box as a thin strip along the
 * underline so the box doesn't visually crash into the line of text
 * above; the renderer compensates by sizing the font generously
 * relative to that thin strip.
 *
 * 8pt floor (was 6pt) keeps text legible even when the box is small —
 * 6pt was a "don't crash" floor for misuse; 8pt is the smallest size
 * comfortable to read on a printed contract. 14pt ceiling unchanged.
 *
 * If a recipient's typed value exceeds the box width at this font size,
 * pdf-lib's drawText `maxWidth` parameter wraps it onto a second line
 * (or truncates depending on pdf-lib version). For inline blanks the
 * value should almost always fit; for the rare overflow case the
 * operator can widen the box in the builder.
 *
 * @param {number} heightPx
 * @returns {number}
 */
export function fitFontSize(heightPx) {
  const target = heightPx * 0.85;
  return Math.max(8, Math.min(14, target));
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
 * Strip every interactive element from the loaded PDF:
 *   - /Annots on every page (link annotations, form widgets, sticky
 *     notes, anything clickable)
 *   - /AcroForm dictionary at the document root (any leftover form
 *     hierarchy after the page-level widgets are gone)
 *
 * Why this is mandatory, not optional
 * ===================================
 * Template PDFs uploaded by operators are often pre-processed in
 * third-party signing tools (free online "fill any PDF" services,
 * desktop apps that embed an AcroForm layer, etc.). Those tools embed
 * link annotations that point back to their own websites. When we
 * stamp signatures and ship the final PDF, the recipient clicks the
 * signature area expecting nothing to happen — and is silently
 * redirected to a third-party domain. Concrete case: a contract
 * template was prepared in a free eSign service that embeds widgets
 * with link actions to its homepage; the signed PDF retained those
 * widgets, and clicking the signature opened the third party's site.
 *
 * Beyond the obvious phishing risk (a malicious template author
 * embedding a credential-harvest URL), this also undermines the
 * legal integrity claim — a contract's content should be inert,
 * not a launchpad for arbitrary navigation. Standalone form fields
 * also break our stamping contract: the recipient never filled them
 * (they filled OUR Areas overlay), so they'd appear blank in PDF
 * readers that render AcroForm widgets on top of the page content.
 *
 * Implementation note: pdf-lib's PDFDict.delete is a no-op if the
 * key isn't present, so this is safe on PDFs that never had any
 * annotations to begin with.
 *
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @returns {void}
 */
export function stripPdfAnnotations(pdfDoc) {
  if (!pdfDoc) return;
  const pages = pdfDoc.getPages();
  for (const page of pages) {
    page.node.delete(PDFName.of('Annots'));
  }
  // Document-level AcroForm — Fields[] entries point to widgets we
  // just removed, but the dictionary itself is independent of those.
  // Strip it so PDF readers don't render any leftover form chrome.
  pdfDoc.catalog.delete(PDFName.of('AcroForm'));
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
      if (typeof area.page !== 'number' || area.page < 0 || area.page >= pages.length) {
        continue;
      }
      const page = pages[area.page];
      const { width, height } = page.getSize();
      const box = areaToPdfPixels(area, width, height);

      switch (field.type) {
        case 'signature': {
          const perFieldVal = lookupValue(field.name, fieldValues);
          const img = await getSignatureImage(typeof perFieldVal === 'string' ? perFieldVal : null);
          if (!img) break;
          // Preserve aspect ratio. Width is bounded by box.w; height is
          // bounded by box.h * SIGNATURE_HEIGHT_MULTIPLIER, allowing
          // modest upward overflow on thin signature underlines so the
          // ink fills more of the underline width without horizontal
          // shrinkage. See the constant's docblock for the full
          // rationale and safety analysis.
          const imgW = img.width;
          const imgH = img.height;
          const maxH = box.h * SIGNATURE_HEIGHT_MULTIPLIER;
          const scale = Math.min(box.w / imgW, maxH / imgH);
          const drawW = imgW * scale;
          const drawH = imgH * scale;
          // Anchor the bottom of the signature image to the bottom of
          // the box (the underline). If drawH > box.h, the top of the
          // image overflows upward into the white space above. The
          // transparent background (per trimSignature.js) keeps the
          // overflow visually clean — only ink renders, not a white
          // rectangle.
          const drawX = box.x + (box.w - drawW) / 2;
          const drawY = box.y;
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
          // Baseline-align to the bottom of the box. pdf-lib's y is the
          // glyph BASELINE, not the top. Templates draw the underline at
          // the bottom of the area, so the recipient's typed value should
          // rest there. +2px lift keeps descenders (g/j/p/q/y) just clear
          // of the line — same metric most browsers use for type=text.
          page.drawText(v, {
            x: box.x + 2,
            y: box.y + 2,
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
          // Baseline-aligned to bottom of box, same rationale as
          // text/name/email above.
          const fontSize = fitFontSize(box.h);
          page.drawText(dateStamp, {
            x: box.x + 2,
            y: box.y + 2,
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
  const signedAtDate = signedAt instanceof Date ? signedAt : new Date(signedAt || Date.now());

  const pdfDoc = await PDFDocument.load(originalPdf, {
    // Some templates have weird XRef tables; ignoreEncryption is for
    // password-protected PDFs (we'd reject those upstream but defending
    // here costs nothing).
    ignoreEncryption: true,
  });

  // Defensive sanitization: strip interactive annotations + AcroForm
  // BEFORE stamping. See stripPdfAnnotations docblock for the full
  // rationale — short version: third-party signing tools embed link
  // annotations in templates that survive into our signed output and
  // redirect recipients to external sites when they click on the
  // signature area.
  stripPdfAnnotations(pdfDoc);

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
