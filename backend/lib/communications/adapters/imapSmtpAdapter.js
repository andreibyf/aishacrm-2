import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { normalizeCommunicationsProviderError } from '../providerAdapter.js';

let imapClientFactory = (config) => new ImapFlow(config);

export function loadImapSmtpAdapter(connection) {
  const config = connection?.config || {};

  return {
    providerType: 'imap_smtp',
    connection,

    async fetchInboundMessages(options = {}) {
      const client = createImapSmtpImapClient(connection);
      const folder = config.inbound?.folder || 'INBOX';
      const cursor = normalizeUidCursor(options.cursor);
      const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 25;
      const startUid = Math.max(1, cursor + 1);
      const messages = [];

      try {
        await client.connect();
        const lock = await client.getMailboxLock(folder);

        try {
          const fetchQuery = {
            uid: true,
            envelope: true,
            source: true,
            flags: true,
            internalDate: true,
          };

          for await (const message of client.fetch(`${startUid}:*`, fetchQuery, { uid: true })) {
            messages.push(normalizeImapMessage(message));
            if (messages.length >= limit) {
              break;
            }
          }
        } finally {
          lock.release();
        }

        const nextCursor =
          messages.length > 0 ? messages[messages.length - 1].provider_cursor : cursor || null;

        return {
          ok: true,
          provider_type: 'imap_smtp',
          provider_name: config.provider_name || null,
          mailbox_id: config.mailbox_id || null,
          messages,
          cursor: {
            strategy: 'uid',
            value: nextCursor,
          },
        };
      } catch (error) {
        throw normalizeCommunicationsProviderError(error, {
          provider_type: 'imap_smtp',
          provider_name: config.provider_name || null,
          operation: 'fetchInboundMessages',
        });
      } finally {
        await safeClientLogout(client);
      }
    },

    async acknowledgeCursor(cursor) {
      return {
        ok: true,
        provider_type: 'imap_smtp',
        status: 'cursor_acknowledged',
        cursor: {
          strategy: 'uid',
          value: normalizeUidCursor(cursor),
        },
      };
    },

    async sendMessage(message = {}) {
      const transport = createImapSmtpTransport(connection);
      const mail = {
        from: message.from || config.outbound?.from_address,
        to: Array.isArray(message.to) ? message.to.join(',') : message.to,
        cc: Array.isArray(message.cc) ? message.cc.join(',') : message.cc,
        bcc: Array.isArray(message.bcc) ? message.bcc.join(',') : message.bcc,
        replyTo: message.reply_to || config.outbound?.reply_to_address || undefined,
        subject: message.subject || '',
        text: message.text_body || '',
        html: message.html_body || undefined,
        headers: message.headers || undefined,
      };

      try {
        const info = await transport.sendMail(mail);
        return {
          ok: true,
          provider_type: 'imap_smtp',
          message_id: info?.messageId || null,
          accepted: info?.accepted || [],
          rejected: info?.rejected || [],
          response: info?.response || null,
        };
      } catch (error) {
        throw normalizeCommunicationsProviderError(error, {
          provider_type: 'imap_smtp',
          provider_name: config.provider_name || null,
          operation: 'sendMessage',
        });
      }
    },

    normalizeProviderError(error, context = {}) {
      return normalizeCommunicationsProviderError(error, {
        provider_type: 'imap_smtp',
        provider_name: config.provider_name || null,
        ...context,
      });
    },

    async getConnectionHealth() {
      return {
        ok: true,
        provider_type: 'imap_smtp',
        provider_name: config.provider_name || null,
        mailbox_id: config.mailbox_id || null,
        inbound_host: config.inbound?.host || null,
        outbound_host: config.outbound?.host || null,
        status: 'configured',
      };
    },
  };
}

export function createImapSmtpTransport(connection) {
  const config = connection?.config || {};
  const credentials = connection?.api_credentials || {};
  const outbound = config.outbound || {};

  return nodemailer.createTransport({
    host: outbound.host,
    port: outbound.port,
    secure: outbound.secure === true,
    auth: {
      user: credentials.outbound_username,
      pass: credentials.outbound_password,
    },
  });
}

export function createImapSmtpImapClient(connection) {
  const config = connection?.config || {};
  const credentials = connection?.api_credentials || {};
  const inbound = config.inbound || {};

  return imapClientFactory({
    host: inbound.host,
    port: inbound.port,
    secure: inbound.secure !== false,
    auth: {
      user: credentials.inbound_username,
      pass: credentials.inbound_password,
    },
    logger: false,
  });
}

function normalizeUidCursor(cursor) {
  if (cursor && typeof cursor === 'object' && Number.isInteger(cursor.value)) {
    return cursor.value;
  }

  if (Number.isInteger(cursor)) {
    return cursor;
  }

  return 0;
}

function normalizeImapMessage(message) {
  const envelope = message?.envelope || {};
  const rawSource = message?.source;

  return {
    provider_cursor: message?.uid || null,
    uid: message?.uid || null,
    message_id: envelope.messageId || null,
    subject: envelope.subject || '',
    from: normalizeAddressList(envelope.from),
    to: normalizeAddressList(envelope.to),
    cc: normalizeAddressList(envelope.cc),
    bcc: normalizeAddressList(envelope.bcc),
    received_at: message?.internalDate ? new Date(message.internalDate).toISOString() : null,
    flags: Array.isArray(message?.flags) ? [...message.flags] : [],
    raw_source:
      typeof rawSource === 'string'
        ? rawSource
        : Buffer.isBuffer(rawSource)
          ? rawSource.toString('utf8')
          : null,
  };
}

function normalizeAddressList(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        name: entry?.name || '',
        email: buildEnvelopeAddress(entry),
      }))
    : [];
}

function buildEnvelopeAddress(entry) {
  if (!entry) return '';
  if (entry.address) return entry.address;

  const mailbox = entry.mailbox || '';
  const host = entry.host || '';
  return mailbox && host ? `${mailbox}@${host}` : '';
}

async function safeClientLogout(client) {
  if (!client || typeof client.logout !== 'function') {
    return;
  }

  try {
    await client.logout();
  } catch (_error) {
    // ignore logout failures during worker cleanup
  }
}

export function setImapClientFactoryForTests(factory) {
  imapClientFactory = factory || ((config) => new ImapFlow(config));
}

export default {
  loadImapSmtpAdapter,
  createImapSmtpTransport,
  createImapSmtpImapClient,
  setImapClientFactoryForTests,
};
