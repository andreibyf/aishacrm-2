import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { normalizeCommunicationsProviderError } from '../providerAdapter.js';

let imapClientFactory = (config) => new ImapFlow(config);
let transportFactory = (config) => nodemailer.createTransport(config);

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
        attachments: Array.isArray(message.attachments) ? message.attachments : undefined,
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
      const client = createImapSmtpImapClient(connection);
      const transport = createImapSmtpTransport(connection);
      const folder = config.inbound?.folder || 'INBOX';

      return {
        ...(await verifyImapSmtpHealth({
          client,
          transport,
          folder,
          providerName: config.provider_name || null,
          mailboxId: config.mailbox_id || null,
          inboundHost: config.inbound?.host || null,
          outboundHost: config.outbound?.host || null,
        })),
      };
    },
  };
}

export function createImapSmtpTransport(connection) {
  const config = connection?.config || {};
  const credentials = connection?.api_credentials || {};
  const outbound = config.outbound || {};

  return transportFactory({
    host: outbound.host,
    port: outbound.port,
    secure: outbound.secure === true,
    auth: {
      user: credentials.outbound_username,
      pass: credentials.outbound_password,
    },
  });
}

async function verifyImapSmtpHealth({
  client,
  transport,
  folder,
  providerName,
  mailboxId,
  inboundHost,
  outboundHost,
}) {
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    lock.release();
    if (typeof transport.verify === 'function') {
      await transport.verify();
    }

    return {
      ok: true,
      provider_type: 'imap_smtp',
      provider_name: providerName,
      mailbox_id: mailboxId,
      inbound_host: inboundHost,
      outbound_host: outboundHost,
      status: 'connected',
    };
  } catch (error) {
    throw normalizeCommunicationsProviderError(error, {
      provider_type: 'imap_smtp',
      provider_name: providerName,
      operation: 'getConnectionHealth',
    });
  } finally {
    await safeClientLogout(client);
    if (transport && typeof transport.close === 'function') {
      try {
        transport.close();
      } catch (_error) {
        // ignore transport close failures during health checks
      }
    }
  }
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
  const rawMime = parseMimeSource(rawSource);
  const envelopeFrom = normalizeAddressList(envelope.from);
  const envelopeTo = normalizeAddressList(envelope.to);
  const envelopeCc = normalizeAddressList(envelope.cc);
  const envelopeBcc = normalizeAddressList(envelope.bcc);
  const from = rawMime.from || envelopeFrom[0] || { name: '', email: '' };
  const to = rawMime.to.length > 0 ? rawMime.to : envelopeTo;
  const cc = rawMime.cc.length > 0 ? rawMime.cc : envelopeCc;
  const bcc = rawMime.bcc.length > 0 ? rawMime.bcc : envelopeBcc;

  return {
    provider_cursor: message?.uid || null,
    uid: message?.uid || null,
    message_id: rawMime.messageId || envelope.messageId || null,
    subject: rawMime.subject || envelope.subject || '',
    from,
    to,
    cc,
    bcc,
    in_reply_to: rawMime.inReplyTo || null,
    headers: {
      ...rawMime.headers,
      in_reply_to: rawMime.inReplyTo || null,
      references: rawMime.references,
      message_id: rawMime.messageId || envelope.messageId || null,
      subject: rawMime.subject || envelope.subject || '',
    },
    text_body: rawMime.textBody,
    html_body: rawMime.htmlBody,
    attachments: rawMime.attachments,
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

function parseMimeSource(rawSource) {
  const source =
    typeof rawSource === 'string'
      ? rawSource
      : Buffer.isBuffer(rawSource)
        ? rawSource.toString('utf8')
        : '';

  if (!source) {
    return {
      headers: {},
      messageId: null,
      subject: '',
      inReplyTo: null,
      references: [],
      from: null,
      to: [],
      cc: [],
      bcc: [],
      textBody: '',
      htmlBody: '',
      attachments: [],
    };
  }

  const { headerText, bodyText } = splitMimeHeaderAndBody(source);
  const headers = parseMimeHeaders(headerText);
  const contentType = headers['content-type'] || 'text/plain';
  const { textBody, htmlBody, attachments } = parseMimeBody(bodyText, contentType);

  return {
    headers,
    messageId: headers['message-id'] || null,
    subject: headers.subject || '',
    inReplyTo: headers['in-reply-to'] || null,
    references: splitReferences(headers.references),
    from: parseSingleAddress(headers.from),
    to: parseAddressList(headers.to),
    cc: parseAddressList(headers.cc),
    bcc: parseAddressList(headers.bcc),
    textBody,
    htmlBody,
    attachments,
  };
}

function splitMimeHeaderAndBody(source) {
  const separatorMatch = source.match(/\r?\n\r?\n/);
  if (!separatorMatch) {
    return {
      headerText: source,
      bodyText: '',
    };
  }

  const separatorIndex = separatorMatch.index ?? source.length;
  const separatorLength = separatorMatch[0].length;
  return {
    headerText: source.slice(0, separatorIndex),
    bodyText: source.slice(separatorIndex + separatorLength),
  };
}

function parseMimeHeaders(headerText) {
  const lines = String(headerText || '').split(/\r?\n/);
  const unfolded = [];
  for (const line of lines) {
    if (/^\s/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += ` ${line.trim()}`;
    } else {
      unfolded.push(line);
    }
  }

  const headers = {};
  for (const line of unfolded) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function parseMimeBody(bodyText, contentTypeHeader) {
  const contentType = String(contentTypeHeader || '').toLowerCase();
  const boundary = extractMimeBoundary(contentTypeHeader);

  if (contentType.includes('multipart/') && boundary) {
    return parseMultipartBody(bodyText, boundary);
  }

  const disposition = '';
  const filename = extractMimeFilename(contentTypeHeader, disposition);
  if (filename) {
    return {
      textBody: '',
      htmlBody: '',
      attachments: [
        {
          filename,
          content_type: extractMimeType(contentTypeHeader),
          size: Buffer.byteLength(bodyText || '', 'utf8'),
          disposition: 'attachment',
          content_id: null,
        },
      ],
    };
  }

  if (contentType.includes('text/html')) {
    return {
      textBody: '',
      htmlBody: decodeMimeTextBody(bodyText, contentTypeHeader, '').trim(),
      attachments: [],
    };
  }

  return {
    textBody: decodeMimeTextBody(bodyText, contentTypeHeader, '').trim(),
    htmlBody: '',
    attachments: [],
  };
}

function parseMultipartBody(bodyText, boundary) {
  const parts = String(bodyText || '')
    .split(`--${boundary}`)
    .map((part) => part.trim())
    .filter((part) => part && part !== '--');

  let textBody = '';
  let htmlBody = '';
  const attachments = [];

  for (const part of parts) {
    const cleanedPart = part.endsWith('--') ? part.slice(0, -2).trim() : part;
    const { headerText, bodyText: partBody } = splitMimeHeaderAndBody(cleanedPart);
    const headers = parseMimeHeaders(headerText);
    const contentType = headers['content-type'] || 'text/plain';
    const disposition = headers['content-disposition'] || '';
    const filename = extractMimeFilename(contentType, disposition);

    if (String(disposition).toLowerCase().includes('attachment') || filename) {
      attachments.push({
        filename: filename || `attachment-${attachments.length + 1}`,
        content_type: extractMimeType(contentType),
        size: Buffer.byteLength(partBody || '', 'utf8'),
        disposition: String(disposition || 'attachment')
          .split(';')[0]
          .trim()
          .toLowerCase(),
        content_id: headers['content-id'] || null,
      });
      continue;
    }

    if (String(contentType).toLowerCase().includes('text/html')) {
      htmlBody = decodeMimeTextBody(
        partBody,
        contentType,
        headers['content-transfer-encoding'],
      ).trim();
      continue;
    }

    if (String(contentType).toLowerCase().includes('text/plain')) {
      textBody = decodeMimeTextBody(
        partBody,
        contentType,
        headers['content-transfer-encoding'],
      ).trim();
    }
  }

  return {
    textBody,
    htmlBody,
    attachments,
  };
}

function extractMimeBoundary(contentTypeHeader) {
  const match = String(contentTypeHeader || '').match(/boundary="?([^";]+)"?/i);
  return match?.[1] || null;
}

function extractMimeType(contentTypeHeader) {
  return String(contentTypeHeader || 'application/octet-stream')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function extractMimeFilename(contentTypeHeader, dispositionHeader) {
  const combined = `${contentTypeHeader || ''}; ${dispositionHeader || ''}`;
  const match = combined.match(/filename\*?="?([^";]+)"?/i) || combined.match(/name="?([^";]+)"?/i);
  return match?.[1] || null;
}

function decodeMimeTextBody(bodyText, contentTypeHeader, transferEncodingHeader) {
  const raw = String(bodyText || '');
  if (!raw) {
    return '';
  }

  const transferEncoding = String(transferEncodingHeader || '')
    .trim()
    .toLowerCase();
  let decodedBuffer;

  if (transferEncoding === 'quoted-printable') {
    decodedBuffer = decodeQuotedPrintableToBuffer(raw);
  } else if (transferEncoding === 'base64') {
    const normalized = raw.replace(/\s+/g, '');
    decodedBuffer = Buffer.from(normalized, 'base64');
  } else {
    return raw;
  }

  return decodeBufferWithCharset(decodedBuffer, extractMimeCharset(contentTypeHeader));
}

function decodeQuotedPrintableToBuffer(input) {
  const normalized = String(input || '')
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));

  return Buffer.from(normalized, 'binary');
}

function extractMimeCharset(contentTypeHeader) {
  const match = String(contentTypeHeader || '').match(/charset="?([^";]+)"?/i);
  return match?.[1]?.trim().toLowerCase() || 'utf-8';
}

function decodeBufferWithCharset(buffer, charset) {
  if (!Buffer.isBuffer(buffer)) {
    return '';
  }

  if (charset === 'utf-8' || charset === 'utf8' || charset === 'us-ascii' || charset === 'ascii') {
    return buffer.toString('utf8');
  }

  if (charset === 'latin1' || charset === 'iso-8859-1' || charset === 'windows-1252') {
    return buffer.toString('latin1');
  }

  return buffer.toString('utf8');
}

function splitReferences(value) {
  return String(value || '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseSingleAddress(value) {
  return parseAddressList(value)[0] || { name: '', email: '' };
}

function parseAddressList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*)<([^>]+)>$/);
      if (match) {
        return {
          name: match[1].trim().replace(/^"|"$/g, ''),
          email: match[2].trim().toLowerCase(),
        };
      }
      return {
        name: '',
        email: entry.replace(/^<|>$/g, '').trim().toLowerCase(),
      };
    })
    .filter((entry) => entry.email);
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

export function setTransportFactoryForTests(factory) {
  transportFactory = factory || ((config) => nodemailer.createTransport(config));
}

export default {
  loadImapSmtpAdapter,
  createImapSmtpTransport,
  createImapSmtpImapClient,
  setImapClientFactoryForTests,
  setTransportFactoryForTests,
};
