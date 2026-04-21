/**
 * Regression tests for backend/routes/fieldcustomization.js
 *
 * Primary focus: the tenant_id-resolution bug that shipped historically.
 * The route was reading req.tenant?.id, but the mount chain does not
 * include validateTenantAccess — so tenant_id was always undefined and
 * the insert silently used NULL (masked by a nullable column until
 * migration 106 added NOT NULL).
 *
 * These tests ensure:
 *   1. POST correctly pulls tenant_id from req.user.tenant_id
 *   2. Missing tenant context returns a clean 400, never a 500
 *   3. All 5 handlers refuse to proceed without tenant context
 *
 * Uses supertest + in-process express + DI-mocked supabase client,
 * matching the billing.routes.test.js pattern.
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createFieldCustomizationRoutes from '../../routes/fieldcustomization.js';

const TENANT_ID = '6cb4c008-4847-426a-9a2e-918ad70e7b69';
const OTHER_USER_ID = 'u-test-1';

/**
 * Minimal chainable supabase mock that captures all builder calls and
 * returns a configurable final result. Enough for the field_customization
 * route's call shapes: from().select().eq().order()... / insert().select().single()
 * / update().eq().select().single() / delete().eq()
 */
function createSupabaseMock({ finalResult = { data: null, error: null } } = {}) {
  const calls = [];

  const builder = {
    // terminal: returns result
    _result: finalResult,
    // terminal: single() returns a thenable resolving to result
    single() {
      calls.push(['single']);
      return Promise.resolve(this._result);
    },
    // thenable so `await supabase.from(x).select().eq(...)` resolves
    then(onFulfilled, onRejected) {
      return Promise.resolve(this._result).then(onFulfilled, onRejected);
    },
  };

  // Chainable methods just push and return self
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'order']) {
    builder[method] = function (...args) {
      calls.push([method, ...args]);
      return this;
    };
  }

  const client = {
    from(table) {
      calls.push(['from', table]);
      return builder;
    },
  };

  return { client, calls, setResult: (r) => (builder._result = r) };
}

function buildApp({ user, supabase }) {
  const app = express();
  app.use(express.json());
  // Simulate authenticateRequest by directly attaching req.user
  app.use((req, _res, next) => {
    if (user) req.user = user;
    next();
  });
  app.use(
    '/api/fieldcustomizations',
    createFieldCustomizationRoutes(null, { getSupabaseClient: () => supabase }),
  );
  return app;
}

describe('fieldcustomization route — tenant_id resolution regression', () => {
  let mock;

  beforeEach(() => {
    mock = createSupabaseMock();
  });

  test('POST / uses req.user.tenant_id in the insert payload', async () => {
    mock.setResult({
      data: {
        id: 'fc-1',
        tenant_id: TENANT_ID,
        entity_type: 'Opportunity',
        field_name: 'custom_budget',
        label: 'Budget',
      },
      error: null,
    });

    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', tenant_id: TENANT_ID, role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app).post('/api/fieldcustomizations').send({
      entity_name: 'Opportunity',
      field_name: 'budget',
      label: 'Budget',
      field_type: 'number',
    });

    assert.equal(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);

    // Find the insert() call and verify tenant_id is the authenticated user's
    const insertCall = mock.calls.find((c) => c[0] === 'insert');
    assert.ok(insertCall, 'expected an insert() call on the supabase client');
    const payload = insertCall[1];
    assert.equal(
      payload.tenant_id,
      TENANT_ID,
      `insert payload must carry req.user.tenant_id, got ${payload.tenant_id}`,
    );
    assert.equal(payload.entity_type, 'Opportunity');
    assert.equal(payload.field_name, 'custom_budget', 'custom_ prefix must be auto-applied');
  });

  test('POST / falls back to req.user.tenant_uuid when tenant_id missing', async () => {
    mock.setResult({
      data: { id: 'fc-2', tenant_id: TENANT_ID },
      error: null,
    });

    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', tenant_uuid: TENANT_ID, role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app)
      .post('/api/fieldcustomizations')
      .send({ entity_name: 'Opportunity', field_name: 'x', label: 'X' });

    assert.equal(res.status, 201);
    const insertCall = mock.calls.find((c) => c[0] === 'insert');
    assert.equal(insertCall[1].tenant_id, TENANT_ID);
  });

  test('POST / returns 400 (NOT 500) when user has no tenant context', async () => {
    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', role: 'admin' }, // no tenant_id, no tenant_uuid
      supabase: mock.client,
    });

    const res = await request(app)
      .post('/api/fieldcustomizations')
      .send({ entity_name: 'Opportunity', field_name: 'x', label: 'X' });

    assert.equal(
      res.status,
      400,
      `expected 400 for missing tenant context, got ${res.status} (was the regression — used to be 500 from NOT NULL)`,
    );
    assert.equal(res.body.status, 'error');
    assert.match(res.body.message, /tenant/i);

    // Crucially: no supabase insert should have been attempted
    const insertCall = mock.calls.find((c) => c[0] === 'insert');
    assert.equal(insertCall, undefined, 'must not attempt insert when tenant context missing');
  });

  test('POST / returns 401 when unauthenticated (requireAuth guard)', async () => {
    const app = buildApp({ user: null, supabase: mock.client });

    const res = await request(app)
      .post('/api/fieldcustomizations')
      .send({ entity_name: 'Opportunity', field_name: 'x', label: 'X' });

    assert.equal(res.status, 401);
  });

  test('GET / filters by req.user.tenant_id', async () => {
    mock.setResult({ data: [], error: null });

    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', tenant_id: TENANT_ID, role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app).get('/api/fieldcustomizations');
    assert.equal(res.status, 200);

    // Verify .eq('tenant_id', TENANT_ID) was invoked
    const eqCall = mock.calls.find(
      (c) => c[0] === 'eq' && c[1] === 'tenant_id' && c[2] === TENANT_ID,
    );
    assert.ok(
      eqCall,
      `expected eq('tenant_id', '${TENANT_ID}'), got calls: ${JSON.stringify(mock.calls)}`,
    );
  });

  test('GET / returns 400 when user has no tenant context', async () => {
    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app).get('/api/fieldcustomizations');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /tenant/i);
  });

  test('PUT /:id returns 400 when user has no tenant context', async () => {
    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app).put('/api/fieldcustomizations/some-id').send({ label: 'New' });
    assert.equal(res.status, 400);
  });

  test('DELETE /:id returns 400 when user has no tenant context', async () => {
    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app).delete('/api/fieldcustomizations/some-id');
    assert.equal(res.status, 400);
  });

  test('GET /:id returns 400 when user has no tenant context', async () => {
    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app).get('/api/fieldcustomizations/some-id');
    assert.equal(res.status, 400);
  });
});

describe('fieldcustomization route — API/DB shape normalization', () => {
  let mock;
  beforeEach(() => {
    mock = createSupabaseMock();
  });

  test('POST / translates entity_name → entity_type and folds flat keys into metadata', async () => {
    mock.setResult({
      data: {
        id: 'fc-3',
        tenant_id: TENANT_ID,
        entity_type: 'Contact',
        field_name: 'custom_priority',
        label: 'Priority',
        is_visible: true,
        is_required: false,
        options: [],
        metadata: {
          is_custom: true,
          field_type: 'select',
          placeholder: 'Pick one',
          help_text: 'Business priority',
          display_order: 3,
        },
      },
      error: null,
    });

    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', tenant_id: TENANT_ID, role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app)
      .post('/api/fieldcustomizations')
      .send({
        entity_name: 'Contact',
        field_name: 'priority',
        label: 'Priority',
        field_type: 'select',
        placeholder: 'Pick one',
        help_text: 'Business priority',
        display_order: 3,
        options: [{ value: 'hi', label: 'High' }],
      });

    assert.equal(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);

    // 1. Verify DB-shape insert: entity_type set, metadata holds nested keys
    const insertCall = mock.calls.find((c) => c[0] === 'insert');
    const payload = insertCall[1];
    assert.equal(payload.entity_type, 'Contact', 'entity_name must be translated to entity_type');
    assert.equal(payload.entity_name, undefined, 'entity_name must NOT be sent to DB');
    assert.equal(
      payload.field_type,
      undefined,
      'field_type must be folded into metadata, not top-level',
    );
    assert.equal(payload.placeholder, undefined, 'placeholder must be folded into metadata');
    assert.equal(payload.help_text, undefined, 'help_text must be folded into metadata');
    assert.equal(payload.display_order, undefined, 'display_order must be folded into metadata');
    assert.equal(payload.metadata.field_type, 'select');
    assert.equal(payload.metadata.placeholder, 'Pick one');
    assert.equal(payload.metadata.help_text, 'Business priority');
    assert.equal(payload.metadata.display_order, 3);
    assert.equal(payload.metadata.is_custom, true);
    // Regression: options must NOT be double-stringified
    assert.ok(
      Array.isArray(payload.options),
      `options must be an array, got ${typeof payload.options}`,
    );
    assert.equal(payload.options.length, 1);

    // 2. Verify API-shape response: entity_name set, nested keys flattened
    assert.equal(
      res.body.entity_name,
      'Contact',
      'response must expose entity_name (not entity_type)',
    );
    assert.equal(res.body.field_type, 'select');
    assert.equal(res.body.placeholder, 'Pick one');
    assert.equal(res.body.help_text, 'Business priority');
    assert.equal(res.body.display_order, 3);
  });

  test('GET / flattens metadata into top-level keys and exposes entity_name', async () => {
    mock.setResult({
      data: [
        {
          id: 'fc-a',
          tenant_id: TENANT_ID,
          entity_type: 'Opportunity',
          field_name: 'custom_budget',
          label: 'Budget',
          is_visible: true,
          is_required: false,
          options: null,
          metadata: { is_custom: true, field_type: 'currency', display_order: 1 },
        },
      ],
      error: null,
    });

    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', tenant_id: TENANT_ID, role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app).get('/api/fieldcustomizations');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    const row = res.body[0];
    assert.equal(
      row.entity_name,
      'Opportunity',
      'response must include entity_name (frontend contract)',
    );
    assert.equal(row.entity_type, undefined, 'entity_type must NOT leak into response');
    assert.equal(row.field_type, 'currency', 'field_type must be flattened from metadata');
    assert.equal(row.display_order, 1);
  });

  test('PUT /:id preserves existing metadata keys not present in the update body', async () => {
    // First call: the initial fetch-for-preserve returns existing metadata
    const existingMetadata = {
      is_custom: true,
      field_type: 'text',
      placeholder: 'OLD placeholder',
      help_text: 'OLD help text',
      display_order: 5,
    };

    let callCount = 0;
    // Override single() to return different results on the two sequential calls
    const origFrom = mock.client.from.bind(mock.client);
    mock.client.from = function (t) {
      const builder = origFrom(t);
      const origSingle = builder.single.bind(builder);
      builder.single = function () {
        callCount += 1;
        if (callCount === 1) {
          // Fetch-for-preserve returns existing metadata only
          return Promise.resolve({ data: { metadata: existingMetadata }, error: null });
        }
        // Second call: the update.select().single()
        return Promise.resolve({
          data: {
            id: 'fc-x',
            tenant_id: TENANT_ID,
            entity_type: 'Contact',
            field_name: 'custom_priority',
            label: 'Updated Label',
            is_visible: true,
            is_required: false,
            options: null,
            metadata: { ...existingMetadata, field_type: 'select' },
          },
          error: null,
        });
      };
      return builder;
    };

    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', tenant_id: TENANT_ID, role: 'admin' },
      supabase: mock.client,
    });

    // Partial update: ONLY label and field_type change
    const res = await request(app)
      .put('/api/fieldcustomizations/fc-x')
      .send({ label: 'Updated Label', field_type: 'select' });

    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);

    const updateCall = mock.calls.find((c) => c[0] === 'update');
    assert.ok(updateCall, 'expected update() call');
    const payload = updateCall[1];

    // Regression: placeholder / help_text / display_order must survive
    assert.equal(
      payload.metadata.placeholder,
      'OLD placeholder',
      'placeholder must be preserved on partial PUT',
    );
    assert.equal(
      payload.metadata.help_text,
      'OLD help text',
      'help_text must be preserved on partial PUT',
    );
    assert.equal(
      payload.metadata.display_order,
      5,
      'display_order must be preserved on partial PUT',
    );
    // The updated key should reflect the new value
    assert.equal(payload.metadata.field_type, 'select');
    assert.equal(payload.label, 'Updated Label');
  });

  test('PUT /:id ignores entity_name and field_name in the body (immutable)', async () => {
    let callCount = 0;
    const origFrom = mock.client.from.bind(mock.client);
    mock.client.from = function (t) {
      const builder = origFrom(t);
      const origSingle = builder.single.bind(builder);
      builder.single = function () {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({ data: { metadata: { is_custom: true } }, error: null });
        }
        return Promise.resolve({
          data: {
            id: 'fc-y',
            tenant_id: TENANT_ID,
            entity_type: 'Opportunity',
            field_name: 'custom_original',
            label: 'Updated',
            metadata: { is_custom: true },
          },
          error: null,
        });
      };
      return builder;
    };

    const app = buildApp({
      user: { id: OTHER_USER_ID, email: 'u@t.com', tenant_id: TENANT_ID, role: 'admin' },
      supabase: mock.client,
    });

    const res = await request(app).put('/api/fieldcustomizations/fc-y').send({
      entity_name: 'Contact', // attempt to change entity — must be ignored
      field_name: 'custom_renamed', // attempt to rename — must be ignored
      label: 'Updated',
    });

    assert.equal(res.status, 200);
    const updateCall = mock.calls.find((c) => c[0] === 'update');
    assert.equal(updateCall[1].entity_type, undefined, 'entity_type must not be in UPDATE payload');
    assert.equal(updateCall[1].field_name, undefined, 'field_name must not be in UPDATE payload');
    assert.equal(updateCall[1].label, 'Updated');
  });
});
