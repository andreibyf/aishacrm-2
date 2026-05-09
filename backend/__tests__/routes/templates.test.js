// @ts-check
/**
 * templates.test.js (4VD-43 day 1)
 *
 * Pure-validator tests for the new in-house eSign template route.
 * Route-level integration tests (with mocked Supabase + Storage) are deferred
 * to day 6 of 4VD-43 — these tests pin the wire-format and tenant-isolation
 * contracts that the integration tests will rely on.
 *
 * Run with:
 *   cd backend && node --test __tests__/routes/templates.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateSigningFields,
  validateTemplateInput,
  buildTemplateStorageKey,
  resolveRequestTenantId,
} from '../../routes/templates.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Minimal valid PDF header — `%PDF-` + a few bytes — base64 encoded.
const MINIMAL_PDF_BASE64 = Buffer.from('%PDF-1.4\n1 0 obj\n', 'utf8').toString(
  'base64',
);

const VALID_FIELD = {
  name: 'sig1',
  type: 'signature',
  required: true,
  role: 'First Party',
  areas: [{ page: 0, x: 0.1, y: 0.1, w: 0.3, h: 0.05 }],
};

// ---------------------------------------------------------------------------
// validateSigningFields
// ---------------------------------------------------------------------------

describe('validateSigningFields — happy path', () => {
  test('accepts a single valid signature field', () => {
    const out = validateSigningFields([VALID_FIELD]);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, 'sig1');
    assert.equal(out[0].type, 'signature');
    assert.equal(out[0].required, true);
    assert.equal(out[0].role, 'First Party');
    assert.equal(out[0].areas.length, 1);
  });

  test('preserves order across multiple fields', () => {
    const out = validateSigningFields([
      { ...VALID_FIELD, name: 'a' },
      { ...VALID_FIELD, name: 'b', type: 'text' },
      { ...VALID_FIELD, name: 'c', type: 'date' },
    ]);
    assert.deepEqual(
      out.map((f) => f.name),
      ['a', 'b', 'c'],
    );
  });

  test('defaults required=true for signature, false otherwise', () => {
    const out = validateSigningFields([
      { ...VALID_FIELD, name: 'sig', type: 'signature', required: undefined },
      { ...VALID_FIELD, name: 'txt', type: 'text', required: undefined },
    ]);
    assert.equal(out[0].required, true);
    assert.equal(out[1].required, false);
  });

  test('default role is "First Party"', () => {
    const out = validateSigningFields([
      { ...VALID_FIELD, name: 'a', role: undefined },
    ]);
    assert.equal(out[0].role, 'First Party');
  });

  test('honours explicit role override', () => {
    const out = validateSigningFields([{ ...VALID_FIELD, name: 'a', role: 'Witness' }]);
    assert.equal(out[0].role, 'Witness');
  });

  test('trims whitespace on field name', () => {
    const out = validateSigningFields([{ ...VALID_FIELD, name: '  sig1  ' }]);
    assert.equal(out[0].name, 'sig1');
  });
});

describe('validateSigningFields — type validation', () => {
  for (const type of ['name', 'email', 'signature', 'date', 'text', 'checkbox']) {
    test(`accepts type=${type}`, () => {
      const out = validateSigningFields([{ ...VALID_FIELD, type }]);
      assert.equal(out[0].type, type);
    });
  }

  test('rejects unknown type', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, type: 'initials' }]),
      /must be one of/,
    );
  });

  test('rejects missing type', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, type: undefined }]),
      /must be one of/,
    );
  });
});

describe('validateSigningFields — input shape', () => {
  test('rejects empty array', () => {
    assert.throws(() => validateSigningFields([]), /non-empty array/);
  });

  test('rejects non-array', () => {
    // @ts-expect-error testing wrong runtime type
    assert.throws(() => validateSigningFields('not an array'), /non-empty array/);
  });

  test('rejects null', () => {
    // @ts-expect-error testing wrong runtime type
    assert.throws(() => validateSigningFields(null), /non-empty array/);
  });

  test('rejects null entries', () => {
    assert.throws(
      () => validateSigningFields([null]),
      /must be an object/,
    );
  });

  test('rejects empty field name', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, name: '' }]),
      /non-empty string/,
    );
  });

  test('rejects whitespace-only field name', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, name: '   ' }]),
      /non-empty string/,
    );
  });

  test('rejects duplicate field names', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, name: 'same' },
          { ...VALID_FIELD, name: 'same' },
        ]),
      /duplicate field name/,
    );
  });
});

describe('validateSigningFields — area validation', () => {
  test('rejects missing areas', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, areas: undefined }]),
      /non-empty array/,
    );
  });

  test('rejects empty areas array', () => {
    assert.throws(
      () => validateSigningFields([{ ...VALID_FIELD, areas: [] }]),
      /non-empty array/,
    );
  });

  test('rejects area with negative coords', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 0, x: -0.1, y: 0, w: 0.1, h: 0.1 }] },
        ]),
      /must be in \[0,1\]/,
    );
  });

  test('rejects area with coords > 1', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 0, x: 0, y: 0, w: 1.5, h: 0.1 }] },
        ]),
      /must be in \[0,1\]/,
    );
  });

  test('rejects non-integer page', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 1.5, x: 0, y: 0, w: 0.1, h: 0.1 }] },
        ]),
      /non-negative integer/,
    );
  });

  test('rejects negative page', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: -1, x: 0, y: 0, w: 0.1, h: 0.1 }] },
        ]),
      /non-negative integer/,
    );
  });

  test('rejects NaN coord', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 0, x: NaN, y: 0, w: 0.1, h: 0.1 }] },
        ]),
      /finite number/,
    );
  });

  test('rejects Infinity coord', () => {
    assert.throws(
      () =>
        validateSigningFields([
          { ...VALID_FIELD, areas: [{ page: 0, x: 0, y: 0, w: Infinity, h: 0.1 }] },
        ]),
      /finite number/,
    );
  });
});

// ---------------------------------------------------------------------------
// validateTemplateInput
// ---------------------------------------------------------------------------

describe('validateTemplateInput', () => {
  test('accepts a valid name + minimal PDF base64', () => {
    const out = validateTemplateInput({ name: 'My NDA', file: MINIMAL_PDF_BASE64 });
    assert.equal(out.name, 'My NDA');
    assert.ok(Buffer.isBuffer(out.pdfBuffer));
    assert.equal(out.pdfBuffer.toString('utf8').startsWith('%PDF-'), true);
  });

  test('trims name', () => {
    const out = validateTemplateInput({ name: '  My NDA  ', file: MINIMAL_PDF_BASE64 });
    assert.equal(out.name, 'My NDA');
  });

  test('rejects empty name', () => {
    assert.throws(
      () => validateTemplateInput({ name: '', file: MINIMAL_PDF_BASE64 }),
      /non-empty string/,
    );
  });

  test('rejects whitespace-only name', () => {
    assert.throws(
      () => validateTemplateInput({ name: '   ', file: MINIMAL_PDF_BASE64 }),
      /non-empty string/,
    );
  });

  test('rejects name >200 chars', () => {
    assert.throws(
      () => validateTemplateInput({ name: 'a'.repeat(201), file: MINIMAL_PDF_BASE64 }),
      /≤200 chars/,
    );
  });

  test('rejects empty file', () => {
    assert.throws(
      () => validateTemplateInput({ name: 'NDA', file: '' }),
      /non-empty base64 string/,
    );
  });

  test('rejects non-string file', () => {
    assert.throws(
      // @ts-expect-error wrong type
      () => validateTemplateInput({ name: 'NDA', file: 12345 }),
      /non-empty base64 string/,
    );
  });

  test('rejects non-PDF magic bytes', () => {
    const txtBase64 = Buffer.from('hello world', 'utf8').toString('base64');
    assert.throws(
      () => validateTemplateInput({ name: 'NDA', file: txtBase64 }),
      /missing %PDF- header/,
    );
  });

  test('rejects PDF over 25 MB ceiling', () => {
    const big = Buffer.alloc(26 * 1024 * 1024);
    big.write('%PDF-', 0);
    const b64 = big.toString('base64');
    assert.throws(
      () => validateTemplateInput({ name: 'NDA', file: b64 }),
      /byte ceiling/,
    );
  });
});

// ---------------------------------------------------------------------------
// buildTemplateStorageKey
// ---------------------------------------------------------------------------

describe('buildTemplateStorageKey', () => {
  test('produces tenant-scoped path', () => {
    const key = buildTemplateStorageKey({
      tenantId: '759a83e8-7340-4482-a586-cd2d049fb0b5',
      templateId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
    assert.equal(
      key,
      '759a83e8-7340-4482-a586-cd2d049fb0b5/templates/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf',
    );
  });

  test('is deterministic', () => {
    const args = { tenantId: 't1', templateId: 't2' };
    assert.equal(buildTemplateStorageKey(args), buildTemplateStorageKey(args));
  });
});

// ---------------------------------------------------------------------------
// resolveRequestTenantId — tenant-id cascade
// ---------------------------------------------------------------------------

describe('resolveRequestTenantId', () => {
  const TENANT_A = '759a83e8-7340-4482-a586-cd2d049fb0b5';
  const TENANT_B = 'b62b764d-cccc-cccc-cccc-cccccccccccc';

  test('returns null when no source provides a tenant id', () => {
    const req = { headers: {}, body: {}, query: {} };
    assert.equal(resolveRequestTenantId(req), null);
  });

  test('prefers req.tenant.id (set by validateTenantAccess)', () => {
    const req = {
      tenant: { id: TENANT_A },
      headers: { 'x-tenant-id': TENANT_B },
      body: { tenant_id: TENANT_B },
      query: { tenant_id: TENANT_B },
      user: { tenant_id: TENANT_B },
    };
    assert.equal(resolveRequestTenantId(req), TENANT_A);
  });

  test('falls back to x-tenant-id header when middleware did not populate req.tenant', () => {
    const req = {
      headers: { 'x-tenant-id': TENANT_A },
      body: {},
      query: {},
    };
    assert.equal(resolveRequestTenantId(req), TENANT_A);
  });

  test('honours body.tenant_id when neither middleware nor header is set', () => {
    const req = {
      headers: {},
      body: { tenant_id: TENANT_A },
      query: {},
    };
    assert.equal(resolveRequestTenantId(req), TENANT_A);
  });

  test('honours query.tenant_id as a final external override', () => {
    const req = {
      headers: {},
      body: {},
      query: { tenant_id: TENANT_A },
    };
    assert.equal(resolveRequestTenantId(req), TENANT_A);
  });

  test('falls back to req.user.tenant_id (JWT) when nothing else is set', () => {
    const req = {
      headers: {},
      body: {},
      query: {},
      user: { tenant_id: TENANT_A },
    };
    assert.equal(resolveRequestTenantId(req), TENANT_A);
  });

  test('coerces non-string values via .toString()', () => {
    const req = { headers: { 'x-tenant-id': { toString: () => TENANT_A } } };
    assert.equal(resolveRequestTenantId(req), TENANT_A);
  });

  test('does not throw when req has no headers/body/query/user shape', () => {
    assert.equal(resolveRequestTenantId({}), null);
  });
});

// ---------------------------------------------------------------------------
// Role gate — POST/PUT/DELETE require admin/superadmin (4VD-43 day 1.5)
//
// Spins up an Express app with a fake user-injection middleware in front of
// the templates router so we can assert that non-admin roles get a 403
// before the route ever reaches Supabase. The actual Supabase + Storage
// integration tests for the success paths are deferred to 4VD-43 day 6
// (per the test file header). We do NOT need them here because
// requireAdminRole short-circuits before any DB call is made.
// ---------------------------------------------------------------------------

describe('Role gate on POST/PUT/DELETE', () => {
  let express;
  let createTemplatesRoutes;
  let bodyParser;

  // Lazy-load Express + the route factory once per suite.
  test('boot suite', async () => {
    const expressMod = await import('express');
    express = expressMod.default;
    const routeMod = await import('../../routes/templates.js');
    createTemplatesRoutes = routeMod.default;
    bodyParser = express.json;
    assert.equal(typeof express, 'function');
    assert.equal(typeof createTemplatesRoutes, 'function');
  });

  function buildApp(user) {
    const app = express();
    app.use(bodyParser());
    // Inject a synthetic user (mimicking what authenticateRequest does)
    // and a tenant context (mimicking validateTenantAccess) so the route
    // sees the same shape it would in production.
    app.use((req, _res, next) => {
      req.user = user;
      req.tenant = { id: '759a83e8-7340-4482-a586-cd2d049fb0b5' };
      next();
    });
    app.use('/api/templates', createTemplatesRoutes());
    return app;
  }

  async function send(app, method, path, body) {
    const { default: http } = await import('node:http');
    return new Promise((resolve, reject) => {
      const server = http.createServer(app).listen(0, async () => {
        try {
          const port = server.address().port;
          const url = `http://127.0.0.1:${port}${path}`;
          const init = {
            method,
            headers: { 'Content-Type': 'application/json' },
          };
          if (body !== undefined) init.body = JSON.stringify(body);
          const resp = await fetch(url, init);
          const json = await resp.json().catch(() => ({}));
          server.close();
          resolve({ status: resp.status, body: json });
        } catch (err) {
          server.close();
          reject(err);
        }
      });
    });
  }

  test('POST as employee -> 403', async () => {
    const app = buildApp({ id: 'u1', role: 'employee' });
    const { status } = await send(app, 'POST', '/api/templates', {
      name: 'T',
      file: MINIMAL_PDF_BASE64,
      fields: [VALID_FIELD],
    });
    assert.equal(status, 403);
  });

  test('POST as manager -> 403', async () => {
    const app = buildApp({ id: 'u2', role: 'manager' });
    const { status } = await send(app, 'POST', '/api/templates', {
      name: 'T',
      file: MINIMAL_PDF_BASE64,
      fields: [VALID_FIELD],
    });
    assert.equal(status, 403);
  });

  test('PUT as manager -> 403', async () => {
    const app = buildApp({ id: 'u3', role: 'manager' });
    const { status } = await send(app, 'PUT', '/api/templates/abc', {
      name: 'T2',
    });
    assert.equal(status, 403);
  });

  test('DELETE as manager -> 403', async () => {
    const app = buildApp({ id: 'u4', role: 'manager' });
    const { status } = await send(app, 'DELETE', '/api/templates/abc');
    assert.equal(status, 403);
  });

  test('admin role passes the gate (reaches DB layer, Supabase will fail without real creds — that is fine)', async () => {
    const app = buildApp({ id: 'u5', role: 'admin' });
    const { status } = await send(app, 'DELETE', '/api/templates/abc');
    // Whatever the post-gate behavior is (Supabase error, 404, etc.), the
    // important assertion is that the request is NOT 403 — the gate let
    // the admin through.
    assert.notEqual(status, 403);
  });

  test('superadmin role passes the gate', async () => {
    const app = buildApp({ id: 'u6', role: 'superadmin' });
    const { status } = await send(app, 'DELETE', '/api/templates/abc');
    assert.notEqual(status, 403);
  });

  test('GET as manager passes (no role gate on reads)', async () => {
    const app = buildApp({ id: 'u7', role: 'manager' });
    const { status } = await send(app, 'GET', '/api/templates');
    // GET uses Supabase — it may return 500 in the unit-test environment
    // because there is no real DB. The only thing we care about is that
    // the role gate did NOT veto the read.
    assert.notEqual(status, 403);
  });
});
