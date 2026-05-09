// @ts-check
/**
 * submissions.test.js (4VD-43 day 2)
 *
 * Pure-validator + helper tests for the new POST/GET /api/submissions route.
 * Route-level integration tests with mocked Supabase + email provider land
 * in 4VD-43 day 6 — these tests pin the input contract, signing-token
 * entropy, and the role-gate semantics that day 6 will rely on.
 *
 * Run with:
 *   cd backend && node --test __tests__/routes/submissions.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';

import {
  validateSubmissionInput,
  generateSigningToken,
  buildSigningUrl,
} from '../../routes/submissions.js';
import createSubmissionsRoutes from '../../routes/submissions.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_A = '759a83e8-7340-4482-a586-cd2d049fb0b5';
const TEMPLATE_ID = '4c47820b-e7f7-482d-91a5-3004a53eaf11';
const RELATED_ID = '11111111-2222-3333-4444-555555555555';

const VALID_BODY = {
  template_id: TEMPLATE_ID,
  related_to: 'contact',
  related_id: RELATED_ID,
  recipient_email: 'recipient@example.com',
};

// ---------------------------------------------------------------------------
// validateSubmissionInput
// ---------------------------------------------------------------------------

describe('validateSubmissionInput — happy path', () => {
  test('accepts a minimal valid body', () => {
    const out = validateSubmissionInput(VALID_BODY);
    assert.equal(out.templateId, TEMPLATE_ID);
    assert.equal(out.relatedTo, 'contact');
    assert.equal(out.relatedId, RELATED_ID);
    assert.equal(out.recipientEmail, 'recipient@example.com');
    assert.equal(out.recipientName, null);
    assert.equal(out.message, null);
  });

  test('lower-cases recipient_email', () => {
    const out = validateSubmissionInput({ ...VALID_BODY, recipient_email: 'REC@EXAMPLE.COM' });
    assert.equal(out.recipientEmail, 'rec@example.com');
  });

  test('trims recipient_name and keeps it when non-empty', () => {
    const out = validateSubmissionInput({ ...VALID_BODY, recipient_name: '  Jane Doe  ' });
    assert.equal(out.recipientName, 'Jane Doe');
  });

  test('treats empty/whitespace recipient_name as null', () => {
    const out = validateSubmissionInput({ ...VALID_BODY, recipient_name: '   ' });
    assert.equal(out.recipientName, null);
  });

  test('trims and keeps message', () => {
    const out = validateSubmissionInput({ ...VALID_BODY, message: '  hello  ' });
    assert.equal(out.message, 'hello');
  });

  test('accepts each related_to value', () => {
    for (const rt of ['contact', 'lead', 'account', 'opportunity']) {
      const out = validateSubmissionInput({ ...VALID_BODY, related_to: rt });
      assert.equal(out.relatedTo, rt);
    }
  });
});

describe('validateSubmissionInput — rejects bad input', () => {
  test('rejects null body', () => {
    assert.throws(() => validateSubmissionInput(null), /body must be an object/);
  });
  test('rejects non-UUID template_id', () => {
    assert.throws(
      () => validateSubmissionInput({ ...VALID_BODY, template_id: 'not-a-uuid' }),
      /template_id must be a UUID/,
    );
  });
  test('rejects unknown related_to', () => {
    assert.throws(
      () => validateSubmissionInput({ ...VALID_BODY, related_to: 'project' }),
      /related_to must be one of/,
    );
  });
  test('rejects non-UUID related_id', () => {
    assert.throws(
      () => validateSubmissionInput({ ...VALID_BODY, related_id: 'abc' }),
      /related_id must be a UUID/,
    );
  });
  test('rejects malformed recipient_email', () => {
    assert.throws(
      () => validateSubmissionInput({ ...VALID_BODY, recipient_email: 'not-an-email' }),
      /not a valid email address/,
    );
  });
  test('rejects recipient_email without @', () => {
    assert.throws(
      () => validateSubmissionInput({ ...VALID_BODY, recipient_email: 'noatsign.example.com' }),
      /not a valid email address/,
    );
  });
  test('rejects recipient_name >200 chars', () => {
    assert.throws(
      () => validateSubmissionInput({ ...VALID_BODY, recipient_name: 'x'.repeat(201) }),
      /recipient_name must be ≤200 chars/,
    );
  });
  test('rejects message >2000 chars', () => {
    assert.throws(
      () => validateSubmissionInput({ ...VALID_BODY, message: 'x'.repeat(2001) }),
      /message must be ≤2000 chars/,
    );
  });
  test('rejects non-string recipient_name', () => {
    assert.throws(
      () => validateSubmissionInput({ ...VALID_BODY, recipient_name: 123 }),
      /recipient_name must be a string/,
    );
  });
});

// ---------------------------------------------------------------------------
// generateSigningToken
// ---------------------------------------------------------------------------

describe('generateSigningToken', () => {
  test('returns a 64-character hex string (32 bytes)', () => {
    const t = generateSigningToken();
    assert.equal(t.length, 64);
    assert.match(t, /^[0-9a-f]{64}$/);
  });

  test('is non-deterministic across calls (entropy sanity check)', () => {
    const tokens = new Set();
    for (let i = 0; i < 100; i += 1) tokens.add(generateSigningToken());
    // 100 distinct 256-bit values; collision probability is astronomical.
    assert.equal(tokens.size, 100);
  });
});

// ---------------------------------------------------------------------------
// buildSigningUrl
// ---------------------------------------------------------------------------

describe('buildSigningUrl', () => {
  test('produces a clean /sign/<slug>/<token> URL', () => {
    const url = buildSigningUrl('http://localhost:4000', 'dev-local-tenant', 'abc123');
    assert.equal(url, 'http://localhost:4000/sign/dev-local-tenant/abc123');
  });

  test('strips trailing slashes from frontendUrl', () => {
    const url = buildSigningUrl('https://app.aishacrm.com/', 'acme', 'tok');
    assert.equal(url, 'https://app.aishacrm.com/sign/acme/tok');
  });

  test('encodes special chars in slug + token', () => {
    const url = buildSigningUrl('https://app', 'acme corp', 'a/b');
    assert.equal(url, 'https://app/sign/acme%20corp/a%2Fb');
  });
});

// ---------------------------------------------------------------------------
// Role gate — POST/GET should NOT require admin (sales reps send templates).
//
// Spins up an Express app with a fake user injector in front of the route
// so we can confirm POST is open to manager + employee, and GET is open
// across roles. Supabase calls will fail (no env), but the only thing we
// assert is that the response is NOT 403 — i.e., requireAdminRole isn't
// wedging the route. Real DB success-path tests land in 4VD-43 day 6.
// ---------------------------------------------------------------------------

describe('Role gate — POST/GET open to all roles', () => {
  function buildApp(user) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = user;
      req.tenant = { id: TENANT_A };
      next();
    });
    app.use('/api/submissions', createSubmissionsRoutes());
    return app;
  }

  async function send(app, method, path, body) {
    return new Promise((resolve, reject) => {
      const server = http.createServer(app).listen(0, async () => {
        try {
          const port = server.address().port;
          const init = { method, headers: { 'Content-Type': 'application/json' } };
          if (body !== undefined) init.body = JSON.stringify(body);
          const resp = await fetch(`http://127.0.0.1:${port}${path}`, init);
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

  test('POST as employee -> not 403 (open to sales reps)', async () => {
    const app = buildApp({ id: 'u1', role: 'employee' });
    const { status } = await send(app, 'POST', '/api/submissions', VALID_BODY);
    assert.notEqual(status, 403);
  });

  test('POST as manager -> not 403', async () => {
    const app = buildApp({ id: 'u2', role: 'manager' });
    const { status } = await send(app, 'POST', '/api/submissions', VALID_BODY);
    assert.notEqual(status, 403);
  });

  test('POST as admin -> not 403', async () => {
    const app = buildApp({ id: 'u3', role: 'admin' });
    const { status } = await send(app, 'POST', '/api/submissions', VALID_BODY);
    assert.notEqual(status, 403);
  });

  test('POST with bad body -> 400 (validator catches before DB)', async () => {
    const app = buildApp({ id: 'u4', role: 'employee' });
    const { status, body } = await send(app, 'POST', '/api/submissions', {
      template_id: 'not-a-uuid',
    });
    assert.equal(status, 400);
    assert.equal(body.error, 'invalid_template_id');
  });

  test('GET as employee -> not 403', async () => {
    const app = buildApp({ id: 'u5', role: 'employee' });
    const { status } = await send(app, 'GET', '/api/submissions');
    assert.notEqual(status, 403);
  });

  test('GET with invalid related_to -> 400', async () => {
    const app = buildApp({ id: 'u6', role: 'employee' });
    const { status, body } = await send(
      app,
      'GET',
      '/api/submissions?related_to=project&related_id=' + RELATED_ID,
    );
    assert.equal(status, 400);
    assert.equal(body.error, 'invalid_related_to');
  });

  test('GET with invalid related_id -> 400', async () => {
    const app = buildApp({ id: 'u7', role: 'employee' });
    const { status, body } = await send(
      app,
      'GET',
      '/api/submissions?related_to=contact&related_id=not-uuid',
    );
    assert.equal(status, 400);
    assert.equal(body.error, 'invalid_related_id');
  });
});
