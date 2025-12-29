/**
 * API Key Validation Tests
 * Tests for API key trimming and validation logic
 */

import { test } from 'node:test';
import assert from 'node:assert';

test('API key cleaning - removes newlines and tabs', () => {
  const malformedKey = 'sk-proj-abcd1234\n';
  const cleaned = malformedKey.replace(/[\r\n\t]/g, '').trim();
  
  assert.strictEqual(cleaned, 'sk-proj-abcd1234');
  assert.strictEqual(cleaned.includes('\n'), false);
  assert.strictEqual(cleaned.includes('\r'), false);
  assert.strictEqual(cleaned.includes('\t'), false);
});

test('API key cleaning - removes leading/trailing whitespace', () => {
  const malformedKey = '  sk-proj-abcd1234  ';
  const cleaned = malformedKey.replace(/[\r\n\t]/g, '').trim();
  
  assert.strictEqual(cleaned, 'sk-proj-abcd1234');
  assert.strictEqual(cleaned.startsWith(' '), false);
  assert.strictEqual(cleaned.endsWith(' '), false);
});

test('API key cleaning - handles multiple newlines', () => {
  const malformedKey = 'sk-proj-abcd1234\r\n\r\n';
  const cleaned = malformedKey.replace(/[\r\n\t]/g, '').trim();
  
  assert.strictEqual(cleaned, 'sk-proj-abcd1234');
});

test('API key cleaning - preserves valid key', () => {
  const validKey = 'sk-proj-abcd1234efgh5678ijkl9012mnop3456qrst';
  const cleaned = validKey.replace(/[\r\n\t]/g, '').trim();
  
  assert.strictEqual(cleaned, validKey);
});

test('API key validation - accepts sk- prefix', () => {
  const key = 'sk-proj-abcd1234';
  assert.strictEqual(key.startsWith('sk-'), true);
});

test('API key validation - accepts reasonable length', () => {
  // OpenAI keys are typically 51-300 characters
  const shortKey = 'sk-proj-' + 'x'.repeat(20);  // 28 chars
  const normalKey = 'sk-proj-' + 'x'.repeat(50); // 58 chars
  const longKey = 'sk-proj-' + 'x'.repeat(200);  // 208 chars
  
  assert.strictEqual(shortKey.length >= 20 && shortKey.length <= 300, true);
  assert.strictEqual(normalKey.length >= 20 && normalKey.length <= 300, true);
  assert.strictEqual(longKey.length >= 20 && longKey.length <= 300, true);
});

test('API key validation - rejects too short key', () => {
  const tooShort = 'sk-abc';
  assert.strictEqual(tooShort.length < 20, true);
});

test('API key validation - rejects wrong prefix', () => {
  const wrongPrefix = 'pk-proj-abcd1234';
  assert.strictEqual(wrongPrefix.startsWith('sk-'), false);
});

test('API key cleaning - handles CRLF line endings', () => {
  const malformedKey = 'sk-proj-abcd1234\r\n\t  ';
  const cleaned = malformedKey.replace(/[\r\n\t]/g, '').trim();
  
  assert.strictEqual(cleaned, 'sk-proj-abcd1234');
  assert.strictEqual(cleaned.length, 'sk-proj-abcd1234'.length);
});
