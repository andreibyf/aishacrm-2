/**
 * Tests for urlValidator - SSRF protection and URL validation
 * Critical for preventing Server-Side Request Forgery attacks
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  validateUrl,
  validateUrlAgainstWhitelist,
  validateInternalUrl,
} from '../../lib/urlValidator.js';

describe('urlValidator', () => {
  describe('validateUrl()', () => {
    describe('URL scheme validation', () => {
      it('should allow http URLs', () => {
        const result = validateUrl('http://example.com/path');
        assert.strictEqual(result.valid, true);
        assert.ok(result.url instanceof URL);
      });

      it('should allow https URLs', () => {
        const result = validateUrl('https://example.com/path');
        assert.strictEqual(result.valid, true);
        assert.ok(result.url instanceof URL);
      });

      it('should reject ftp URLs', () => {
        const result = validateUrl('ftp://example.com/file');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('ftp:'));
      });

      it('should reject file URLs', () => {
        const result = validateUrl('file:///etc/passwd');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('file:'));
      });

      it('should reject data URLs', () => {
        const result = validateUrl('data:text/html,<script>alert(1)</script>');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('data:'));
      });

      it('should reject javascript URLs', () => {
        const result = validateUrl('javascript:alert(1)');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('javascript:'));
      });

      it('should reject custom/internal scheme URLs', () => {
        const result = validateUrl('gopher://example.com');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('private IPv4 detection', () => {
      it('should block 10.x.x.x addresses', () => {
        const result = validateUrl('http://10.0.0.1/api');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SSRF'));
      });

      it('should block 10.255.255.255 (end of range)', () => {
        const result = validateUrl('http://10.255.255.255/');
        assert.strictEqual(result.valid, false);
      });

      it('should block 172.16.x.x addresses', () => {
        const result = validateUrl('http://172.16.0.1/');
        assert.strictEqual(result.valid, false);
      });

      it('should block 172.31.x.x addresses (end of private range)', () => {
        const result = validateUrl('http://172.31.255.255/');
        assert.strictEqual(result.valid, false);
      });

      it('should allow 172.15.x.x (just outside private range)', () => {
        const result = validateUrl('http://172.15.0.1/');
        assert.strictEqual(result.valid, true);
      });

      it('should allow 172.32.x.x (just outside private range)', () => {
        const result = validateUrl('http://172.32.0.1/');
        assert.strictEqual(result.valid, true);
      });

      it('should block 192.168.x.x addresses', () => {
        const result = validateUrl('http://192.168.1.1/');
        assert.strictEqual(result.valid, false);
      });

      it('should block 169.254.x.x link-local addresses', () => {
        const result = validateUrl('http://169.254.169.254/latest/meta-data');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SSRF'));
      });

      it('should allow private IPs when explicitly permitted', () => {
        const result = validateUrl('http://192.168.1.1/', { allowPrivateIPs: true });
        assert.strictEqual(result.valid, true);
      });

      it('should allow public IP addresses', () => {
        const result = validateUrl('http://8.8.8.8/');
        assert.strictEqual(result.valid, true);
      });
    });

    describe('private IPv6 detection', () => {
      it('should block IPv6 loopback ::1', () => {
        const result = validateUrl('http://[::1]/');
        assert.strictEqual(result.valid, false);
      });

      it('should block fe80:: link-local addresses', () => {
        const result = validateUrl('http://[fe80::1]/');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('SSRF'));
      });

      it('should block fc00:: unique local addresses', () => {
        const result = validateUrl('http://[fc00::1]/');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('localhost handling', () => {
      let originalNodeEnv;

      before(() => {
        originalNodeEnv = process.env.NODE_ENV;
      });

      after(() => {
        process.env.NODE_ENV = originalNodeEnv;
      });

      it('should allow localhost in development mode by default', () => {
        process.env.NODE_ENV = 'development';
        const result = validateUrl('http://localhost:3000/api');
        assert.strictEqual(result.valid, true);
      });

      it('should allow localhost in test mode by default', () => {
        process.env.NODE_ENV = 'test';
        const result = validateUrl('http://localhost/api');
        assert.strictEqual(result.valid, true);
      });

      it('should block localhost in production mode', () => {
        process.env.NODE_ENV = 'production';
        const result = validateUrl('http://localhost/api');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('production'));
      });

      it('should block 127.0.0.1 in production mode', () => {
        process.env.NODE_ENV = 'production';
        const result = validateUrl('http://127.0.0.1/api');
        assert.strictEqual(result.valid, false);
      });

      it('should block localhost when allowLocalhostInDev is false even in development', () => {
        process.env.NODE_ENV = 'development';
        const result = validateUrl('http://localhost/api', { allowLocalhostInDev: false });
        assert.strictEqual(result.valid, false);
      });

      it('should block 127.x.x.x as private IP in production', () => {
        process.env.NODE_ENV = 'production';
        const result = validateUrl('http://127.0.0.2/api');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('URL credentials', () => {
      it('should reject URLs with username', () => {
        const result = validateUrl('http://user@example.com/');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('credentials'));
      });

      it('should reject URLs with username and password', () => {
        const result = validateUrl('http://user:password@example.com/');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('credentials'));
      });

      it('should reject URLs with empty username', () => {
        const result = validateUrl('http://:password@example.com/');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('credentials'));
      });
    });

    describe('malformed URLs', () => {
      it('should reject plain strings', () => {
        const result = validateUrl('not a url');
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('Invalid URL'));
      });

      it('should reject empty strings', () => {
        const result = validateUrl('');
        assert.strictEqual(result.valid, false);
      });

      it('should reject null', () => {
        const result = validateUrl(null);
        assert.strictEqual(result.valid, false);
      });

      it('should reject undefined', () => {
        const result = validateUrl(undefined);
        assert.strictEqual(result.valid, false);
      });

      it('should reject relative URLs', () => {
        const result = validateUrl('/api/v1/users');
        assert.strictEqual(result.valid, false);
      });

      it('should reject partial URLs missing protocol', () => {
        const result = validateUrl('example.com/path');
        assert.strictEqual(result.valid, false);
      });
    });

    describe('valid public URLs', () => {
      it('should accept URLs with ports', () => {
        const result = validateUrl('https://api.example.com:8443/endpoint');
        assert.strictEqual(result.valid, true);
        assert.ok(result.url instanceof URL);
      });

      it('should accept URLs with query parameters', () => {
        const result = validateUrl('https://api.example.com/search?q=test&page=1');
        assert.strictEqual(result.valid, true);
      });

      it('should accept URLs with hash fragments', () => {
        const result = validateUrl('https://example.com/page#section');
        assert.strictEqual(result.valid, true);
      });

      it('should accept URLs with subdomains', () => {
        const result = validateUrl('https://api.v2.example.com/');
        assert.strictEqual(result.valid, true);
      });

      it('should return valid URL object on success', () => {
        const result = validateUrl('https://example.com/path?q=1');
        assert.strictEqual(result.valid, true);
        assert.ok(result.url instanceof URL);
        assert.strictEqual(result.url.hostname, 'example.com');
        assert.strictEqual(result.url.pathname, '/path');
      });
    });
  });

  describe('validateUrlAgainstWhitelist()', () => {
    describe('exact domain matching', () => {
      it('should allow URL on exact matching domain', () => {
        const result = validateUrlAgainstWhitelist('https://api.example.com/', ['api.example.com']);
        assert.strictEqual(result.valid, true);
      });

      it('should reject URL not in whitelist', () => {
        const result = validateUrlAgainstWhitelist('https://evil.com/', ['api.example.com']);
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('whitelist'));
      });

      it('should reject partial domain match', () => {
        const result = validateUrlAgainstWhitelist('https://notapi.example.com/', [
          'api.example.com',
        ]);
        assert.strictEqual(result.valid, false);
      });

      it('should match multiple allowed domains', () => {
        const domains = ['api.example.com', 'cdn.example.com'];
        assert.strictEqual(
          validateUrlAgainstWhitelist('https://api.example.com/', domains).valid,
          true,
        );
        assert.strictEqual(
          validateUrlAgainstWhitelist('https://cdn.example.com/', domains).valid,
          true,
        );
        assert.strictEqual(validateUrlAgainstWhitelist('https://evil.com/', domains).valid, false);
      });
    });

    describe('wildcard domain matching', () => {
      it('should allow subdomain with wildcard pattern *.example.com', () => {
        const result = validateUrlAgainstWhitelist('https://sub.example.com/', ['*.example.com']);
        assert.strictEqual(result.valid, true);
      });

      it('should reject domain that does not match wildcard', () => {
        const result = validateUrlAgainstWhitelist('https://evil.com/', ['*.example.com']);
        assert.strictEqual(result.valid, false);
      });

      it('should match deep subdomains with wildcard', () => {
        const result = validateUrlAgainstWhitelist('https://api.v2.example.com/', [
          '*.example.com',
        ]);
        assert.strictEqual(result.valid, true);
      });
    });

    describe('URL validation propagation', () => {
      it('should reject invalid URLs even if domain would match whitelist', () => {
        const result = validateUrlAgainstWhitelist('ftp://example.com/', ['example.com']);
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('ftp:'));
      });

      it('should reject private IPs even if in whitelist (passes to validateUrl)', () => {
        const result = validateUrlAgainstWhitelist('http://192.168.1.1/', ['192.168.1.1']);
        assert.strictEqual(result.valid, false);
      });

      it('should return URL object on success', () => {
        const result = validateUrlAgainstWhitelist('https://example.com/path', ['example.com']);
        assert.strictEqual(result.valid, true);
        assert.ok(result.url instanceof URL);
      });
    });

    describe('empty whitelist', () => {
      it('should reject all URLs when whitelist is empty', () => {
        const result = validateUrlAgainstWhitelist('https://example.com/', []);
        assert.strictEqual(result.valid, false);
        assert.ok(result.error.includes('whitelist'));
      });

      it('should reject all URLs when whitelist is not provided', () => {
        const result = validateUrlAgainstWhitelist('https://example.com/');
        assert.strictEqual(result.valid, false);
      });
    });
  });

  describe('validateInternalUrl()', () => {
    let originalNodeEnv;

    before(() => {
      originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
    });

    after(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should allow URL matching the expected host', () => {
      const result = validateInternalUrl('http://localhost:4001/api/health', 'localhost:4001');
      assert.strictEqual(result.valid, true);
    });

    it('should reject URL with different host', () => {
      const result = validateInternalUrl('http://other-host:4001/api', 'localhost:4001');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('SSRF'));
    });

    it('should reject URL with different port', () => {
      const result = validateInternalUrl('http://localhost:9999/api', 'localhost:4001');
      assert.strictEqual(result.valid, false);
    });

    it('should reject URL with different scheme but same host', () => {
      const result = validateInternalUrl('ftp://localhost:4001/api', 'localhost:4001');
      assert.strictEqual(result.valid, false);
    });

    it('should be case-insensitive for host comparison', () => {
      const result = validateInternalUrl('http://LOCALHOST:4001/api', 'localhost:4001');
      assert.strictEqual(result.valid, true);
    });

    it('should return URL object on success', () => {
      const result = validateInternalUrl('http://localhost:4001/api/data', 'localhost:4001');
      assert.strictEqual(result.valid, true);
      assert.ok(result.url instanceof URL);
    });
  });
});
