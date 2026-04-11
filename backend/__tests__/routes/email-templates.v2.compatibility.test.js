import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import createEmailTemplateRoutes from '../../routes/email-templates.v2.js';

function createQueuedSupabase(responses, capturedQueries = []) {
  const queue = [...responses];

  return {
    from(table) {
      assert.equal(table, 'email_template');
      const state = {
        table,
        select: null,
        filters: [],
        orClause: null,
        orderBy: [],
      };

      const chain = {
        select(value) {
          state.select = value;
          return this;
        },
        or(value) {
          state.orClause = value;
          return this;
        },
        eq(field, value) {
          state.filters.push({ field, value });
          return this;
        },
        order(field, options) {
          state.orderBy.push({ field, options });
          return this;
        },
        then(resolve, reject) {
          capturedQueries.push({ ...state });
          const next = queue.shift();
          if (!next) {
            return Promise.reject(new Error('No stubbed response left in query queue')).then(
              resolve,
              reject,
            );
          }
          return Promise.resolve(next).then(resolve, reject);
        },
      };

      return chain;
    },
  };
}

async function createServer({ supabaseClient, tenant } = {}) {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    req.tenant = tenant || {
      id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      tenant_id: 'acme-tenant',
    };
    next();
  });

  app.use(
    '/api/v2/email-templates',
    createEmailTemplateRoutes(null, { getSupabaseClient: () => supabaseClient }),
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return server;
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test('GET /api/v2/email-templates retries without description when description column is missing', async () => {
  const queries = [];
  const supabase = createQueuedSupabase(
    [
      {
        data: null,
        error: { message: 'column "description" of relation "email_template" does not exist' },
      },
      {
        data: [
          {
            id: 'tpl-1',
            name: 'Fallback Template',
            category: 'general',
            subject_template: 'Hello',
            body_prompt: 'Body',
            entity_types: null,
            variables: [],
            is_system: false,
            is_active: true,
            usage_count: 0,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        error: null,
      },
    ],
    queries,
  );

  const server = await createServer({
    supabaseClient: supabase,
    tenant: {
      id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    },
  });
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/email-templates`);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].description, null);

    assert.equal(queries.length, 2);
    assert.ok(String(queries[0].select).includes('description'));
    assert.ok(!String(queries[1].select).includes('description'));
  } finally {
    await closeServer(server);
  }
});

test('GET /api/v2/email-templates maps legacy schema rows when modern columns are missing', async () => {
  const supabase = createQueuedSupabase([
    {
      data: null,
      error: { message: 'email_template.category does not exist' },
    },
    {
      data: null,
      error: { message: 'email_template.category does not exist' },
    },
    {
      data: [
        {
          id: 'legacy-1',
          name: 'Legacy Template',
          subject: 'Legacy Subject',
          body: 'Legacy Body',
          type: 'follow_up',
          variables: [{ name: 'first_name' }],
          metadata: { description: 'Legacy description' },
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    },
    {
      data: [],
      error: null,
    },
  ]);

  const server = await createServer({ supabaseClient: supabase });
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/email-templates`);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].subject_template, 'Legacy Subject');
    assert.equal(json.data[0].body_prompt, 'Legacy Body');
    assert.equal(json.data[0].category, 'follow_up');
    assert.equal(json.data[0].description, 'Legacy description');
  } finally {
    await closeServer(server);
  }
});

test('GET /api/v2/email-templates de-duplicates UUID and slug legacy rows', async () => {
  const tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
  const tenantSlug = 'acme-tenant';

  const supabase = createQueuedSupabase([
    {
      data: null,
      error: { message: 'email_template.category does not exist' },
    },
    {
      data: null,
      error: { message: 'email_template.category does not exist' },
    },
    {
      data: [
        {
          id: 'dup-row',
          name: 'Duplicated Legacy Row',
          subject: 'Hi',
          body: 'Body',
          type: 'general',
          variables: [],
          metadata: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    },
    {
      data: [
        {
          id: 'dup-row',
          name: 'Duplicated Legacy Row',
          subject: 'Hi',
          body: 'Body',
          type: 'general',
          variables: [],
          metadata: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'slug-only-row',
          name: 'Slug Legacy Row',
          subject: 'Hi 2',
          body: 'Body 2',
          type: 'general',
          variables: [],
          metadata: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      error: null,
    },
  ]);

  const server = await createServer({
    supabaseClient: supabase,
    tenant: { id: tenantId, tenant_id: tenantSlug },
  });

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v2/email-templates`);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.status, 'success');
    assert.equal(json.data.length, 2);

    const ids = json.data.map((row) => row.id).sort();
    assert.deepEqual(ids, ['dup-row', 'slug-only-row']);
  } finally {
    await closeServer(server);
  }
});
