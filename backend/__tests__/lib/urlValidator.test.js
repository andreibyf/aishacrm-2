/**
 * Tests for urlValidator - SSRF and DNS rebinding protection
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import {
  validateUrl,
  resolveAndValidateUrl,
  safeFetch,
  _setDnsLookupForTesting,
} from '../../lib/urlValidator.js';

// ── validateUrl (synchronous) ─────────────────────────────────────────────────

describe('validateUrl()', () => {
  it('accepts a valid https URL', () => {
    const result = validateUrl('https://api.github.com/repos/org/repo/issues');
    assert.strictEqual(result.valid, true);
    assert.ok(result.url instanceof URL);
  });

  it('rejects ftp:// scheme', () => {
    const result = validateUrl('ftp://example.com/file');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /scheme/i);
  });

  it('rejects localhost in production', () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = validateUrl('http://localhost:4001/api');
      assert.strictEqual(result.valid, false);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it('accepts localhost in development when allowLocalhostInDev=true', () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const result = validateUrl('http://localhost:4001/api', { allowLocalhostInDev: true });
      assert.strictEqual(result.valid, true);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it('rejects private IP 10.0.0.1', () => {
    const result = validateUrl('http://10.0.0.1/internal');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /private/i);
  });

  it('rejects URLs with embedded credentials', () => {
    const result = validateUrl('https://user:pass@example.com/path');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /credentials/i);
  });

  it('rejects a completely malformed URL', () => {
    const result = validateUrl('not-a-url');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /invalid url/i);
  });
});

// ── resolveAndValidateUrl (async / DNS rebinding) ────────────────────────────

describe('resolveAndValidateUrl() — DNS rebinding protection', () => {
  after(() => {
    // Restore real DNS after this suite
    _setDnsLookupForTesting(null);
  });

  it('rejects when DNS resolves to a private IP (rebinding attack)', async () => {
    _setDnsLookupForTesting(async () => ({ address: '192.168.1.100', family: 4 }));

    const result = await resolveAndValidateUrl('https://evil.example.com/data');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /DNS rebinding/i);
    assert.match(result.error, /192\.168\.1\.100/);
  });

  it('rejects when DNS resolves to loopback 127.0.0.1', async () => {
    _setDnsLookupForTesting(async () => ({ address: '127.0.0.1', family: 4 }));

    const result = await resolveAndValidateUrl('https://rebind.example.com/');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /loopback/i);
  });

  it('rejects when DNS resolves to IPv6 loopback ::1', async () => {
    _setDnsLookupForTesting(async () => ({ address: '::1', family: 6 }));

    const result = await resolveAndValidateUrl('https://rebind6.example.com/');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /loopback/i);
  });

  it('accepts a hostname that resolves to a legitimate public IP', async () => {
    _setDnsLookupForTesting(async () => ({ address: '140.82.114.3', family: 4 }));

    const result = await resolveAndValidateUrl('https://api.github.com/repos');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.resolvedIP, '140.82.114.3');
  });

  it('returns the resolved IP in the result', async () => {
    _setDnsLookupForTesting(async () => ({ address: '93.184.216.34', family: 4 }));

    const result = await resolveAndValidateUrl('https://example.com/');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.resolvedIP, '93.184.216.34');
  });

  it('skips DNS when the URL contains a literal public IP', async () => {
    let lookupCalled = false;
    _setDnsLookupForTesting(async () => {
      lookupCalled = true;
      throw new Error('should not be called');
    });

    const result = await resolveAndValidateUrl('https://93.184.216.34/');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.resolvedIP, '93.184.216.34');
    assert.strictEqual(lookupCalled, false);
  });

  it('returns invalid when DNS resolution fails', async () => {
    _setDnsLookupForTesting(async () => {
      throw new Error('ENOTFOUND');
    });

    const result = await resolveAndValidateUrl('https://no-such-host.invalid/');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /DNS resolution failed/i);
  });

  it('still rejects when the base URL has an invalid scheme (no DNS call needed)', async () => {
    let lookupCalled = false;
    _setDnsLookupForTesting(async () => {
      lookupCalled = true;
      return { address: '1.2.3.4', family: 4 };
    });

    const result = await resolveAndValidateUrl('ftp://example.com/file');
    assert.strictEqual(result.valid, false);
    assert.match(result.error, /scheme/i);
    assert.strictEqual(lookupCalled, false);
  });
});

// ── safeFetch ────────────────────────────────────────────────────────────────

describe('safeFetch()', () => {
  let originalFetch;

  before(() => {
    originalFetch = globalThis.fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
    _setDnsLookupForTesting(null);
  });

  it('throws when URL resolves to a private IP', async () => {
    _setDnsLookupForTesting(async () => ({ address: '10.10.10.10', family: 4 }));

    await assert.rejects(() => safeFetch('https://evil.example.com/'), /URL validation failed/i);
  });

  it('calls fetch when the URL is safe', async () => {
    _setDnsLookupForTesting(async () => ({ address: '140.82.114.3', family: 4 }));

    const fakeFetch = mock.fn(async () => ({ status: 200, ok: true }));
    globalThis.fetch = fakeFetch;

    await safeFetch('https://api.github.com/');
    assert.strictEqual(fakeFetch.mock.calls.length, 1);
  });
});
