import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createErpnextSandboxAdapter,
  AdapterCapabilityError,
  AdapterConfigError,
  ERPNEXT_PROVIDER_OBJECT_MAP,
} from '../../../../lib/finance/accountingAdapters/erpnextSandboxAdapter.js';
import { assertNoInternalMetadata } from '../../../../lib/finance/accountingAdapters/providerPayloadBuilder.js';

// --- helpers -----------------------------------------------------------------

function makeFakeHttp(overrides = {}) {
  const calls = { get: [], post: [], put: [] };
  return {
    calls,
    async get(url, opts) {
      calls.get.push({ url, opts });
      if (overrides.get) return overrides.get(url, opts);
      return { data: { data: {} } };
    },
    async post(url, body, opts) {
      calls.post.push({ url, body, opts });
      if (overrides.post) return overrides.post(url, body, opts);
      return { data: { data: { name: 'JE-DRAFT-001', docstatus: 0 } } };
    },
    async put(url, body, opts) {
      calls.put.push({ url, body, opts });
      if (overrides.put) return overrides.put(url, body, opts);
      return { data: { data: {} } };
    },
  };
}

function baseConfig(extras = {}) {
  return {
    baseUrl: 'http://localhost:8000',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    httpClient: makeFakeHttp(),
    sandboxAllowlist: [],
    ...extras,
  };
}

// --- constructor URL guard ---------------------------------------------------

test('constructor rejects production-looking URLs', () => {
  assert.throws(
    () =>
      createErpnextSandboxAdapter({
        ...baseConfig(),
        baseUrl: 'https://erpnext.example.com',
      }),
    (err) => {
      assert.ok(err instanceof AdapterConfigError, 'must be AdapterConfigError');
      assert.equal(err.status, 400);
      assert.match(err.message, /sandbox/i);
      return true;
    },
  );
});

test('constructor rejects bare https://acme.com', () => {
  assert.throws(
    () =>
      createErpnextSandboxAdapter({
        ...baseConfig(),
        baseUrl: 'https://acme.com',
      }),
    AdapterConfigError,
  );
});

test('constructor rejects an FQDN that is NOT in the empty default allowlist', () => {
  // Default sandboxAllowlist is [] — operator must opt-in by populating
  // FINANCE_ERPNEXT_SANDBOX_BASE_URLS.
  assert.throws(
    () =>
      createErpnextSandboxAdapter({
        ...baseConfig(),
        baseUrl: 'https://my-staging-erp.acme.com',
      }),
    AdapterConfigError,
  );
});

test('constructor accepts http://localhost:8000', () => {
  const adapter = createErpnextSandboxAdapter(baseConfig());
  assert.equal(adapter.provider, 'erpnext');
  assert.equal(adapter.mode, 'draft_only');
});

test('constructor accepts 127.0.0.1 and 0.0.0.0', () => {
  assert.doesNotThrow(() =>
    createErpnextSandboxAdapter({ ...baseConfig(), baseUrl: 'http://127.0.0.1:8000' }),
  );
  assert.doesNotThrow(() =>
    createErpnextSandboxAdapter({ ...baseConfig(), baseUrl: 'http://0.0.0.0:8000' }),
  );
});

test('constructor accepts *.local hostnames', () => {
  assert.doesNotThrow(() =>
    createErpnextSandboxAdapter({ ...baseConfig(), baseUrl: 'http://erp.local:8000' }),
  );
});

test('constructor accepts sandbox.* hostnames', () => {
  assert.doesNotThrow(() =>
    createErpnextSandboxAdapter({
      ...baseConfig(),
      baseUrl: 'https://sandbox.example.com',
    }),
  );
});

test('constructor accepts *-sandbox.* hostnames', () => {
  assert.doesNotThrow(() =>
    createErpnextSandboxAdapter({
      ...baseConfig(),
      baseUrl: 'https://erpnext-sandbox.example.com',
    }),
  );
});

test('constructor accepts explicit allowlist entries (FINANCE_ERPNEXT_SANDBOX_BASE_URLS)', () => {
  assert.doesNotThrow(() =>
    createErpnextSandboxAdapter({
      ...baseConfig(),
      baseUrl: 'https://my-staging-erp.acme.com',
      sandboxAllowlist: ['my-staging-erp.acme.com'],
    }),
  );
});

test('explicit allowlist is case-insensitive', () => {
  assert.doesNotThrow(() =>
    createErpnextSandboxAdapter({
      ...baseConfig(),
      baseUrl: 'https://MY-STAGING-ERP.ACME.COM',
      sandboxAllowlist: ['my-staging-erp.acme.com'],
    }),
  );
});

test('constructor requires apiKey, apiSecret, httpClient, baseUrl', () => {
  assert.throws(
    () => createErpnextSandboxAdapter({ ...baseConfig(), baseUrl: '' }),
    AdapterConfigError,
  );
  assert.throws(
    () => createErpnextSandboxAdapter({ ...baseConfig(), apiKey: '' }),
    AdapterConfigError,
  );
  assert.throws(
    () => createErpnextSandboxAdapter({ ...baseConfig(), apiSecret: '' }),
    AdapterConfigError,
  );
  assert.throws(
    () => createErpnextSandboxAdapter({ ...baseConfig(), httpClient: null }),
    AdapterConfigError,
  );
});

// --- pushDraft ---------------------------------------------------------------

test('pushDraft posts to /api/resource/<DocType> with docstatus=0', async () => {
  const http = makeFakeHttp();
  const adapter = createErpnextSandboxAdapter(baseConfig({ httpClient: http }));

  const canonical = {
    doc_number: 'JE-001',
    txn_date: '2026-05-25T00:00:00.000Z',
    private_note: 'test',
    currency: 'USD',
    lines: [],
    // internal metadata that MUST be stripped
    draft_only: true,
    tenant_id: '00000000-0000-4000-8000-aaaaaaaaaaaa',
    braid_trace_id: 'trace-1',
    created_by: 'user-1',
  };

  const res = await adapter.pushDraft(canonical, 'JournalEntry');

  assert.equal(res.ok, true);
  assert.equal(res.provider_id, 'JE-DRAFT-001');
  assert.equal(http.calls.post.length, 1);

  const [posted] = http.calls.post;
  assert.match(posted.url, /\/api\/resource\/Journal%20Entry$/);
  assert.equal(posted.body.docstatus, 0, 'docstatus must be 0 (draft, never submitted)');
  assert.equal(posted.body.doctype, 'Journal Entry');
  assert.equal(
    posted.opts.headers.Authorization,
    'token test-key:test-secret',
    'must send ERPNext token header',
  );
});

test('pushDraft NEVER calls the submit endpoint', async () => {
  const http = makeFakeHttp();
  const adapter = createErpnextSandboxAdapter(baseConfig({ httpClient: http }));
  await adapter.pushDraft(
    { doc_number: 'JE-002', txn_date: '2026-05-25T00:00:00.000Z', lines: [] },
    'JournalEntry',
  );
  const allUrls = [...http.calls.post, ...http.calls.get, ...http.calls.put].map((c) => c.url);
  for (const url of allUrls) {
    assert.ok(
      !url.includes('frappe.client.submit'),
      `must never call submit endpoint, saw: ${url}`,
    );
  }
});

test('pushDraft strips internal metadata via providerPayloadBuilder', async () => {
  const http = makeFakeHttp();
  const adapter = createErpnextSandboxAdapter(baseConfig({ httpClient: http }));

  await adapter.pushDraft(
    {
      doc_number: 'JE-003',
      txn_date: '2026-05-25T00:00:00.000Z',
      currency: 'USD',
      private_note: 'note',
      lines: [],
      // The denylist hit-list
      draft_only: true,
      tenant_id: 'leak-1',
      braid_trace_id: 'leak-2',
      correlation_id: 'leak-3',
      causation_id: 'leak-4',
      request_id: 'leak-5',
      governance_decision: { x: 1 },
      policy_decision: { y: 2 },
      governance_policy_snapshot: { z: 3 },
      ai_generated: true,
      created_by: 'u1',
      updated_by: 'u2',
      approved_by: 'u3',
      _internal_flag: true,
    },
    'JournalEntry',
  );

  const posted = http.calls.post[0].body;

  // Hard assertion via the shared helper — the §4.5 test obligation.
  assert.doesNotThrow(
    () => assertNoInternalMetadata(posted),
    'pushDraft payload must contain no internal AiSHA metadata',
  );

  // docstatus / doctype survive (ERPNext-native)
  assert.equal(posted.docstatus, 0);
  assert.equal(posted.doctype, 'Journal Entry');
});

test('pushDraft accepts ctx as { objectType, runtimePolicy }', async () => {
  const http = makeFakeHttp();
  const adapter = createErpnextSandboxAdapter(baseConfig({ httpClient: http }));
  const res = await adapter.pushDraft(
    { doc_number: 'JE-004', txn_date: '2026-05-25T00:00:00.000Z', lines: [] },
    { objectType: 'JournalEntry', runtimePolicy: {} },
  );
  assert.equal(res.ok, true);
  assert.equal(http.calls.post.length, 1);
});

test('pushDraft throws for unknown objectType', async () => {
  const adapter = createErpnextSandboxAdapter(baseConfig());
  await assert.rejects(() => adapter.pushDraft({}, 'NonsenseType'), AdapterConfigError);
});

// --- pushFinal / voidRecord capability errors --------------------------------

test('pushFinal throws AdapterCapabilityError', async () => {
  const adapter = createErpnextSandboxAdapter(baseConfig());
  await assert.rejects(
    () => adapter.pushFinal({}, 'JournalEntry', 'approval-1'),
    (err) => {
      assert.ok(err instanceof AdapterCapabilityError);
      assert.equal(err.code, 'ADAPTER_CAPABILITY_UNSUPPORTED');
      return true;
    },
  );
});

test('voidRecord throws AdapterCapabilityError', async () => {
  const adapter = createErpnextSandboxAdapter(baseConfig());
  await assert.rejects(
    () => adapter.voidRecord('JE-001', 'JournalEntry', 'approval-1'),
    AdapterCapabilityError,
  );
});

// --- read-side methods (smoke) ----------------------------------------------

test('checkHealth returns ok with latency on success', async () => {
  const http = makeFakeHttp({
    get: async () => ({ data: { message: 'Administrator' } }),
  });
  const adapter = createErpnextSandboxAdapter(baseConfig({ httpClient: http }));
  const h = await adapter.checkHealth();
  assert.equal(h.ok, true);
  assert.equal(h.provider, 'erpnext');
  assert.ok(typeof h.latency_ms === 'number');
});

test('checkHealth returns ok:false on httpClient error (never throws)', async () => {
  const http = makeFakeHttp({
    get: async () => {
      throw new Error('boom');
    },
  });
  const adapter = createErpnextSandboxAdapter(baseConfig({ httpClient: http }));
  const h = await adapter.checkHealth();
  assert.equal(h.ok, false);
  assert.match(h.error, /boom/);
});

test('syncStatus maps ERPNext docstatus to canonical_status', async () => {
  const http = makeFakeHttp({
    get: async () => ({ data: { data: { name: 'JE-001', docstatus: 0 } } }),
  });
  const adapter = createErpnextSandboxAdapter(baseConfig({ httpClient: http }));
  const s = await adapter.syncStatus('JE-001', 'JournalEntry');
  assert.equal(s.ok, true);
  assert.equal(s.canonical_status, 'draft');
});

test('syncStatus maps docstatus=1 to posted, =2 to void', async () => {
  const http1 = makeFakeHttp({
    get: async () => ({ data: { data: { docstatus: 1 } } }),
  });
  const adapter1 = createErpnextSandboxAdapter(baseConfig({ httpClient: http1 }));
  assert.equal((await adapter1.syncStatus('x', 'JournalEntry')).canonical_status, 'posted');

  const http2 = makeFakeHttp({
    get: async () => ({ data: { data: { docstatus: 2 } } }),
  });
  const adapter2 = createErpnextSandboxAdapter(baseConfig({ httpClient: http2 }));
  assert.equal((await adapter2.syncStatus('x', 'JournalEntry')).canonical_status, 'void');
});

// --- mapping round-trip ------------------------------------------------------

test('fromCanonical projects Account fields and inverts active→disabled', () => {
  const adapter = createErpnextSandboxAdapter(baseConfig());
  const out = adapter.fromCanonical(
    {
      id: 'acct-1',
      code: '1000',
      name: 'Cash',
      classification: 'Asset',
      account_type: 'Bank',
      active: true,
      parent_account_id: null,
    },
    'Account',
  );
  assert.equal(out.ok, true);
  assert.equal(out.data.account_name, 'Cash');
  assert.equal(out.data.account_number, '1000');
  assert.equal(out.data.disabled, 0, 'active=true → disabled=0');
});

test('toCanonical reads ERPNext Account and inverts disabled→active', () => {
  const adapter = createErpnextSandboxAdapter(baseConfig());
  const out = adapter.toCanonical(
    {
      name: 'acct-1',
      account_number: '1000',
      account_name: 'Cash',
      root_type: 'Asset',
      account_type: 'Bank',
      disabled: 1,
      parent_account: null,
      extra_field: 'present in provider, not in canonical',
    },
    'Account',
  );
  assert.equal(out.ok, true);
  assert.equal(out.data.active, false, 'disabled=1 → active=false');
  assert.ok(out.unmapped_fields.includes('extra_field'));
});

test('ERPNEXT_PROVIDER_OBJECT_MAP covers Account and JournalEntry', () => {
  assert.ok(ERPNEXT_PROVIDER_OBJECT_MAP.Account);
  assert.ok(ERPNEXT_PROVIDER_OBJECT_MAP.JournalEntry);
  assert.equal(ERPNEXT_PROVIDER_OBJECT_MAP.JournalEntry.docType, 'Journal Entry');
});

// --- no network IO sanity ----------------------------------------------------

test('no test makes a real network call (httpClient is injectable)', async () => {
  // Smoke: build adapter, exercise every async method, never see a thrown
  // network error because our fakes always return synthetic data.
  const http = makeFakeHttp();
  const adapter = createErpnextSandboxAdapter(baseConfig({ httpClient: http }));
  await adapter.checkHealth();
  await adapter.fetchObject('JournalEntry', 'JE-x');
  await adapter.listObjects('JournalEntry', { limit: 5 });
  await adapter.pushDraft(
    { doc_number: 'X', txn_date: '2026-05-25T00:00:00.000Z', lines: [] },
    'JournalEntry',
  );
  await adapter.syncStatus('JE-x', 'JournalEntry');
  await adapter.reconcile('JournalEntry');
  // All calls captured via the fake — no real http.
  assert.ok(http.calls.get.length + http.calls.post.length > 0);
});
