/**
 * docusealSignRequestEmail.test.js
 *
 * Unit tests for buildDocusealSignRequestEmail (4VD-7) — the pure email
 * composer used by POST /api/docuseal/submissions when sending a
 * tenant-branded signing request.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildDocusealSignRequestEmail } from '../../lib/docusealSignRequestEmail.js';

describe('buildDocusealSignRequestEmail', () => {
  const baseArgs = {
    tenantName: 'Acme Corp',
    tenantLogoUrl: 'https://cdn.acme.com/logo.png',
    primaryColor: '#06b6d4',
    recipientName: 'Jane Doe',
    templateName: 'Master Services Agreement',
    message: 'Looking forward to working with you!',
    signingUrl: 'https://app.aishacrm.com/sign/acme-corp/abc123',
  };

  test('returns subject, html, text', () => {
    const out = buildDocusealSignRequestEmail(baseArgs);
    assert.ok(typeof out.subject === 'string' && out.subject.length > 0);
    assert.ok(typeof out.html === 'string' && out.html.length > 0);
    assert.ok(typeof out.text === 'string' && out.text.length > 0);
  });

  test('subject includes tenant name and template name', () => {
    const { subject } = buildDocusealSignRequestEmail(baseArgs);
    assert.match(subject, /Acme Corp/);
    assert.match(subject, /Master Services Agreement/);
  });

  test('html includes signing URL as both button and copy-paste link', () => {
    const { html } = buildDocusealSignRequestEmail(baseArgs);
    // URL should appear at least twice (button href + plain-text link)
    const matches = html.match(/https:\/\/app\.aishacrm\.com\/sign\/acme-corp\/abc123/g) || [];
    assert.ok(matches.length >= 2, `expected URL to appear ≥2 times, got ${matches.length}`);
  });

  test('html escapes tenant-supplied content', () => {
    const out = buildDocusealSignRequestEmail({
      ...baseArgs,
      tenantName: '<script>alert(1)</script>',
      recipientName: 'Bob "the Builder"',
      templateName: 'NDA <v2>',
      message: '<img src=x onerror=alert(1)>',
    });
    assert.ok(
      !out.html.includes('<script>alert(1)</script>'),
      'must escape tenant name script tag',
    );
    assert.ok(!out.html.includes('<img src=x onerror=alert(1)>'), 'must escape message HTML');
    assert.ok(out.html.includes('&lt;script&gt;'), 'expected escaped <');
    assert.ok(out.html.includes('&quot;'), 'expected escaped quote');
  });

  test('falls back to default color when primary is invalid', () => {
    const { html } = buildDocusealSignRequestEmail({
      ...baseArgs,
      primaryColor: 'red; background: url(javascript:alert(1))',
    });
    // Invalid hex → default #2563eb used in button background
    assert.ok(html.includes('#2563eb'), 'expected default color when input invalid');
    assert.ok(!html.includes('javascript:alert'), 'must not embed CSS injection');
  });

  test('renders without recipient name', () => {
    const { html, text } = buildDocusealSignRequestEmail({
      ...baseArgs,
      recipientName: null,
    });
    assert.ok(html.includes('Hi,'), 'should default to bare "Hi," when no name');
    assert.ok(text.startsWith('Hi,'), 'text version should default to bare "Hi,"');
  });

  test('renders without optional message', () => {
    const out = buildDocusealSignRequestEmail({ ...baseArgs, message: null });
    assert.ok(typeof out.html === 'string');
    // Quote block should be absent when no message
    assert.ok(!out.html.includes('Looking forward'), 'no original message text');
  });

  test('falls back to plain tenant name when logo URL is invalid/missing', () => {
    const out = buildDocusealSignRequestEmail({ ...baseArgs, tenantLogoUrl: null });
    assert.ok(!out.html.includes('<img'), 'no img tag when no logo');
    assert.ok(out.html.includes('Acme Corp'), 'tenant name should still render');
  });

  test('rejects non-https logo URL', () => {
    const out = buildDocusealSignRequestEmail({
      ...baseArgs,
      tenantLogoUrl: 'javascript:alert(1)',
    });
    assert.ok(!out.html.includes('javascript:alert'), 'must not render unsafe URL');
  });
});
