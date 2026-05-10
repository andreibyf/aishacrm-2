// @ts-check
/**
 * signingFieldCoords (4VD-43)
 * ===============================================================================
 *
 * Pure functions for converting between the browser pixel coordinates of a
 * rendered PDF.js canvas and the normalized field coordinates that the
 * in-house eSign engine stores on signing_templates.fields.
 *
 * Coordinate systems in play
 * ---------------------------------------------------------------------------
 *   1. pdf.js canvas: top-left origin, pixels. Each page rendered at scale S
 *      with viewport.width/height in CSS px.
 *   2. signing_templates.fields[].areas[]: top-left origin, normalized 0-1
 *      relative to the rendered page width/height. Each entry is shaped
 *      `{ page: number, x: 0..1, y: 0..1, w: 0..1, h: 0..1 }` with `x`/`y`
 *      being the top-left of the area and `w`/`h` the size, all measured as
 *      fractions of the page bounding box.
 *
 * Browser → wire format is straight division; no Y-flip needed because both
 * systems are top-left. The PDF spec uses bottom-left coordinates for
 * primitive content but the runtime renderer (pdf-lib for stamping, pdfjs
 * for preview) handles that conversion internally — the signing engine
 * works exclusively in top-left normalized space.
 *
 * Validation
 * ---------------------------------------------------------------------------
 * Inputs are validated: out-of-bounds or zero-size boxes throw so a typo in
 * the editor can't silently emit a malformed template. We coerce numbers to
 * finite values and clamp normalized output to [0, 1] before assertion.
 *
 * Pure module — no React, no DOM, no fetch. Targeted by Vitest in JSDOM and
 * by node:test for the parts the backend reuses (the field-payload builder
 * is shared between client and server validation).
 */

const FIELD_TYPES = Object.freeze([
  'name',
  'email',
  'signature',
  'date',
  'text',
  'checkbox',
]);

/**
 * @typedef {Object} PixelBox
 * @property {number} page  Zero-indexed page number
 * @property {number} x     Top-left X in CSS pixels relative to the page canvas
 * @property {number} y     Top-left Y in CSS pixels relative to the page canvas
 * @property {number} w     Width in CSS pixels
 * @property {number} h     Height in CSS pixels
 */

/**
 * @typedef {Object} PageDims
 * @property {number} widthPx   Rendered page width in CSS pixels
 * @property {number} heightPx  Rendered page height in CSS pixels
 */

/**
 * @typedef {Object} NormalizedArea
 * @property {number} page  Zero-indexed page number
 * @property {number} x     0..1, top-left
 * @property {number} y     0..1, top-left
 * @property {number} w     0..1
 * @property {number} h     0..1
 */

/**
 * @typedef {Object} BuilderField
 * @property {('name'|'email'|'signature'|'date'|'text'|'checkbox')} type
 * @property {string} name           Stable field id used to address values at signing time
 * @property {boolean} [required]    Defaults to true for signature, false otherwise
 * @property {string} [role]         Submitter role (defaults to 'First Party')
 * @property {PixelBox} box          Where the field is placed
 */

/**
 * @typedef {Object} SigningField
 * @property {string} name
 * @property {string} type
 * @property {boolean} required
 * @property {string} role
 * @property {NormalizedArea[]} areas
 */

/**
 * Throws if `value` is not a finite number.
 * @param {unknown} value
 * @param {string} label
 */
function assertFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number; got ${String(value)}`);
  }
}

/**
 * Convert a PixelBox (browser coords on the pdf.js canvas) to a
 * NormalizedArea (signing-engine wire format).
 *
 * @param {PixelBox} box
 * @param {PageDims} pageDims
 * @returns {NormalizedArea}
 */
export function pixelToNormalized(box, pageDims) {
  if (!box || typeof box !== 'object') {
    throw new TypeError('pixelToNormalized: box must be an object');
  }
  if (!pageDims || typeof pageDims !== 'object') {
    throw new TypeError('pixelToNormalized: pageDims must be an object');
  }
  assertFinite(box.x, 'box.x');
  assertFinite(box.y, 'box.y');
  assertFinite(box.w, 'box.w');
  assertFinite(box.h, 'box.h');
  assertFinite(box.page, 'box.page');
  assertFinite(pageDims.widthPx, 'pageDims.widthPx');
  assertFinite(pageDims.heightPx, 'pageDims.heightPx');

  if (!Number.isInteger(box.page) || box.page < 0) {
    throw new RangeError(`box.page must be a non-negative integer; got ${box.page}`);
  }
  if (pageDims.widthPx <= 0 || pageDims.heightPx <= 0) {
    throw new RangeError('pageDims width/height must be positive');
  }
  if (box.w <= 0 || box.h <= 0) {
    throw new RangeError(`box w/h must be positive; got w=${box.w} h=${box.h}`);
  }
  if (box.x < 0 || box.y < 0) {
    throw new RangeError(`box x/y must be non-negative; got x=${box.x} y=${box.y}`);
  }
  if (box.x + box.w > pageDims.widthPx + 0.5 || box.y + box.h > pageDims.heightPx + 0.5) {
    // 0.5px slack accommodates sub-pixel rounding from react-rnd while still
    // catching obviously out-of-bounds boxes.
    throw new RangeError(
      `box extends past page bounds: x+w=${box.x + box.w}/${pageDims.widthPx}, ` +
        `y+h=${box.y + box.h}/${pageDims.heightPx}`,
    );
  }

  // Clamp tiny float overruns into [0, 1] so the wire payload is always valid.
  const clamp = (v) => Math.min(1, Math.max(0, v));

  return {
    page: box.page,
    x: clamp(box.x / pageDims.widthPx),
    y: clamp(box.y / pageDims.heightPx),
    w: clamp(box.w / pageDims.widthPx),
    h: clamp(box.h / pageDims.heightPx),
  };
}

/**
 * Inverse of pixelToNormalized — used by the editor when loading an existing
 * template back into the canvas.
 *
 * @param {NormalizedArea} area
 * @param {PageDims} pageDims
 * @returns {PixelBox}
 */
export function normalizedToPixel(area, pageDims) {
  if (!area || typeof area !== 'object') {
    throw new TypeError('normalizedToPixel: area must be an object');
  }
  if (!pageDims || typeof pageDims !== 'object') {
    throw new TypeError('normalizedToPixel: pageDims must be an object');
  }
  assertFinite(area.x, 'area.x');
  assertFinite(area.y, 'area.y');
  assertFinite(area.w, 'area.w');
  assertFinite(area.h, 'area.h');
  assertFinite(area.page, 'area.page');
  assertFinite(pageDims.widthPx, 'pageDims.widthPx');
  assertFinite(pageDims.heightPx, 'pageDims.heightPx');

  if (!Number.isInteger(area.page) || area.page < 0) {
    throw new RangeError(`area.page must be a non-negative integer; got ${area.page}`);
  }

  // Don't reject [0,1] overruns silently — caller likely has a corrupt area;
  // surface it.
  for (const k of /** @type {const} */ (['x', 'y', 'w', 'h'])) {
    if (area[k] < 0 || area[k] > 1) {
      throw new RangeError(`area.${k} must be in [0,1]; got ${area[k]}`);
    }
  }

  return {
    page: area.page,
    x: area.x * pageDims.widthPx,
    y: area.y * pageDims.heightPx,
    w: area.w * pageDims.widthPx,
    h: area.h * pageDims.heightPx,
  };
}

/**
 * Default required-flag per field type. Signatures must be filled; everything
 * else is optional unless overridden.
 *
 * @param {string} type
 * @returns {boolean}
 */
function defaultRequired(type) {
  return type === 'signature';
}

/**
 * Validate a single BuilderField and return the signing-engine wire entry.
 *
 * @param {BuilderField} field
 * @param {Map<number, PageDims>} pageDimsByPage
 * @returns {SigningField}
 */
export function builderFieldToSigning(field, pageDimsByPage) {
  if (!field || typeof field !== 'object') {
    throw new TypeError('builderFieldToSigning: field must be an object');
  }
  if (!FIELD_TYPES.includes(field.type)) {
    throw new RangeError(
      `unsupported field type: ${field.type}; allowed: ${FIELD_TYPES.join(', ')}`,
    );
  }
  if (typeof field.name !== 'string' || field.name.trim().length === 0) {
    throw new TypeError('field.name must be a non-empty string');
  }
  if (!field.box) {
    throw new TypeError('field.box is required');
  }

  const pageDims = pageDimsByPage.get(field.box.page);
  if (!pageDims) {
    throw new RangeError(
      `no pageDims registered for page ${field.box.page}; saw ${[...pageDimsByPage.keys()].join(',')}`,
    );
  }

  return {
    name: field.name.trim(),
    type: field.type,
    required: typeof field.required === 'boolean' ? field.required : defaultRequired(field.type),
    role: typeof field.role === 'string' && field.role.length > 0 ? field.role : 'First Party',
    areas: [pixelToNormalized(field.box, pageDims)],
  };
}

/**
 * Build the full `fields` array for a POST /api/templates request body.
 *
 * @param {BuilderField[]} fields
 * @param {Map<number, PageDims>} pageDimsByPage
 * @returns {SigningField[]}
 */
export function buildSigningFieldsPayload(fields, pageDimsByPage) {
  if (!Array.isArray(fields)) {
    throw new TypeError('fields must be an array');
  }
  if (!(pageDimsByPage instanceof Map)) {
    throw new TypeError('pageDimsByPage must be a Map<number, PageDims>');
  }
  if (fields.length === 0) {
    throw new RangeError('fields array must not be empty');
  }
  const seenNames = new Set();
  const out = fields.map((f) => {
    const signingField = builderFieldToSigning(f, pageDimsByPage);
    if (seenNames.has(signingField.name)) {
      throw new RangeError(`duplicate field name: ${signingField.name}`);
    }
    seenNames.add(signingField.name);
    return signingField;
  });
  return out;
}

export const __FIELD_TYPES__ = FIELD_TYPES;
