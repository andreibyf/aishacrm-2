/**
 * Unit tests for the docuseal-iframe-allowlist Worker (4VD-7).
 *
 * Tests the pure helpers (detectAllowlistedOrigin, rewriteCsp) — the
 * Worker's fetch handler is exercised end-to-end manually after deploy
 * since it requires a real Cloudflare runtime with a real upstream.
 *
 * Run:
 *   cd cloudflare-workers/docuseal-iframe-allowlist
 *   node --test test/worker.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { detectAllowlistedOrigin, rewriteCsp } from '../src/worker.js';

function mockReq(headers) {
  return { headers: new Map(Object.entries(headers || {})) };
}

// node:test runs in Node 22+ which has Headers globally; but our mock uses
// Map for simplicity. Adapt detectAllowlistedOrigin to .get() on either.
// (worker.js calls .get() — Map has .get(), Headers has .get(), both work.)

describe('detectAllowlistedOrigin', () => {
  test('matches exact Origin header for app.aishacrm.com', () => {
    const req = mockReq({ Origin: 'https://app.aishacrm.com' });
    assert.equal(detectAllowlistedOrigin(req), 'https://app.aishacrm.com');
  });

  test('matches exact Origin header for staging-app.aishacrm.com', () => {
    const req = mockReq({ Origin: 'https://staging-app.aishacrm.com' });
    assert.equal(detectAllowlistedOrigin(req), 'https://staging-app.aishacrm.com');
  });

  test('matches localhost dev origins', () => {
    assert.equal(
      detectAllowlistedOrigin(mockReq({ Origin: 'http://localhost:4000' })),
      'http://localhost:4000',
    );
    assert.equal(
      detectAllowlistedOrigin(mockReq({ Origin: 'http://localhost:5173' })),
      'http://localhost:5173',
    );
  });

  test('rejects unknown origins', () => {
    assert.equal(detectAllowlistedOrigin(mockReq({ Origin: 'https://evil.example.com' })), null);
    assert.equal(detectAllowlistedOrigin(mockReq({ Origin: 'http://localhost:9999' })), null);
  });

  test('returns null when Origin header missing and no fallback', () => {
    assert.equal(detectAllowlistedOrigin(mockReq({})), null);
  });

  test('falls back to Referer when Sec-Fetch-Site=cross-site', () => {
    const req = mockReq({
      'Sec-Fetch-Site': 'cross-site',
      Referer: 'https://app.aishacrm.com/sign/acme/abc',
    });
    assert.equal(detectAllowlistedOrigin(req), 'https://app.aishacrm.com');
  });

  test('does NOT use Referer when Sec-Fetch-Site is same-origin', () => {
    const req = mockReq({
      'Sec-Fetch-Site': 'same-origin',
      Referer: 'https://app.aishacrm.com/sign/acme/abc',
    });
    assert.equal(detectAllowlistedOrigin(req), null);
  });

  test('rejects Referer that does not start with allowlisted origin', () => {
    const req = mockReq({
      'Sec-Fetch-Site': 'cross-site',
      Referer: 'https://evil.example.com/?app.aishacrm.com',
    });
    assert.equal(detectAllowlistedOrigin(req), null);
  });
});

describe('rewriteCsp', () => {
  test('returns just the allowlist when no original CSP', () => {
    const out = rewriteCsp(null);
    assert.match(out, /^frame-ancestors 'self' https:\/\/app\.aishacrm\.com /);
  });

  test('preserves other directives when stripping frame-ancestors', () => {
    const original =
      "default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'self'";
    const out = rewriteCsp(original);
    assert.match(out, /default-src 'self'/);
    assert.match(out, /script-src 'self' 'unsafe-inline'/);
    assert.match(out, /frame-ancestors 'self' https:\/\/app\.aishacrm\.com/);
    // The OLD frame-ancestors should be gone (only the new one remains)
    const matches = out.match(/frame-ancestors/g) || [];
    assert.equal(matches.length, 1, 'should have exactly one frame-ancestors directive');
  });

  test('handles original CSP without frame-ancestors', () => {
    const original = "default-src 'self'; img-src 'self' data:";
    const out = rewriteCsp(original);
    assert.match(out, /default-src 'self'/);
    assert.match(out, /img-src 'self' data:/);
    assert.match(out, /frame-ancestors 'self' https:\/\/app\.aishacrm\.com/);
  });

  test('strips frame-ancestors regardless of position', () => {
    const original = "frame-ancestors 'self'; default-src 'self'";
    const out = rewriteCsp(original);
    const matches = out.match(/frame-ancestors/g) || [];
    assert.equal(matches.length, 1);
    assert.match(out, /default-src 'self'/);
  });

  test('handles case-insensitive frame-ancestors strip', () => {
    const original = "Frame-Ancestors 'self'; default-src 'self'";
    const out = rewriteCsp(original);
    const matches = out.match(/frame-ancestors/gi) || [];
    assert.equal(matches.length, 1);
  });
});
