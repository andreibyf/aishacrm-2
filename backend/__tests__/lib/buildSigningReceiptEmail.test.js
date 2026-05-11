// @ts-check
/**
 * buildSigningReceiptEmail.test.js (4VD-43 day 5 PR 2 follow-up)
 *
 * Pin the pure helper that builds the post-signing "your signed copy"
 * email body. Mirrors the existing buildSigningRequestEmail test surface
 * — same branding precedence, same escape rules, same shape.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSigningReceiptEmail,
  escapeHtml,
  pickLogoUrl,
  pickPrimaryColor,
  pickTenantDisplayName,
} from '../../lib/buildSigningReceiptEmail.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_FULL = {
  id: 'acme-uuid',
  tenant_id: 'acme',
  name: 'Acme Inc.',
  branding_settings: {
    logo_url: 'https://acme.example.com/logo.png',
    primary_color: '#7c3aed',
  },
};

const TENANT_BARE = {
  id: 'noname-uuid',
  tenant_id: 'noname',
  name: '',
  branding_settings: null,
};

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  test('escapes the four template-breaking characters', () => {
    assert.equal(escapeHtml('<b>"AT&T"</b>'), '&lt;b&gt;&quot;AT&amp;T&quot;&lt;/b&gt;');
  });

  test('handles null/undefined gracefully', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  test('coerces non-string input', () => {
    assert.equal(escapeHtml(42), '42');
  });
});

// ---------------------------------------------------------------------------
// pickLogoUrl
// ---------------------------------------------------------------------------

describe('pickLogoUrl', () => {
  test('returns branding_settings.logo_url when set', () => {
    assert.equal(pickLogoUrl(TENANT_FULL), 'https://acme.example.com/logo.png');
  });

  test('falls back to metadata.logo_url for legacy rows', () => {
    assert.equal(
      pickLogoUrl({ metadata: { logo_url: 'https://legacy.example.com/old.png' } }),
      'https://legacy.example.com/old.png',
    );
  });

  test('rejects non-http(s) URLs', () => {
    assert.equal(pickLogoUrl({ branding_settings: { logo_url: 'javascript:alert(1)' } }), null);
  });

  test('returns null for missing / wrong-typed values', () => {
    assert.equal(pickLogoUrl(null), null);
    assert.equal(pickLogoUrl({}), null);
    assert.equal(pickLogoUrl({ branding_settings: { logo_url: 42 } }), null);
  });
});

// ---------------------------------------------------------------------------
// pickPrimaryColor
// ---------------------------------------------------------------------------

describe('pickPrimaryColor', () => {
  test('returns tenant primary color when valid hex', () => {
    assert.equal(pickPrimaryColor(TENANT_FULL), '#7c3aed');
  });

  test('falls back to default blue when missing', () => {
    assert.equal(pickPrimaryColor(TENANT_BARE), '#2563eb');
  });

  test('rejects malformed values', () => {
    assert.equal(pickPrimaryColor({ branding_settings: { primary_color: 'red' } }), '#2563eb');
    assert.equal(pickPrimaryColor({ branding_settings: { primary_color: '#xyz' } }), '#2563eb');
  });
});

// ---------------------------------------------------------------------------
// pickTenantDisplayName
// ---------------------------------------------------------------------------

describe('pickTenantDisplayName', () => {
  test('returns tenant.name when non-empty', () => {
    assert.equal(pickTenantDisplayName(TENANT_FULL), 'Acme Inc.');
  });

  test('falls back to tenant_id slug', () => {
    assert.equal(pickTenantDisplayName({ tenant_id: 'acme' }), 'acme');
  });

  test('falls back to "Your team" for empty input', () => {
    assert.equal(pickTenantDisplayName(null), 'Your team');
    assert.equal(pickTenantDisplayName({}), 'Your team');
  });
});

// ---------------------------------------------------------------------------
// buildSigningReceiptEmail
// ---------------------------------------------------------------------------

describe('buildSigningReceiptEmail — happy path', () => {
  test('produces { subject, html, text } for a fully-branded tenant', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'Service Agreement',
      recipientName: 'Jane Doe',
      signedAtIso: '2026-05-11T14:00:00.000Z',
    });
    assert.equal(typeof out.subject, 'string');
    assert.equal(typeof out.html, 'string');
    assert.equal(typeof out.text, 'string');
    assert.match(out.subject, /Your signed copy/);
    assert.match(out.subject, /Service Agreement/);
  });

  test('html body embeds tenant primary color', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
      signedAtIso: '2026-05-11T14:00:00.000Z',
      viewUrl: 'https://app.aishacrm.com/sign/acme/abc',
    });
    assert.ok(out.html.includes('#7c3aed'));
  });

  test('html body embeds the logo URL when set', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
    });
    assert.ok(out.html.includes('https://acme.example.com/logo.png'));
  });

  test('html body falls back to tenant name h1 when no logo', () => {
    const out = buildSigningReceiptEmail({
      tenant: { name: 'PlainCo' },
      templateName: 'NDA',
    });
    assert.match(out.html, /<h1[^>]*>PlainCo<\/h1>/);
  });

  test('text body has greeting + thank you + tenant signoff', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'Service Agreement',
      recipientName: 'Jane Doe',
    });
    assert.match(out.text, /Hi Jane Doe/);
    assert.match(out.text, /Thanks for signing "Service Agreement"/);
    assert.match(out.text, /— Acme Inc\./);
  });

  test('text body uses generic "Hi," when recipientName missing', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
    });
    assert.match(out.text, /^Hi,/);
  });

  test('viewUrl is included in body when provided', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
      viewUrl: 'https://app.aishacrm.com/sign/acme/abc',
    });
    assert.match(out.text, /https:\/\/app\.aishacrm\.com\/sign\/acme\/abc/);
    assert.match(out.html, /https:\/\/app\.aishacrm\.com\/sign\/acme\/abc/);
  });

  test('viewUrl is absent from body when not provided (no broken link)', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
    });
    assert.doesNotMatch(out.html, /View signed document/);
  });

  test('signedAtIso renders as human-readable date line', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
      signedAtIso: '2026-05-11T14:00:00.000Z',
    });
    assert.match(out.text, /Signed on/);
    // Don't pin the exact format — Intl varies — just confirm the year.
    assert.match(out.text, /2026/);
  });

  test('signedAtIso silently ignored when malformed', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
      signedAtIso: 'not-a-date',
    });
    assert.doesNotMatch(out.text, /Signed on/);
  });
});

describe('buildSigningReceiptEmail — validation', () => {
  test('throws on missing input', () => {
    assert.throws(() => buildSigningReceiptEmail(null), /input must be an object/);
  });

  test('throws on missing templateName', () => {
    assert.throws(
      () => buildSigningReceiptEmail({ tenant: TENANT_FULL, templateName: '' }),
      /templateName/,
    );
  });

  test('throws on malformed viewUrl when provided', () => {
    assert.throws(
      () =>
        buildSigningReceiptEmail({
          tenant: TENANT_FULL,
          templateName: 'NDA',
          viewUrl: 'javascript:alert(1)',
        }),
      /viewUrl/,
    );
  });

  test('viewUrl is optional (undefined OK)', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
    });
    assert.equal(typeof out.subject, 'string');
  });

  test('viewUrl null is OK (treated as absent)', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
      viewUrl: null,
    });
    assert.equal(typeof out.subject, 'string');
  });
});

describe('buildSigningReceiptEmail — html safety', () => {
  test('escapes the template name in the subject + body', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: '<script>alert(1)</script>',
    });
    // Subject is plain text — not HTML — so we don't escape there.
    // But the HTML body MUST escape it so a malicious template name
    // can't render as a script tag in the recipient's email client.
    assert.doesNotMatch(out.html, /<script>alert/);
    assert.match(out.html, /&lt;script&gt;alert/);
  });

  test('escapes the recipient name in the html body', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
      recipientName: '"><img onerror=alert(1) src=x>',
    });
    assert.doesNotMatch(out.html, /<img onerror/);
  });

  test('escapes the view URL in the html body', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_FULL,
      templateName: 'NDA',
      viewUrl: 'https://example.com/?q=<x>&z=1',
    });
    // The URL regex requires http(s):// + non-space chars; the < gets through
    // the input validator (it's a valid URI character per RFC 3986 in path).
    // The HTML body must escape it so the rendered anchor href stays safe.
    assert.doesNotMatch(out.html, /<x>/);
    assert.match(out.html, /&lt;x&gt;/);
  });
});

describe('buildSigningReceiptEmail — branding fallbacks', () => {
  test('bare tenant uses tenant_id slug as display name', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_BARE,
      templateName: 'NDA',
    });
    // tenant_id is the slug fallback per pickTenantDisplayName.
    assert.match(out.text, /— noname/);
    // Note: primary color (`#2563eb`) only appears in the HTML when
    // viewUrl is provided (it's the View-button background). The receipt
    // email's permanent accent is the success-green `#16a34a` border on
    // the thank-you card, which IS always present.
    assert.ok(out.html.includes('#16a34a'), 'success-green accent border should always render');
  });

  test('bare tenant primary color appears when viewUrl is provided', () => {
    const out = buildSigningReceiptEmail({
      tenant: TENANT_BARE,
      templateName: 'NDA',
      viewUrl: 'https://app.aishacrm.com/sign/x/abc',
    });
    assert.ok(out.html.includes('#2563eb'), 'default primary on view button');
  });
});
