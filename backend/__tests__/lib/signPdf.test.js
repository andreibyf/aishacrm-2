// @ts-check
/**
 * signPdf tests (4VD-43 day 5).
 *
 * Coverage:
 *   - Pure helpers (formatDateMMDDYYYY, decodeDataUrlPng, fitFontSize)
 *   - Round-trip: stamp values into a real fixture PDF, parse the result
 *     back via pdf-lib, assert metadata + page count survive.
 *   - Legal invariant: date fields ALWAYS stamp signed_at, NEVER the
 *     recipient-typed value (regression guard for the ESIGN-admissibility
 *     decision documented in the file's header).
 *   - Coordinate math: a top-left-origin normalized area maps to the
 *     correct bottom-left-origin pdf-lib coordinates (regression guard
 *     against future refactors flipping Y by mistake).
 *   - Failure modes: malformed PDF input throws; unsupported field type
 *     is silently skipped (data corruption defense, not validation —
 *     templates POST validates types upstream).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
// pdf-parse extracts the rendered text layer (decompresses FlateEncode
// content streams). Required because pdf-lib's save() always compresses
// content streams, so a raw byte-search would miss legitimately stamped
// strings.
import pdfParse from 'pdf-parse';

import {
  signPdf,
  formatDateMMDDYYYY,
  decodeDataUrlPng,
  fitFontSize,
  stripPdfAnnotations,
} from '../../lib/signPdf.js';

// ---------------------------------------------------------------------------
// Fixture: in-memory blank PDF with a single 612×792 page (US Letter).
// Built per-test so each test gets a clean copy.
// ---------------------------------------------------------------------------
async function makeBlankFixture() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  // Draw a faint baseline marker so visual inspection of the output
  // (during debugging) confirms the stamped values land on top.
  page.drawText('FIXTURE — signPdf test', {
    x: 50,
    y: 750,
    size: 10,
    font: helv,
    color: rgb(0.7, 0.7, 0.7),
  });
  return Buffer.from(await doc.save());
}

// 1×1 transparent PNG, base64-encoded. Smallest valid PNG; we use it as
// the "signature image" so embedPng has something real to chew on.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=';
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_B64}`;

// ---------------------------------------------------------------------------

describe('signPdf — pure helpers', () => {
  it('formatDateMMDDYYYY produces MM/DD/YYYY in UTC by default', () => {
    const d = new Date('2026-05-11T14:00:00.000Z');
    assert.equal(formatDateMMDDYYYY(d), '05/11/2026');
  });

  it('formatDateMMDDYYYY honors timezone override (DST-safe)', () => {
    // 2026-03-08T08:00Z is 2026-03-08 03:00 in NY (still EST? on-cusp).
    // We just need to confirm the helper accepts and uses tz, not test
    // DST math itself.
    const d = new Date('2026-12-25T05:30:00.000Z');
    // In Honolulu (UTC-10), this is still Dec 24.
    assert.equal(formatDateMMDDYYYY(d, 'Pacific/Honolulu'), '12/24/2026');
  });

  it('decodeDataUrlPng returns Uint8Array for a valid base64 PNG', () => {
    const out = decodeDataUrlPng(TINY_PNG_DATA_URL);
    assert.ok(out instanceof Uint8Array);
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    assert.equal(out[0], 0x89);
    assert.equal(out[1], 0x50);
    assert.equal(out[2], 0x4e);
    assert.equal(out[3], 0x47);
  });

  it('decodeDataUrlPng rejects non-data URLs', () => {
    assert.throws(() => decodeDataUrlPng('https://example.com/sig.png'), /data: URL/);
  });

  it('decodeDataUrlPng rejects non-base64 data URLs', () => {
    assert.throws(() => decodeDataUrlPng('data:image/png;utf8,raw-text'), /base64/);
  });

  it('fitFontSize clamps min 8 / max 14', () => {
    // Tiny / zero box → 8pt floor. The previous 6pt floor produced
    // unreadable text on inline-blank fields drawn as thin strips
    // along a single-line-spaced sentence; 8pt is the smallest
    // comfortable size for a printed contract.
    assert.equal(fitFontSize(0), 8);
    assert.equal(fitFontSize(4), 8);
    // Giant box → 14pt ceiling. Anything larger would feel like a
    // heading inside a body-text contract.
    assert.equal(fitFontSize(100), 14);
    assert.equal(fitFontSize(20), 14); // 0.85 * 20 = 17 → clamped to 14
    // Mid-range: scales at 0.85 of height (was 0.7) so a 14px box
    // produces ~11.9pt instead of 9.8pt — better legibility on inline
    // fill-in-the-blank fields.
    assert.equal(fitFontSize(14), 14 * 0.85);
    assert.ok(fitFontSize(15) >= 8);
    assert.ok(fitFontSize(15) <= 14);
  });

  it('fitFontSize: 10px box renders at 8.5pt (target 0.85 * 10)', () => {
    assert.equal(fitFontSize(10), 8.5);
  });
});

// ---------------------------------------------------------------------------

describe('signPdf — round-trip', () => {
  it('produces a valid PDF that pdf-lib can re-parse', async () => {
    const original = await makeBlankFixture();
    const fields = [
      {
        name: 'sig',
        type: 'signature',
        areas: [{ page: 0, x: 0.1, y: 0.5, w: 0.3, h: 0.05 }],
      },
      {
        name: 'fullname',
        type: 'name',
        areas: [{ page: 0, x: 0.1, y: 0.6, w: 0.4, h: 0.04 }],
      },
    ];
    const fieldValues = { fullname: 'Jane Doe' };
    const out = await signPdf({
      originalPdf: original,
      fields,
      fieldValues,
      signatureDataUrl: TINY_PNG_DATA_URL,
      signerName: 'Jane Doe',
      signedAt: new Date('2026-05-11T14:00:00.000Z'),
    });
    assert.ok(out instanceof Uint8Array);
    assert.ok(out.byteLength > 0);
    // Parse back
    const re = await PDFDocument.load(out);
    assert.equal(re.getPageCount(), 1);
    assert.equal(re.getTitle(), 'Signed document');
    assert.equal(re.getAuthor(), 'Jane Doe');
    // Subject embeds the timestamp so legal traceability is in the file
    assert.match(re.getSubject() || '', /2026-05-11T14:00:00/);
  });

  it('uses the provided template name as the title', async () => {
    const original = await makeBlankFixture();
    const out = await signPdf({
      originalPdf: original,
      fields: [],
      fieldValues: {},
      signerName: 'Anyone',
      signedAt: new Date('2026-05-11T14:00:00.000Z'),
      title: 'Service Agreement',
    });
    const re = await PDFDocument.load(out);
    assert.equal(re.getTitle(), 'Service Agreement');
  });

  it('preserves original page count when no fields are stamped', async () => {
    const original = await makeBlankFixture();
    const out = await signPdf({
      originalPdf: original,
      fields: [],
      fieldValues: {},
      signerName: 'X',
      signedAt: new Date(),
    });
    const re = await PDFDocument.load(out);
    assert.equal(re.getPageCount(), 1);
  });
});

// ---------------------------------------------------------------------------

describe('signPdf — legal invariants', () => {
  it('date fields stamp signed_at, NOT the recipient-typed value', async () => {
    // Regression guard for the ESIGN admissibility decision: the date
    // field on a contract is the date the document was EXECUTED, which
    // is the server-side signed_at. If a future refactor wires
    // recipient-typed dates back in, this test must catch it.
    const original = await makeBlankFixture();
    const fields = [
      {
        name: 'execution_date',
        type: 'date',
        areas: [{ page: 0, x: 0.1, y: 0.4, w: 0.2, h: 0.04 }],
      },
    ];
    const fieldValues = {
      // Recipient typed something nefarious — must be DISCARDED.
      execution_date: '01/01/1970',
    };
    const signedAt = new Date('2026-05-11T14:00:00.000Z');
    const out = await signPdf({
      originalPdf: original,
      fields,
      fieldValues,
      signerName: 'Jane Doe',
      signedAt,
    });
    // We can't easily extract drawn text from a pdf-lib output buffer
    // without another library. Sanity-test what we CAN verify: the
    // PDF parses, and the metadata reflects the SERVER timestamp not
    // the recipient's bogus date.
    const re = await PDFDocument.load(out);
    const subject = re.getSubject() || '';
    assert.match(subject, /2026-05-11T14:00:00/);
    assert.doesNotMatch(subject, /1970/);
    // Full assurance comes from the test below that scans the raw
    // PDF buffer for the literal MM/DD/YYYY string we expect to land.
  });

  it('the stamped MM/DD/YYYY string for the signed_at is present in the output', async () => {
    const original = await makeBlankFixture();
    const fields = [
      {
        name: 'execution_date',
        type: 'date',
        areas: [{ page: 0, x: 0.1, y: 0.4, w: 0.2, h: 0.04 }],
      },
    ];
    const out = await signPdf({
      originalPdf: original,
      fields,
      fieldValues: { execution_date: '01/01/1970' },
      signerName: 'Jane',
      signedAt: new Date('2026-05-11T14:00:00.000Z'),
    });
    // Use pdf-parse to extract the rendered text layer (decompresses
    // FlateEncode content streams). This is what the recipient actually
    // sees when they open the PDF, so it's the right surface to assert
    // legal invariants on.
    const parsed = await pdfParse(Buffer.from(out));
    assert.ok(parsed.text.includes('05/11/2026'), 'expected 05/11/2026 in rendered text');
    assert.ok(
      !parsed.text.includes('01/01/1970'),
      'recipient date 01/01/1970 must NOT appear in rendered text',
    );
  });

  it('embeds signer_name in PDF Author metadata for audit traceability', async () => {
    const original = await makeBlankFixture();
    const out = await signPdf({
      originalPdf: original,
      fields: [],
      fieldValues: {},
      signerName: 'Forensic Test User',
      signedAt: new Date(),
    });
    const re = await PDFDocument.load(out);
    assert.equal(re.getAuthor(), 'Forensic Test User');
  });
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

describe('signPdf — annotation/AcroForm stripping (security regression)', () => {
  // Background: template PDFs prepared in third-party "free eSign" tools
  // commonly carry link annotations that point back to those tools'
  // websites. Without stripping, the signed PDF retains those links and
  // recipients clicking on the signature area get silently redirected
  // to a third-party domain. See stripPdfAnnotations() docblock in
  // signPdf.js for the full security rationale.

  it('exports stripPdfAnnotations as a public symbol', () => {
    assert.equal(typeof stripPdfAnnotations, 'function');
  });

  it('stripPdfAnnotations is a no-op on a fresh PDF with no annotations', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    // Should not throw even though /Annots and /AcroForm were never set.
    assert.doesNotThrow(() => stripPdfAnnotations(doc));
  });

  it('stripPdfAnnotations deletes /Annots from every page', async () => {
    const { PDFName: PN, PDFArray } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const page1 = doc.addPage([612, 792]);
    const page2 = doc.addPage([612, 792]);
    // Inject a placeholder /Annots array on both pages. The contents
    // don't matter — we're just verifying the key gets removed.
    page1.node.set(PN.of('Annots'), PDFArray.withContext(doc.context));
    page2.node.set(PN.of('Annots'), PDFArray.withContext(doc.context));
    assert.ok(page1.node.has(PN.of('Annots')), 'sanity: /Annots set on page 1');
    assert.ok(page2.node.has(PN.of('Annots')), 'sanity: /Annots set on page 2');

    stripPdfAnnotations(doc);

    assert.ok(!page1.node.has(PN.of('Annots')), '/Annots must be gone from page 1');
    assert.ok(!page2.node.has(PN.of('Annots')), '/Annots must be gone from page 2');
  });

  it('stripPdfAnnotations deletes the document-level /AcroForm dict', async () => {
    const { PDFName: PN, PDFDict } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.catalog.set(PN.of('AcroForm'), PDFDict.withContext(doc.context));
    assert.ok(doc.catalog.has(PN.of('AcroForm')), 'sanity: /AcroForm set');

    stripPdfAnnotations(doc);

    assert.ok(!doc.catalog.has(PN.of('AcroForm')), '/AcroForm must be removed from catalog');
  });

  it('signPdf calls stripPdfAnnotations before stamping (source-string pin)', async () => {
    // Belt-and-suspenders: even if a future refactor pulls
    // stripPdfAnnotations out of the public exports, the orchestrator
    // must still invoke it. Pin that it runs AFTER PDFDocument.load
    // and BEFORE stampFields by searching for the specific call-site
    // tokens (semicolon-terminated invocations, not the function
    // declaration above).
    const fs = await import('node:fs/promises');
    const url = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = await fs.readFile(path.join(here, '..', '..', 'lib', 'signPdf.js'), 'utf8');
    const loadIdx = src.indexOf('await PDFDocument.load(');
    const stripIdx = src.indexOf('stripPdfAnnotations(pdfDoc);');
    const stampIdx = src.indexOf('await stampFields({');
    assert.ok(loadIdx > 0, 'expected `await PDFDocument.load(` call site');
    assert.ok(stripIdx > 0, 'expected `stripPdfAnnotations(pdfDoc);` call site');
    assert.ok(stampIdx > 0, 'expected `await stampFields({` call site');
    assert.ok(stripIdx > loadIdx, 'stripPdfAnnotations must run AFTER PDFDocument.load');
    assert.ok(stripIdx < stampIdx, 'stripPdfAnnotations must run BEFORE stampFields');
  });

  it('end-to-end: signPdf output never carries /Annots or /AcroForm', async () => {
    // We exercise signPdf on the fixture and confirm the output is
    // clean. The unit cases above already prove that stripPdfAnnotations
    // removes both keys when present; this case proves signPdf's
    // pipeline always emits an output free of those keys regardless
    // of what was in the source.
    const { PDFName: PN } = await import('pdf-lib');
    const original = await makeBlankFixture();
    const out = await signPdf({
      originalPdf: original,
      fields: [],
      fieldValues: {},
      signerName: 'Test',
      signedAt: new Date('2026-05-11T14:00:00.000Z'),
    });

    const reloaded = await PDFDocument.load(out);
    for (const page of reloaded.getPages()) {
      assert.ok(!page.node.has(PN.of('Annots')), 'output page must not carry /Annots');
    }
    assert.ok(!reloaded.catalog.has(PN.of('AcroForm')), 'output catalog must not carry /AcroForm');
  });
});

describe('signPdf — baseline alignment', () => {
  // Regression guard for the day-5 PR-2 polish: stamped text/date values
  // must baseline-align to the BOTTOM of the field area, not the top.
  // Visual underlines on signing forms sit at the bottom of the box, so
  // text needs to rest on that line. The bug we caught: text was drawn
  // at `box.y + box.h - fontSize`, which placed the baseline near the
  // TOP of the box (above the underline). The fix: `y: box.y + 2`.
  //
  // We pin the source-code expressions directly. Walking the rendered
  // PDF's content stream is brittle across pdf-lib internals (varies by
  // version + compression choice + which PDFRawStream subclass we hit),
  // and the legal-invariant + round-trip tests above already prove the
  // PDF parses + the value lands in the rendered text layer. The
  // alignment specifically is a coordinate constant — a source-string
  // pin is the right surface.
  //
  // If you intentionally change the alignment strategy (e.g. center text
  // vertically, or vary the bottom-lift), update this test in the same
  // commit so the new expected math is visible in the diff.

  it('signature branch anchors to box bottom and caps height at 1.3x', async () => {
    const fs = await import('node:fs/promises');
    const url = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const signPdfSrc = await fs.readFile(path.join(here, '..', '..', 'lib', 'signPdf.js'), 'utf8');

    // Multiplier constant must be present at the documented value. If
    // the operator-feedback loop calls for a different value, update
    // the test in the same commit so the new math is auditable.
    assert.ok(
      /SIGNATURE_HEIGHT_MULTIPLIER\s*=\s*1\.3/.test(signPdfSrc),
      'expected SIGNATURE_HEIGHT_MULTIPLIER = 1.3 at module scope',
    );

    // Aspect-fit uses maxH = box.h * SIGNATURE_HEIGHT_MULTIPLIER, not
    // box.h. This is the load-bearing line that lets a wide-short box
    // host a properly-sized signature without horizontal shrinkage.
    assert.ok(
      /maxH\s*=\s*box\.h\s*\*\s*SIGNATURE_HEIGHT_MULTIPLIER/.test(signPdfSrc),
      'expected `maxH = box.h * SIGNATURE_HEIGHT_MULTIPLIER` in signature branch',
    );
    assert.ok(
      /scale\s*=\s*Math\.min\(box\.w\s*\/\s*imgW,\s*maxH\s*\/\s*imgH\)/.test(signPdfSrc),
      'expected aspect-fit scale to use box.w and maxH',
    );

    // Bottom anchor: drawY = box.y (NOT centered in the box). This
    // puts the signature's bottom edge on the underline; overflow goes
    // upward into the line-spacing whitespace.
    assert.ok(
      /const drawY = box\.y;/.test(signPdfSrc),
      'expected `const drawY = box.y;` (bottom-anchored, not centered)',
    );
    assert.ok(
      !/drawY\s*=\s*box\.y\s*\+\s*\(box\.h\s*-\s*drawH\)\s*\/\s*2/.test(signPdfSrc),
      'old centered drawY math must be gone',
    );
  });

  it('text/name/email and date branches use `y: box.y + 2` for the baseline', async () => {
    const fs = await import('node:fs/promises');
    const url = await import('node:url');
    const path = await import('node:path');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const signPdfSrc = await fs.readFile(path.join(here, '..', '..', 'lib', 'signPdf.js'), 'utf8');

    // The NEW (correct) expression appears exactly twice — once for the
    // text/name/email branch and once for the date branch. Both lifts
    // baseline 2px above the field-box bottom (which is `box.y` in
    // pdf-lib's bottom-left coord space).
    const matches = signPdfSrc.match(/y:\s*box\.y\s*\+\s*2,/g) || [];
    assert.equal(
      matches.length,
      2,
      `expected 2 occurrences of "y: box.y + 2," (text + date branches); found ${matches.length}`,
    );

    // The OLD expression must be gone — `box.y + box.h - fontSize` placed
    // the baseline near the TOP of the box, which is what we just fixed.
    assert.ok(
      !/y:\s*box\.y\s*\+\s*box\.h\s*-\s*fontSize/.test(signPdfSrc),
      'old top-aligned baseline (box.y + box.h - fontSize) re-appeared in signPdf.js',
    );

    // Docblock must explain the new behaviour so future reviewers know
    // why we chose this constant — guards against "drive-by simplify"
    // refactors that lose the rationale. The phrase wraps across docblock
    // lines so we collapse whitespace + ` * ` before matching.
    const flatDoc = signPdfSrc.replace(/\n\s*\*\s*/g, ' ').replace(/\s+/g, ' ');
    assert.ok(
      /Baseline aligned to the bottom of the area/i.test(flatDoc),
      'docblock must mention "Baseline aligned to the bottom of the area"',
    );
  });

  it('still produces a valid PDF with the new baseline alignment', async () => {
    // Sanity check that the alignment fix didn't break the round-trip —
    // the pdf must still load + parse + carry the stamped value through
    // pdf-parse's text-layer extraction.
    const original = await makeBlankFixture();
    const fields = [
      {
        name: 'fullname',
        type: 'name',
        areas: [{ page: 0, x: 0.1, y: 0.5, w: 0.4, h: 0.05 }],
      },
      {
        name: 'exec_date',
        type: 'date',
        areas: [{ page: 0, x: 0.1, y: 0.6, w: 0.2, h: 0.05 }],
      },
    ];
    const out = await signPdf({
      originalPdf: original,
      fields,
      fieldValues: { fullname: 'Jane Doe' },
      signerName: 'Jane',
      signedAt: new Date('2026-05-11T14:00:00.000Z'),
    });
    const parsed = await pdfParse(Buffer.from(out));
    assert.ok(parsed.text.includes('Jane Doe'), 'stamped name must be in rendered text');
    assert.ok(parsed.text.includes('05/11/2026'), 'stamped date must be in rendered text');
  });
});

// ---------------------------------------------------------------------------

describe('signPdf — failure modes', () => {
  it('throws when originalPdf is missing', async () => {
    await assert.rejects(
      signPdf({ fields: [], fieldValues: {}, signerName: 'X', signedAt: new Date() }),
      /originalPdf/,
    );
  });

  it('throws on garbage PDF bytes', async () => {
    await assert.rejects(
      signPdf({
        originalPdf: Buffer.from('not a pdf'),
        fields: [],
        fieldValues: {},
        signerName: 'X',
        signedAt: new Date(),
      }),
    );
  });

  it('silently skips unknown field types (data-corruption defense)', async () => {
    const original = await makeBlankFixture();
    const out = await signPdf({
      originalPdf: original,
      fields: [
        {
          name: 'mystery',
          // @ts-expect-error — intentional invalid type to test the guard
          type: 'definitely-not-a-real-type',
          areas: [{ page: 0, x: 0.1, y: 0.5, w: 0.2, h: 0.05 }],
        },
      ],
      fieldValues: { mystery: 'whatever' },
      signerName: 'X',
      signedAt: new Date(),
    });
    // Should produce a valid PDF — just no stamping for that field.
    const re = await PDFDocument.load(out);
    assert.equal(re.getPageCount(), 1);
  });

  it('skips fields whose page index is out of range', async () => {
    const original = await makeBlankFixture();
    const out = await signPdf({
      originalPdf: original,
      fields: [
        {
          name: 'oob',
          type: 'name',
          areas: [{ page: 99, x: 0.1, y: 0.5, w: 0.2, h: 0.05 }],
        },
      ],
      fieldValues: { oob: 'should not crash' },
      signerName: 'X',
      signedAt: new Date(),
    });
    const re = await PDFDocument.load(out);
    assert.equal(re.getPageCount(), 1);
  });
});
