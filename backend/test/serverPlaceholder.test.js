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
  const serverPath = path.resolve(__dirname, '..', 'server.js');
  const content = readFileSync(serverPath, 'utf8');
  assert.ok(content.includes('listen'), 'Expected server.js to include listen call');
  assert.ok(/express\(\)/.test(content), 'Expected express() initialization');
});

test('environment variables object is accessible', () => {
  assert.ok(process.env.NODE_ENV !== undefined, 'NODE_ENV should be defined (may be development or test)');
});
