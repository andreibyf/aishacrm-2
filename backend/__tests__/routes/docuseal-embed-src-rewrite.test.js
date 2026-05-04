/**
 * docuseal-embed-src-rewrite.test.js
 *
 * Pins the rewriter that maps DocuSeal-generated embed_src URLs to the
 * tenant's configured base_url. Without this rewrite, embed_src is the raw
 * sslip URL DocuSeal was deployed with (HTTP, often unreachable end-user-side),
 * which renders as a broken iframe in the white-label SignPage.
 *
 * Tracks the bug from 2026-05-04 where the email + page chrome worked but
 * the form area was empty because the iframe pointed at the sslip host.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { rewriteEmbedSrcToBaseUrl } from '../../routes/docuseal.js';

describe('rewriteEmbedSrcToBaseUrl', () => {
  test('rewrites sslip host to tunnel host with https scheme', () => {
    const out = rewriteEmbedSrcToBaseUrl(
      'http://docuseal-vv17acequgm4r0g5ek0fvu6w.147.189.168.164.sslip.io/s/XiFLrcMc1pV5gW',
      'https://docuseal.aishacrm.com',
    );
    assert.equal(out, 'https://docuseal.aishacrm.com/s/XiFLrcMc1pV5gW');
  });

  test('preserves the path and query string verbatim', () => {
    const out = rewriteEmbedSrcToBaseUrl(
      'http://old-host.example/s/abc?role=signer&page=2',
      'https://new-host.example',
    );
    assert.equal(out, 'https://new-host.example/s/abc?role=signer&page=2');
  });

  test('upgrades http to https when the configured base_url is https', () => {
    const out = rewriteEmbedSrcToBaseUrl(
      'http://docuseal.aishacrm.com/s/x',
      'https://docuseal.aishacrm.com',
    );
    assert.equal(out, 'https://docuseal.aishacrm.com/s/x');
  });

  test('preserves a port specified in the tunnel base_url', () => {
    const out = rewriteEmbedSrcToBaseUrl('http://anything/s/x', 'http://localhost:8080');
    assert.equal(out, 'http://localhost:8080/s/x');
  });

  test('returns input unchanged if embed_src is missing', () => {
    assert.equal(rewriteEmbedSrcToBaseUrl(null, 'https://x.example'), null);
    assert.equal(rewriteEmbedSrcToBaseUrl('', 'https://x.example'), '');
  });

  test('returns input unchanged if base_url is missing', () => {
    const src = 'http://anything/s/x';
    assert.equal(rewriteEmbedSrcToBaseUrl(src, null), src);
    assert.equal(rewriteEmbedSrcToBaseUrl(src, ''), src);
  });

  test('falls back to original on malformed URL rather than corrupting it', () => {
    const src = 'not a url';
    assert.equal(rewriteEmbedSrcToBaseUrl(src, 'https://x.example'), src);
    const malformedBase = 'https://docuseal.aishacrm.com/s/x';
    assert.equal(
      rewriteEmbedSrcToBaseUrl('http://anything/s/x', 'definitely not a url'),
      'http://anything/s/x',
    );
  });

  test('does not mutate the path even when base_url has a trailing slash', () => {
    const out = rewriteEmbedSrcToBaseUrl('http://old/s/x', 'https://new.example/');
    // URL constructor treats trailing slash as the host root, so the rewritten
    // URL is still https://new.example/s/x — not https://new.example//s/x.
    assert.equal(out, 'https://new.example/s/x');
  });

  test('handles the literal sslip URL the dev tenant was hitting', () => {
    // Direct match for the exact URL DocuSeal returned during the 4VD-7 smoke
    // tests, so a refactor that breaks it gets caught.
    const real =
      'http://docuseal-vv17acequgm4r0g5ek0fvu6w.147.189.168.164.sslip.io/s/wQzHcnbLrw6XXY';
    const out = rewriteEmbedSrcToBaseUrl(real, 'https://docuseal.aishacrm.com');
    assert.equal(out, 'https://docuseal.aishacrm.com/s/wQzHcnbLrw6XXY');
  });
});
