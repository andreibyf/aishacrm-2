import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import createTemplatesV2Routes from '../../routes/templates.v2.js';

function createSupabaseStub(queuedResponses) {
  const queue = [...queuedResponses];

  const next = () => {
    const item = queue.shift();
    if (!item) throw new Error('No queued Supabase response');
    return item;
  };

  return {
    from(table) {
      assert.equal(table, 'templates');
      const chain = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        insert() {
          return this;
        },
        update() {
          return this;
        },
        single() {
          return Promise.resolve(next());
        },
        maybeSingle() {
          return Promise.resolve(next());
        },
        then(resolve, reject) {
          return Promise.resolve(next()).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

async function createServer(supabase) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = {
      id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      tenant_id: 'acme-tenant',
    };
    next();
  });
  app.use(
    '/api/v2/templates',
    createTemplatesV2Routes(null, { getSupabaseClient: () => supabase }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return server;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('GET /api/v2/templates returns templates list payload', async () => {
  const supabase = createSupabaseStub([
    {
      data: [
        { id: 'tpl-1', name: 'T1', type: 'email', template_json: { blocks: [] }, is_active: true },
      ],
      error: null,
    },
  ]);

  const server = await createServer(supabase);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/templates`);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(Array.isArray(json.data.templates), true);
    assert.equal(json.data.templates.length, 1);
  } finally {
    await closeServer(server);
  }
});

test('POST /api/v2/templates validates template_json.blocks', async () => {
  const supabase = createSupabaseStub([]);
  const server = await createServer(supabase);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid',
        type: 'email',
        template_json: { bad: true },
      }),
    });
    const json = await res.json();

    assert.equal(res.status, 400);
    assert.equal(json.status, 'error');
    assert.match(json.message, /template_json\.blocks must be an array/);
  } finally {
    await closeServer(server);
  }
});

test('POST /api/v2/templates requires at least one block', async () => {
  const supabase = createSupabaseStub([]);
  const server = await createServer(supabase);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Empty Blocks',
        type: 'email',
        template_json: { blocks: [] },
      }),
    });
    const json = await res.json();

    assert.equal(res.status, 400);
    assert.equal(json.status, 'error');
    assert.match(json.message, /template_json\.blocks must include at least one block/);
  } finally {
    await closeServer(server);
  }
});

test('POST /api/v2/templates validates block type and required fields', async () => {
  const supabase = createSupabaseStub([]);
  const server = await createServer(supabase);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Blocks',
        type: 'email',
        template_json: {
          blocks: [
            { type: 'text', content: '' },
            { type: 'button', text: 'Click' },
            { type: 'unknown' },
          ],
        },
      }),
    });
    const json = await res.json();

    assert.equal(res.status, 400);
    assert.equal(json.status, 'error');
    assert.match(json.message, /content is required for text blocks/);
    assert.match(json.message, /url is required for button blocks/);
    assert.match(json.message, /type must be one of: text, image, button, divider/);
  } finally {
    await closeServer(server);
  }
});

test('POST /api/v2/templates rejects non-absolute and non-token block urls', async () => {
  const supabase = createSupabaseStub([]);
  const server = await createServer(supabase);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad URL Blocks',
        type: 'email',
        template_json: {
          blocks: [
            { type: 'image', url: '/assets/logo.png' },
            { type: 'button', text: 'Click', url: 'ftp://example.com' },
          ],
        },
      }),
    });
    const json = await res.json();

    assert.equal(res.status, 400);
    assert.equal(json.status, 'error');
    assert.match(json.message, /must be an absolute http\(s\) URL or a variable token/);
  } finally {
    await closeServer(server);
  }
});

test('DELETE /api/v2/templates/:id performs soft delete', async () => {
  const supabase = createSupabaseStub([
    {
      data: { id: 'tpl-1', is_active: false },
      error: null,
    },
  ]);
  const server = await createServer(supabase);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/templates/tpl-1`, {
      method: 'DELETE',
    });
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(json.data.is_active, false);
  } finally {
    await closeServer(server);
  }
});
