import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadImapSmtpAdapter,
  setImapClientFactoryForTests,
} from '../../lib/communications/adapters/imapSmtpAdapter.js';

function buildConnection() {
  return {
    config: {
      provider_type: 'imap_smtp',
      provider_name: 'zoho_mail',
      mailbox_id: 'owner-primary',
      inbound: {
        host: 'imap.zoho.com',
        port: 993,
        secure: true,
        folder: 'INBOX',
      },
      outbound: {
        host: 'smtp.zoho.com',
        port: 587,
        secure: false,
        from_address: 'owner@example.com',
      },
    },
    api_credentials: {
      inbound_username: 'owner@example.com',
      inbound_password: 'secret-inbound',
      outbound_username: 'owner@example.com',
      outbound_password: 'secret-outbound',
    },
  };
}

describe('imap_smtp adapter inbound retrieval', () => {
  after(() => {
    setImapClientFactoryForTests(null);
  });

  it('fetches inbound messages from IMAP and returns a UID cursor', async () => {
    const events = [];
    setImapClientFactoryForTests(() => ({
      async connect() {
        events.push('connect');
      },
      async getMailboxLock(name) {
        events.push(`lock:${name}`);
        return {
          release() {
            events.push('release');
          },
        };
      },
      async *fetch() {
        yield {
          uid: 101,
          envelope: {
            messageId: '<m1@example.com>',
            subject: 'Intro',
            from: [{ name: 'Prospect', address: 'prospect@example.com' }],
            to: [{ name: 'Owner', address: 'owner@example.com' }],
          },
          internalDate: new Date('2026-03-14T12:00:00Z'),
          flags: ['\\Seen'],
          source: Buffer.from('raw message 1'),
        };
        yield {
          uid: 102,
          envelope: {
            messageId: '<m2@example.com>',
            subject: 'Re: Intro',
            from: [{ name: 'Prospect', mailbox: 'prospect', host: 'example.com' }],
            to: [{ name: 'Owner', mailbox: 'owner', host: 'example.com' }],
          },
          internalDate: new Date('2026-03-14T12:05:00Z'),
          flags: [],
          source: 'raw message 2',
        };
      },
      async logout() {
        events.push('logout');
      },
    }));

    const adapter = loadImapSmtpAdapter(buildConnection());
    const result = await adapter.fetchInboundMessages({ cursor: 100, limit: 10 });

    assert.equal(result.ok, true);
    assert.equal(result.messages.length, 2);
    assert.equal(result.messages[0].uid, 101);
    assert.equal(result.messages[0].from[0].email, 'prospect@example.com');
    assert.equal(result.messages[1].to[0].email, 'owner@example.com');
    assert.equal(result.cursor.value, 102);
    assert.deepEqual(events, ['connect', 'lock:INBOX', 'release', 'logout']);
  });

  it('acknowledges cursor using UID strategy', async () => {
    const adapter = loadImapSmtpAdapter(buildConnection());
    const result = await adapter.acknowledgeCursor({ value: 42 });

    assert.deepEqual(result, {
      ok: true,
      provider_type: 'imap_smtp',
      status: 'cursor_acknowledged',
      cursor: {
        strategy: 'uid',
        value: 42,
      },
    });
  });

  it('normalizes IMAP fetch failures into provider errors', async () => {
    setImapClientFactoryForTests(() => ({
      async connect() {
        throw Object.assign(new Error('IMAP login failed'), {
          code: 'AUTHFAILED',
          retryable: false,
        });
      },
      async logout() {},
    }));

    const adapter = loadImapSmtpAdapter(buildConnection());

    await assert.rejects(
      () => adapter.fetchInboundMessages({ cursor: 0 }),
      (error) =>
        error.provider_type === 'imap_smtp' &&
        error.operation === 'fetchInboundMessages' &&
        error.code === 'AUTHFAILED',
    );
  });
});
