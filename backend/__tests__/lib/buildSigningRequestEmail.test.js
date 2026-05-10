// @ts-check
/**
 * buildSigningRequestEmail.test.js (4VD-43 day 2)
 *
 * Pure-function tests for the branded signing-request email helper. Covers
 * subject/body shape, tenant logo precedence, escape handling, and graceful
 * degradation when branding fields are missing.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSigningRequestEmail,
  escapeHtml,
  pickLogoUrl,
  pickPrimaryColor,
  pickTenantDisplayName,
} from '../../lib/buildSigningRequestEmail.js';

const BASE_INPUT = {
  tenant: {
    name: 'Acme Corp',
    tenant_id: 'acme',
    branding_settings: {
      logo_url: 'https://cdn.example.com/acme/logo.png',
      primary_color: '#ff5733',
    },
  },
  signingUrl: 'https://app.aishacrm.com/sign/acme/abc123',
  templateName: 'NDA — Mutual',
};

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  test('escapes the four characters that break the template', () => {
    assert.equal(escapeHtml('<b>"&\'</b>'), '&lt;b&gt;&quot;&amp;\'&lt;/b&gt;');
  });
  test('returns empty string for null/undefined', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });
});

// ---------------------------------------------------------------------------
// pickLogoUrl
// ---------------------------------------------------------------------------

describe('pickLogoUrl', () => {
  test('prefers branding_settings.logo_url', () => {
    assert.equal(
      pickLogoUrl({
        branding_settings: { logo_url: 'https://x/y.png' },
        metadata: { logo_url: 'https://OLD/z.png' },
      }),
      'https://x/y.png',
    );
  });

  test('falls back to metadata.logo_url for legacy rows', () => {
    assert.equal(
      pickLogoUrl({ metadata: { logo_url: 'https://legacy/z.png' } }),
      'https://legacy/z.png',
    );
  });

  test('returns null when no logo set', () => {
    assert.equal(pickLogoUrl({}), null);
    assert.equal(pickLogoUrl(null), null);
    assert.equal(pickLogoUrl({ branding_settings: {} }), null);
  });

  test('rejects non-http(s) URLs (defends against javascript: schemes)', () => {
    assert.equal(
      pickLogoUrl({ branding_settings: { logo_url: 'javascript:alert(1)' } }),
      null,
    );
    assert.equal(
      pickLogoUrl({ branding_settings: { logo_url: 'not a url' } }),
      null,
    );
  });

  test('trims whitespace', () => {
    assert.equal(
      pickLogoUrl({ branding_settings: { logo_url: '  https://x/y.png  ' } }),
      'https://x/y.png',
    );
  });
});

// ---------------------------------------------------------------------------
// pickPrimaryColor
// ---------------------------------------------------------------------------

describe('pickPrimaryColor', () => {
  test('returns the tenant color when valid', () => {
    assert.equal(
      pickPrimaryColor({ branding_settings: { primary_color: '#ff5733' } }),
      '#ff5733',
    );
  });
  test('accepts 3-digit hex', () => {
    assert.equal(
      pickPrimaryColor({ branding_settings: { primary_color: '#abc' } }),
      '#abc',
    );
  });
  test('falls back to default for invalid input', () => {
    assert.equal(
      pickPrimaryColor({ branding_settings: { primary_color: 'red' } }),
      '#2563eb',
    );
    assert.equal(pickPrimaryColor({}), '#2563eb');
    assert.equal(pickPrimaryColor(null), '#2563eb');
  });
});

// ---------------------------------------------------------------------------
// pickTenantDisplayName
// ---------------------------------------------------------------------------

describe('pickTenantDisplayName', () => {
  test('uses tenant.name when present', () => {
    assert.equal(pickTenantDisplayName({ name: 'Acme Corp' }), 'Acme Corp');
  });
  test('falls back to tenant_id slug', () => {
    assert.equal(pickTenantDisplayName({ tenant_id: 'acme' }), 'acme');
  });
  test('final fallback is "Your team"', () => {
    assert.equal(pickTenantDisplayName({}), 'Your team');
    assert.equal(pickTenantDisplayName(null), 'Your team');
  });
});

// ---------------------------------------------------------------------------
// buildSigningRequestEmail — happy path
// ---------------------------------------------------------------------------

describe('buildSigningRequestEmail — happy path', () => {
  test('returns subject/html/text with all parts populated', () => {
    const out = buildSigningRequestEmail({
      ...BASE_INPUT,
      recipientName: 'Jane Doe',
      senderName: 'Dre',
      message: 'Please sign by EOD.',
      expiresAt: new Date('2026-05-23T17:00:00Z'),
    });
    assert.match(out.subject, /Acme Corp sent you a document to sign: NDA — Mutual/);
    assert.match(out.html, /Acme Corp/);
    assert.match(out.html, /NDA — Mutual/);
    assert.match(out.html, /https:\/\/cdn\.example\.com\/acme\/logo\.png/);
    assert.match(out.html, /#ff5733/); // primary color flowed through
    assert.match(out.html, /Hi Jane Doe,/);
    assert.match(out.html, /Please sign by EOD\./);
    assert.match(out.html, /https:\/\/app\.aishacrm\.com\/sign\/acme\/abc123/);
    assert.match(out.html, /— Dre at Acme Corp/);
    assert.match(out.text, /Acme Corp/);
    assert.match(out.text, /NDA — Mutual/);
    assert.match(out.text, /https:\/\/app\.aishacrm\.com\/sign\/acme\/abc123/);
    assert.match(out.text, /Please sign by EOD\./);
    assert.match(out.text, /Hi Jane Doe,/);
  });

  test('no recipient name -> generic greeting', () => {
    const out = buildSigningRequestEmail(BASE_INPUT);
    assert.match(out.html, /Hi,/);
    assert.match(out.text, /Hi,/);
    assert.doesNotMatch(out.html, /Hi undefined/);
  });

  test('no message -> no message block', () => {
    const out = buildSigningRequestEmail({ ...BASE_INPUT, recipientName: 'Jane' });
    assert.doesNotMatch(out.html, /Message from sender/);
    assert.doesNotMatch(out.text, /Message from sender/);
  });

  test('no logo_url -> falls back to brand-name H1', () => {
    const out = buildSigningRequestEmail({
      ...BASE_INPUT,
      tenant: { name: 'Acme Corp', branding_settings: {} },
    });
    assert.doesNotMatch(out.html, /<img/);
    assert.match(out.html, /<h1[^>]*>Acme Corp<\/h1>/);
  });

  test('no primary_color -> default neutral blue', () => {
    const out = buildSigningRequestEmail({
      ...BASE_INPUT,
      tenant: { name: 'Acme', branding_settings: {} },
    });
    assert.match(out.html, /#2563eb/);
  });

  test('escapes HTML in template name + recipient name + message', () => {
    const out = buildSigningRequestEmail({
      ...BASE_INPUT,
      templateName: 'NDA <script>alert(1)</script>',
      recipientName: 'Jane "the Boss" Doe',
      message: 'Note: <b>urgent</b> & timely',
    });
    assert.doesNotMatch(out.html, /<script>/i);
    assert.match(out.html, /&lt;script&gt;/);
    assert.match(out.html, /&quot;the Boss&quot;/);
    assert.match(out.html, /&lt;b&gt;urgent&lt;\/b&gt; &amp; timely/);
  });

  test('escapes signing URL in attribute context', () => {
    const out = buildSigningRequestEmail({
      ...BASE_INPUT,
      signingUrl: 'https://app/sign/x/y?z=1&q=2',
    });
    // Both occurrences (button href + plain-text fallback link) escaped.
    assert.match(out.html, /q=2/);
    assert.doesNotMatch(out.html, /href="https:\/\/app\/sign\/x\/y\?z=1&q=2"/);
  });

  test('expiresAt formatted into both bodies when valid', () => {
    const out = buildSigningRequestEmail({
      ...BASE_INPUT,
      expiresAt: new Date('2026-05-23T17:00:00Z'),
    });
    assert.match(out.html, /This link expires on/);
    assert.match(out.text, /This link expires on/);
  });

  test('invalid expiresAt is silently ignored (no NaN/Invalid Date)', () => {
    const out = buildSigningRequestEmail({
      ...BASE_INPUT,
      expiresAt: new Date('not a date'),
    });
    assert.doesNotMatch(out.html, /Invalid Date|NaN/);
  });

  test('renders with branded logo when set', () => {
    const out = buildSigningRequestEmail(BASE_INPUT);
    assert.match(out.html, /<img src="https:\/\/cdn\.example\.com\/acme\/logo\.png"/);
  });
});

// ---------------------------------------------------------------------------
// buildSigningRequestEmail — input validation
// ---------------------------------------------------------------------------

describe('buildSigningRequestEmail — rejects bad input', () => {
  test('null input', () => {
    assert.throws(() => buildSigningRequestEmail(null), /input must be an object/);
  });
  test('non-http signingUrl', () => {
    assert.throws(
      () => buildSigningRequestEmail({ ...BASE_INPUT, signingUrl: 'javascript:alert(1)' }),
      /signingUrl must be a valid http/,
    );
  });
  test('empty signingUrl', () => {
    assert.throws(
      () => buildSigningRequestEmail({ ...BASE_INPUT, signingUrl: '' }),
      /signingUrl must be a valid http/,
    );
  });
  test('empty templateName', () => {
    assert.throws(
      () => buildSigningRequestEmail({ ...BASE_INPUT, templateName: '   ' }),
      /templateName must be a non-empty string/,
    );
  });
});
