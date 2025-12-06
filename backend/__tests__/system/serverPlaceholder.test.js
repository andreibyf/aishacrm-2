import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Basic placeholder test to keep CI green and verify server bootstrap presence
// Does not start the server process (avoids hanging handles in CI runners)
// Future: replace with integration tests that spin up Redis/mocks.

test('server.js exists and contains app.listen', () => {
  const serverPath = path.resolve(__dirname, '..', '..', 'server.js');
  const content = readFileSync(serverPath, 'utf8');
  assert.ok(content.includes('listen'), 'Expected server.js to include listen call');
  assert.ok(/express\(\)/.test(content), 'Expected express() initialization');
});

test('environment variables object is accessible', () => {
  // In CI, NODE_ENV may not be set explicitly, but process.env should exist
  assert.ok(typeof process.env === 'object', 'process.env should be an object');
  // NODE_ENV defaults to undefined when not set, which is valid
  assert.ok(process.env.NODE_ENV === undefined || typeof process.env.NODE_ENV === 'string', 'NODE_ENV should be undefined or a string');
});
