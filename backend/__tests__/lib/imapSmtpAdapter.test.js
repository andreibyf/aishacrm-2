import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadImapSmtpAdapter,
  setImapClientFactoryForTests,
  setTransportFactoryForTests,
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
    setTransportFactoryForTests(null);
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
          source: Buffer.from(
            [
              'Message-ID: <m1@example.com>',
              'Subject: Intro',
              'From: Prospect <prospect@example.com>',
              'To: Owner <owner@example.com>',
              'In-Reply-To: <root@example.com>',
              'References: <root@example.com> <older@example.com>',
              'Content-Type: multipart/alternative; boundary="abc"',
              '',
              '--abc',
              'Content-Type: text/plain; charset="utf-8"',
              '',
              'raw message 1',
              '--abc',
              'Content-Type: text/html; charset="utf-8"',
              '',
              '<p>raw message 1</p>',
              '--abc--',
            ].join('\r\n'),
          ),
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
          source: [
            'Message-ID: <m2@example.com>',
            'Subject: Re: Intro',
            'From: Prospect <prospect@example.com>',
            'To: Owner <owner@example.com>',
            'Content-Type: multipart/mixed; boundary="mix"',
            '',
            '--mix',
            'Content-Type: text/plain; charset="utf-8"',
            '',
            'raw message 2',
            '--mix',
            'Content-Type: application/pdf; name="proposal.pdf"',
            'Content-Disposition: attachment; filename="proposal.pdf"',
            '',
            'JVBERi0xLjQ=',
            '--mix--',
          ].join('\r\n'),
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
    assert.equal(result.messages[0].from.email, 'prospect@example.com');
    assert.equal(result.messages[1].to[0].email, 'owner@example.com');
    assert.equal(result.messages[0].in_reply_to, '<root@example.com>');
    assert.deepEqual(result.messages[0].headers.references, [
      '<root@example.com>',
      '<older@example.com>',
    ]);
    assert.equal(result.messages[0].text_body, 'raw message 1');
    assert.equal(result.messages[0].html_body, '<p>raw message 1</p>');
    assert.equal(result.messages[1].attachments[0].filename, 'proposal.pdf');
    assert.equal(result.cursor.value, 102);
    assert.deepEqual(events, ['connect', 'lock:INBOX', 'release', 'logout']);
  });

  it('decodes quoted-printable text and html bodies during MIME normalization', async () => {
    setImapClientFactoryForTests(() => ({
      async connect() {},
      async getMailboxLock() {
        return {
          release() {},
        };
      },
      async *fetch() {
        yield {
          uid: 201,
          envelope: {
            messageId: '<qp@example.com>',
            subject: 'QP Reply',
            from: [{ name: 'Dre', address: 'dre@example.com' }],
            to: [{ name: 'Owner', address: 'owner@example.com' }],
          },
          internalDate: new Date('2026-03-15T01:44:27Z'),
          flags: [],
          source: Buffer.from(
            [
              'Message-ID: <qp@example.com>',
              'Subject: QP Reply',
              'From: Dre <dre@example.com>',
              'To: Owner <owner@example.com>',
              'Content-Type: multipart/alternative; boundary="qp"',
              '',
              '--qp',
              'Content-Type: text/plain; charset="utf-8"',
              'Content-Transfer-Encoding: quoted-printable',
              '',
              'Sending hopefully last reply test 2144hrs On Sat, Mar 14, 2026 at 8:34=E2=80=AFPM',
              '--qp',
              'Content-Type: text/html; charset="utf-8"',
              'Content-Transfer-Encoding: quoted-printable',
              '',
              '<p>Line one=3A test=E2=80=94ok</p>',
              '--qp--',
            ].join('\r\n'),
          ),
        };
      },
      async logout() {},
    }));

    const adapter = loadImapSmtpAdapter(buildConnection());
    const result = await adapter.fetchInboundMessages({ cursor: 200, limit: 10 });

    assert.equal(result.messages.length, 1);
    assert.equal(
      result.messages[0].text_body,
      'Sending hopefully last reply test 2144hrs On Sat, Mar 14, 2026 at 8:34 PM',
    );
    assert.equal(result.messages[0].html_body, '<p>Line one: test—ok</p>');
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

  it('verifies IMAP and SMTP connectivity for connection health', async () => {
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
      async logout() {
        events.push('logout');
      },
    }));
    setTransportFactoryForTests(() => ({
      async verify() {
        events.push('verify');
      },
      close() {
        events.push('close');
      },
    }));

    const adapter = loadImapSmtpAdapter(buildConnection());
    const result = await adapter.getConnectionHealth();

    assert.equal(result.ok, true);
    assert.equal(result.status, 'connected');
    assert.equal(result.provider_name, 'zoho_mail');
    assert.deepEqual(events, ['connect', 'lock:INBOX', 'release', 'verify', 'logout', 'close']);
  });

  it('normalizes connection health failures into provider errors', async () => {
    setImapClientFactoryForTests(() => ({
      async connect() {
        throw Object.assign(new Error('connect failed'), {
          code: 'ECONNREFUSED',
        });
      },
      async logout() {},
    }));
    setTransportFactoryForTests(() => ({
      async verify() {},
      close() {},
    }));

    const adapter = loadImapSmtpAdapter(buildConnection());

    await assert.rejects(
      () => adapter.getConnectionHealth(),
      (error) =>
        error.provider_type === 'imap_smtp' &&
        error.operation === 'getConnectionHealth' &&
        error.code === 'ECONNREFUSED',
    );
  });
});
