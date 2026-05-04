/**
 * sendTenantEmail-gmail-smtp.test.js
 *
 * Regression for the bug surfaced 2026-05-04: a tenant configured a
 * `gmail_smtp` integration via Settings → Integrations and got "no SMTP
 * configured" toast on Send Document, because sendTenantEmail was only
 * looking up `communications_provider` rows.
 *
 * These tests pin:
 *   - gmail_smtp integration is recognized and used
 *   - app password whitespace stripping works (Google's UI shows the 16-char
 *     password formatted as "abcd efgh ijkl mnop")
 *   - the from address falls back to smtp_user when config.from_address is
 *     absent
 *   - gmail_smtp takes precedence over communications_provider when both
 *     are present (we prefer the simpler outbound-only path for
 *     transactional sends)
 *   - missing credentials fail with a clean reason, not an exception
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  sendTenantEmail,
  _setGmailTransportFactoryForTest,
  _resetGmailTransportFactory,
  _setSupabaseClientForTest,
  _resetSupabaseClientOverride,
} from '../../lib/sendTenantEmail.js';

function makeFakeSupabase(rows) {
  // The route's chain is from(t).select(c).eq(k,v).in(k,arr).eq(k,v) then
  // awaits the final builder. Return a thenable at every stage so the chain
  // settles on whatever the final terminator is.
  const result = { data: rows, error: null };
  const thenable = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    limit() {
      return this;
    },
    then(resolve) {
      resolve(result);
      return Promise.resolve(result);
    },
  };
  return {
    from() {
      return thenable;
    },
  };
}

let captured = null;
function makeFakeTransport(opts = {}) {
  return {
    sendMail: async (msg) => {
      captured = { msg, transportConfig: opts };
      if (opts.shouldThrow) throw new Error('SMTP rejected');
      return { messageId: 'fake-id-123' };
    },
  };
}

beforeEach(() => {
  captured = null;
});
afterEach(() => {
  _resetSupabaseClientOverride();
  _resetGmailTransportFactory();
});

const GMAIL_ROW = (overrides = {}) => ({
  id: 'i1',
  integration_type: 'gmail_smtp',
  is_active: true,
  api_credentials: { smtp_user: 'team@example.com', smtp_password: 'wjcpxcfsftjfkgug' },
  config: {},
  ...overrides,
});

describe('sendTenantEmail — gmail_smtp recognition (regression for 2026-05-04 bug)', () => {
  test('uses gmail_smtp integration when present', async () => {
    _setSupabaseClientForTest(makeFakeSupabase([GMAIL_ROW()]));
    let createTransportConfig = null;
    _setGmailTransportFactoryForTest((cfg) => {
      createTransportConfig = cfg;
      return makeFakeTransport();
    });

    const result = await sendTenantEmail({
      tenantId: 't1',
      to: 'recipient@example.com',
      subject: 'Hi',
      html: '<p>x</p>',
    });

    assert.equal(result.ok, true);
    assert.equal(result.provider, 'gmail_smtp');
    assert.equal(createTransportConfig.host, 'smtp.gmail.com');
    assert.equal(createTransportConfig.port, 465);
    assert.equal(createTransportConfig.secure, true);
    assert.equal(createTransportConfig.auth.user, 'team@example.com');
    assert.equal(captured.msg.to, 'recipient@example.com');
    assert.equal(captured.msg.subject, 'Hi');
    assert.equal(captured.msg.from, 'team@example.com');
  });

  test('strips whitespace from app password (Google UI displays "abcd efgh ijkl mnop")', async () => {
    _setSupabaseClientForTest(
      makeFakeSupabase([
        GMAIL_ROW({
          api_credentials: { smtp_user: 'u@e.com', smtp_password: 'wjcp xcfs ftjf kgug' },
        }),
      ]),
    );
    let cfg = null;
    _setGmailTransportFactoryForTest((c) => {
      cfg = c;
      return makeFakeTransport();
    });

    await sendTenantEmail({ tenantId: 't', to: 'r@e.com', subject: 's' });
    assert.equal(
      cfg.auth.pass,
      'wjcpxcfsftjfkgug',
      'whitespace must be stripped from app password',
    );
  });

  test('uses config.from_address when present, otherwise smtp_user', async () => {
    _setSupabaseClientForTest(
      makeFakeSupabase([
        GMAIL_ROW({
          api_credentials: { smtp_user: 'noreply@example.com', smtp_password: 'p' },
          config: { from_address: 'team@example.com' },
        }),
      ]),
    );
    _setGmailTransportFactoryForTest(() => makeFakeTransport());

    const result = await sendTenantEmail({ tenantId: 't', to: 'r@e.com', subject: 's' });
    assert.equal(captured.msg.from, 'team@example.com');
    assert.equal(result.ok, true);
  });

  test('formats To header with recipient name when provided', async () => {
    _setSupabaseClientForTest(makeFakeSupabase([GMAIL_ROW()]));
    _setGmailTransportFactoryForTest(() => makeFakeTransport());

    await sendTenantEmail({
      tenantId: 't',
      to: 'r@e.com',
      subject: 's',
      recipientName: 'Recipient Person',
    });
    assert.equal(captured.msg.to, '"Recipient Person" <r@e.com>');
  });

  test('escapes double-quotes in recipient name (no SMTP injection)', async () => {
    _setSupabaseClientForTest(makeFakeSupabase([GMAIL_ROW()]));
    _setGmailTransportFactoryForTest(() => makeFakeTransport());

    await sendTenantEmail({
      tenantId: 't',
      to: 'r@e.com',
      subject: 's',
      recipientName: 'Mal " icious',
    });
    assert.ok(!captured.msg.to.includes('"Mal "'));
  });

  test('returns reason gmail_smtp_missing_credentials when password absent', async () => {
    _setSupabaseClientForTest(
      makeFakeSupabase([GMAIL_ROW({ api_credentials: { smtp_user: 'u' } })]),
    );
    _setGmailTransportFactoryForTest(() => makeFakeTransport());

    const result = await sendTenantEmail({ tenantId: 't', to: 'r@e.com', subject: 's' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'gmail_smtp_missing_credentials');
  });

  test('returns send_failed reason when SMTP throws', async () => {
    _setSupabaseClientForTest(makeFakeSupabase([GMAIL_ROW()]));
    _setGmailTransportFactoryForTest(() => makeFakeTransport({ shouldThrow: true }));

    const result = await sendTenantEmail({ tenantId: 't', to: 'r@e.com', subject: 's' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'send_failed');
    assert.equal(result.provider, 'gmail_smtp');
    assert.match(result.error.message, /SMTP rejected/);
  });

  test('returns no_provider when no gmail_smtp or communications_provider rows exist', async () => {
    _setSupabaseClientForTest(makeFakeSupabase([]));
    const result = await sendTenantEmail({ tenantId: 't', to: 'r@e.com', subject: 's' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no_provider');
  });

  test('gmail_smtp takes precedence over communications_provider when both are active', async () => {
    _setSupabaseClientForTest(
      makeFakeSupabase([
        {
          id: 'cp',
          integration_type: 'communications_provider',
          is_active: true,
          api_credentials: {},
          config: { features: { outbound_enabled: true } },
        },
        GMAIL_ROW({ api_credentials: { smtp_user: 'gmail@e.com', smtp_password: 'p' } }),
      ]),
    );
    _setGmailTransportFactoryForTest(() => makeFakeTransport());

    const result = await sendTenantEmail({ tenantId: 't', to: 'r@e.com', subject: 's' });
    assert.equal(result.ok, true);
    assert.equal(result.provider, 'gmail_smtp', 'gmail_smtp should win when both providers exist');
  });
});
