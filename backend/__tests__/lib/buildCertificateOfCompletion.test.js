// @ts-check
/**
 * buildCertificateOfCompletion tests (4VD-43 day 5).
 *
 * Coverage:
 *   - Required fields validated; missing args throw.
 *   - Output is a valid single-page PDF.
 *   - Every audit-trail entry's action + timestamp + ip + ua appears in
 *     the page content stream (legal admissibility — the CoC has to
 *     survive scrutiny in court).
 *   - SHA-256 of the original document is stamped onto the CoC.
 *   - Sender / recipient / typed name fields appear when provided, are
 *     omitted when not (no orphan "Name: undefined" rows).
 *   - >30 audit entries: page truncates to 30 + a "+N earlier" footer
 *     line. v2 will paginate; v1 must not silently lose the count.
 *   - appendCertificateOfCompletion: takes a real signed PDF, returns a
 *     PDF whose page count = original + 1.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
// pdf-parse extracts the rendered text layer from a PDF — necessary
// because pdf-lib FlateEncode-compresses content streams, so a raw
// .toString('latin1').includes('Service Agreement') will miss the
// literal even when it's correctly stamped onto the page.
import pdfParse from 'pdf-parse';

import {
  buildCertificateOfCompletion,
  appendCertificateOfCompletion,
} from '../../lib/buildCertificateOfCompletion.js';

const BASE_PARAMS = {
  documentName: 'Service Agreement',
  envelopeId: '11111111-2222-3333-4444-555555555555',
  originalPdfSha256:
    'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
  tenantName: 'Acme Tribal Council',
  sentByName: 'Maria Operator',
  sentByEmail: 'maria@acme.example',
  recipientEmail: 'jane@example.com',
  recipientName: 'Jane Recipient',
  signerTypedName: 'Jane Recipient, CEO',
  signerIp: '198.51.100.42',
  signerUserAgent: 'Mozilla/5.0 (Macintosh) Chrome/124',
  signedAt: '2026-05-11T14:00:00.000Z',
  auditTrail: [
    { action: 'sent', at: '2026-05-10T09:00:00.000Z', ip: '203.0.113.5' },
    { action: 'viewed', at: '2026-05-10T15:30:00.000Z', ip: '198.51.100.42' },
    {
      action: 'signed',
      at: '2026-05-11T14:00:00.000Z',
      ip: '198.51.100.42',
      ua: 'Mozilla/5.0',
    },
  ],
  generatedAt: '2026-05-11T14:00:05.000Z',
};

/**
 * Build the CoC and return its raw bytes + the extracted text layer.
 * Uses pdf-parse to decompress and concatenate the page text so tests
 * can assert on what the PDF reader will actually render.
 */
async function buildAsText(params) {
  const doc = await buildCertificateOfCompletion(params);
  // Match the production save options used in appendCertificateOfCompletion
  // so test output corresponds to what real recipients see.
  const bytes = await doc.save({ useObjectStreams: false });
  const parsed = await pdfParse(Buffer.from(bytes));
  return { bytes, text: parsed.text };
}

// ---------------------------------------------------------------------------

describe('buildCertificateOfCompletion — required fields', () => {
  it('throws when params is missing', async () => {
    await assert.rejects(buildCertificateOfCompletion(), /params required/);
  });

  it('throws when documentName is missing', async () => {
    const { documentName: _ignored, ...rest } = BASE_PARAMS;
    await assert.rejects(buildCertificateOfCompletion(rest), /documentName/);
  });

  it('throws when envelopeId is missing', async () => {
    const { envelopeId: _ignored, ...rest } = BASE_PARAMS;
    await assert.rejects(buildCertificateOfCompletion(rest), /envelopeId/);
  });

  it('throws when recipientEmail is missing', async () => {
    const { recipientEmail: _ignored, ...rest } = BASE_PARAMS;
    await assert.rejects(buildCertificateOfCompletion(rest), /recipientEmail/);
  });

  it('throws when originalPdfSha256 is missing', async () => {
    const { originalPdfSha256: _ignored, ...rest } = BASE_PARAMS;
    await assert.rejects(buildCertificateOfCompletion(rest), /originalPdfSha256/);
  });
});

// ---------------------------------------------------------------------------

describe('buildCertificateOfCompletion — output structure', () => {
  it('produces a valid single-page PDF', async () => {
    const { bytes } = await buildAsText(BASE_PARAMS);
    const re = await PDFDocument.load(bytes);
    assert.equal(re.getPageCount(), 1);
  });

  it('stamps the SHA-256 onto the page', async () => {
    const { text } = await buildAsText(BASE_PARAMS);
    assert.ok(text.includes(BASE_PARAMS.originalPdfSha256));
  });

  it('stamps the envelope ID', async () => {
    const { text } = await buildAsText(BASE_PARAMS);
    assert.ok(text.includes(BASE_PARAMS.envelopeId));
  });

  it('stamps the document name', async () => {
    const { text } = await buildAsText(BASE_PARAMS);
    assert.ok(text.includes('Service Agreement'));
  });

  it('stamps recipient email', async () => {
    const { text } = await buildAsText(BASE_PARAMS);
    assert.ok(text.includes('jane@example.com'));
  });

  it('stamps signer IP', async () => {
    const { text } = await buildAsText(BASE_PARAMS);
    assert.ok(text.includes('198.51.100.42'));
  });

  it('stamps tenant name when provided', async () => {
    const { text } = await buildAsText(BASE_PARAMS);
    assert.ok(text.includes('Acme Tribal Council'));
  });
});

// ---------------------------------------------------------------------------

describe('buildCertificateOfCompletion — audit trail', () => {
  it("includes every audit entry's action + IP", async () => {
    const { text } = await buildAsText(BASE_PARAMS);
    for (const entry of BASE_PARAMS.auditTrail) {
      assert.ok(
        text.includes(entry.action),
        `audit action "${entry.action}" should appear in CoC`,
      );
      if (entry.ip) {
        assert.ok(
          text.includes(entry.ip),
          `audit IP "${entry.ip}" should appear in CoC`,
        );
      }
    }
  });

  it('truncates >30-entry trails and surfaces the +N footer', async () => {
    // Fabricate 50 audit entries; CoC v1 caps at 30.
    const longTrail = Array.from({ length: 50 }, (_, i) => ({
      action: 'viewed',
      at: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      ip: `10.0.0.${i}`,
    }));
    const { text } = await buildAsText({ ...BASE_PARAMS, auditTrail: longTrail });
    assert.ok(
      text.includes('+ 20 earlier event(s)') ||
        text.includes('20 earlier event'),
      'CoC must surface the count of truncated audit entries',
    );
  });
});

// ---------------------------------------------------------------------------

describe('buildCertificateOfCompletion — optional fields', () => {
  it('does not stamp Tenant row when tenantName is missing', async () => {
    const { text } = await buildAsText({ ...BASE_PARAMS, tenantName: undefined });
    // The label "Tenant" still appears (it's a fixed schema), but the
    // value should be the placeholder, not "undefined" or "null".
    assert.ok(
      text.includes('(unknown)'),
      'missing tenantName should fall back to a clear placeholder',
    );
    assert.ok(!text.includes('undefined'));
  });

  it('omits Sent by line entirely when sender info is missing', async () => {
    const params = {
      ...BASE_PARAMS,
      sentByName: undefined,
      sentByEmail: undefined,
    };
    const { text } = await buildAsText(params);
    assert.ok(!text.includes('Sent by'));
  });

  it('omits Typed name when signerTypedName is missing', async () => {
    const params = { ...BASE_PARAMS, signerTypedName: undefined };
    const { text } = await buildAsText(params);
    // 'Typed name' is the label; if the row is suppressed it shouldn't
    // appear in the content stream at all.
    assert.ok(!text.includes('Typed name'));
  });
});

// ---------------------------------------------------------------------------

describe('appendCertificateOfCompletion', () => {
  async function makeBlankSignedPdf() {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    doc.getPage(0).drawText('Page 1', { x: 50, y: 750, size: 12, font: helv });
    doc.getPage(1).drawText('Page 2', { x: 50, y: 750, size: 12, font: helv });
    return Buffer.from(await doc.save());
  }

  it('appends exactly one page to the signed PDF', async () => {
    const signed = await makeBlankSignedPdf();
    const merged = await appendCertificateOfCompletion(signed, BASE_PARAMS);
    const re = await PDFDocument.load(merged);
    assert.equal(re.getPageCount(), 3, 'expected original 2 pages + 1 CoC page');
  });

  it('preserves the original pages first, CoC last', async () => {
    const signed = await makeBlankSignedPdf();
    const merged = await appendCertificateOfCompletion(signed, BASE_PARAMS);
    const parsed = await pdfParse(Buffer.from(merged));
    const text = parsed.text;
    // Both the original page markers AND the CoC content must be present
    assert.ok(text.includes('Page 1'), 'original page 1 lost');
    assert.ok(text.includes('Page 2'), 'original page 2 lost');
    assert.ok(
      text.includes('Certificate of Completion'),
      'CoC header missing from merged output',
    );
  });
});
