import test from 'node:test';
import assert from 'node:assert/strict';

import {
  redactEmail,
  sanitizeLogValue,
  summarizeMessagesForLog,
  summarizeToolArgsForLog,
  summarizeRowsForLog,
  toSafeErrorMeta,
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

test('sanitizeLogValue redacts sk-proj style inline API keys', () => {
  const result = sanitizeLogValue('Use sk-proj-abc_DEF-12345678901234567890 for this operation');

  assert.match(result, /REDACTED_API_KEY/);
  assert.equal(result.includes('sk-proj-'), false);
});

test('sanitizeLogValue handles circular objects and sensitive nested keys safely', () => {
  const payload = { meta: { token: 'Bearer abcdefghijklmnopqrstuvwxyz' } };
  payload.self = payload;

  const result = sanitizeLogValue(payload);
  assert.equal(result.meta.token, '[REDACTED]');
  assert.equal(result.self, '[Circular]');
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
  // 'notes' is a content-heavy key and should be replaced with length metadata
  assert.match(summary.preview.notes, /\[CONTENT: \d+ chars\]/);
});

test('summarizeToolArgsForLog redacts body/content/prompt fields as content-heavy', () => {
  const summary = summarizeToolArgsForLog({
    subject: 'Meeting follow-up',
    body: '<p>Dear customer, here is your invoice with PII...</p>',
    prompt: 'Write a reply to the customer about their refund request',
    content: 'Some user-generated text that may contain sensitive data',
  });

  assert.deepEqual(summary.keys, ['subject', 'body', 'prompt', 'content']);
  assert.equal(summary.preview.subject, 'Meeting follow-up');
  assert.match(summary.preview.body, /\[CONTENT: \d+ chars\]/);
  assert.match(summary.preview.prompt, /\[CONTENT: \d+ chars\]/);
  assert.match(summary.preview.content, /\[CONTENT: \d+ chars\]/);
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

test('toSafeErrorMeta preserves plain object error fields without nesting them under message', () => {
  const result = toSafeErrorMeta({
    message: 'Bad request for operator@example.com',
    code: 'PGRST116',
    details: 'Use sk-proj-abc_DEF-12345678901234567890',
    hint: 'Contact owner@example.com',
  });

  assert.equal(result.code, 'PGRST116');
  assert.match(result.message, /op\*\*\*@example.com/);
  assert.match(result.details, /REDACTED/);
  assert.match(result.hint, /ow\*\*\*@example.com/);
});

test('toSafeErrorMeta handles Error instances and primitive strings', () => {
  const errorResult = toSafeErrorMeta(
    Object.assign(new Error('Failure for operator@example.com'), { code: 'ERR_TEST' }),
  );
  assert.equal(errorResult.name, 'Error');
  assert.equal(errorResult.code, 'ERR_TEST');
  assert.match(errorResult.message, /op\*\*\*@example.com/);

  const stringResult = toSafeErrorMeta('Bearer abcdefghijklmnopqrstuvwxyz');
  assert.equal(stringResult.message, 'Bearer [REDACTED_TOKEN]');
});
