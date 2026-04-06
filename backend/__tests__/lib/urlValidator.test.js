import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUrl,
  validateUrlAgainstWhitelist,
  validateInternalUrl,
} from '../../lib/urlValidator.js';

describe('urlValidator', () => {
  describe('validateUrl', () => {
    it('accepts valid http/https URLs', () => {
      const ok1 = validateUrl('https://example.com/path');
      const ok2 = validateUrl('http://example.org');
      assert.equal(ok1.valid, true);
      assert.equal(ok2.valid, true);
    });

    it('rejects unsupported schemes', () => {
      const result = validateUrl('ftp://example.com');
      assert.equal(result.valid, false);
      assert.match(result.error, /Invalid URL scheme/i);
    });

    it('rejects malformed URLs', () => {
      const result = validateUrl('not-a-url');
      assert.equal(result.valid, false);
      assert.match(result.error, /Invalid URL/i);
    });

    it('blocks localhost when allowLocalhostInDev is false', () => {
      const result = validateUrl('http://localhost:3000', { allowLocalhostInDev: false });
      assert.equal(result.valid, false);
      assert.match(result.error, /Localhost URLs are not allowed/i);
    });

    it('blocks private IP by default and allows with explicit option', () => {
      const blocked = validateUrl('http://192.168.1.10');
      assert.equal(blocked.valid, false);
      assert.match(blocked.error, /Private IP addresses are not allowed/i);

      const allowed = validateUrl('http://192.168.1.10', { allowPrivateIPs: true });
      assert.equal(allowed.valid, true);
    });

    it('rejects embedded credentials', () => {
      const result = validateUrl('https://user:pass@example.com');
      assert.equal(result.valid, false);
      assert.match(result.error, /embedded credentials/i);
    });
  });

  describe('validateUrlAgainstWhitelist', () => {
    it('allows exact and wildcard domain matches', () => {
      const exact = validateUrlAgainstWhitelist('https://api.example.com', ['api.example.com']);
      const wildcard = validateUrlAgainstWhitelist('https://foo.example.com', ['*.example.com']);
      assert.equal(exact.valid, true);
      assert.equal(wildcard.valid, true);
    });

    it('rejects domains outside whitelist', () => {
      const result = validateUrlAgainstWhitelist('https://evil.com', ['*.example.com']);
      assert.equal(result.valid, false);
      assert.match(result.error, /not in the allowed whitelist/i);
    });
  });

  describe('validateInternalUrl', () => {
    it('accepts matching host:port and rejects mismatch', () => {
      const good = validateInternalUrl('https://crm.local:4001/path', 'crm.local:4001');
      assert.equal(good.valid, true);

      const bad = validateInternalUrl('https://crm.local:4002/path', 'crm.local:4001');
      assert.equal(bad.valid, false);
      assert.match(bad.error, /does not match expected host/i);
    });
  });
});
