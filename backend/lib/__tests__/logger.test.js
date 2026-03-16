import test from 'node:test';
import assert from 'node:assert/strict';

import {
  redactEmail,
  sanitizeLogValue,
  summarizeMessagesForLog,
  summarizeToolArgsForLog,
  summarizeRowsForLog,
} from '../logger.js';

test('redactEmail masks mailbox names while preserving domain', () => {
  assert.equal(redactEmail('operator@example.com'), 'op***@example.com');
  assert.equal(redactEmail('x@example.com'), 'x***@example.com');
});

test('sanitizeLogValue redacts secrets and emails inside nested objects', () => {
  const result = sanitizeLogValue({
    email: 'operator@example.com',
    token: 'Bearer abcdefghijklmnopqrstuvwxyz',
    nested: {
      message: 'Contact operator@example.com with sk-12345678901234567890123456789012',
    },
  });

  assert.equal(result.email, 'op***@example.com');
  assert.equal(result.token, '[REDACTED]');
  assert.match(result.nested.message, /op\*\*\*@example.com/);
  assert.match(result.nested.message, /REDACTED/);
});

test('summarizeMessagesForLog reports counts without message content', () => {
  const summary = summarizeMessagesForLog([
    { role: 'user', content: 'Send a follow-up to prospect@example.com' },
    { role: 'assistant', content: 'Done.' },
  ]);

  assert.deepEqual(summary.roles, ['user', 'assistant']);
  assert.equal(summary.count, 2);
  assert.equal(
    summary.contentChars,
    'Send a follow-up to prospect@example.com'.length + 'Done.'.length,
  );
  assert.equal(summary.hasAttachments, false);
});

test('summarizeToolArgsForLog exposes only sanitized previews', () => {
  const summary = summarizeToolArgsForLog({
    email: 'operator@example.com',
    notes: 'Use token sk-12345678901234567890123456789012',
  });

  assert.deepEqual(summary.keys, ['email', 'notes']);
  assert.equal(summary.preview.email, 'op***@example.com');
  assert.match(summary.preview.notes, /REDACTED/);
});

test('summarizeRowsForLog masks row emails', () => {
  const summary = summarizeRowsForLog([
    { id: 'user-1', email: 'operator@example.com', tenant_id: 'tenant-1', role: 'admin' },
  ]);

  assert.deepEqual(summary, [
    {
      id: 'user-1',
      email: 'op***@example.com',
      tenant_id: 'tenant-1',
      role: 'admin',
    },
  ]);
});
