/**
 * Unit tests for utils routes
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

let app;
const testPort = 3103;
let server;

async function request(method, path, body) {
  const res = await fetch(`http://localhost:${testPort}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

describe('Utils Routes', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createUtilsRoutes = (await import('../../routes/utils.js')).default;

    app = express();
    app.use(express.json());
    app.use('/api/utils', createUtilsRoutes(null));

    server = app.listen(testPort);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('POST /hash should respond with placeholder message', async () => {
    const res = await request('POST', '/api/utils/hash', { text: 'hello' });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.strictEqual(json.message, 'Hashing not yet implemented');
    assert.strictEqual(json.data.text_length, 5);
  });

  it('POST /generate-uuid should return a uuid', async () => {
    const res = await request('POST', '/api/utils/generate-uuid', {});
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data.uuid && typeof json.data.uuid === 'string');
    // UUID v4 format sanity check
    assert.match(json.data.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
