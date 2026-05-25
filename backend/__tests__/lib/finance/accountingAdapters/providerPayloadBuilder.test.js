import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderPayload,
  assertNoInternalMetadata,
  INTERNAL_METADATA_DENYLIST,
} from '../../../../lib/finance/accountingAdapters/providerPayloadBuilder.js';

// --- buildProviderPayload: each denylist key stripped at top level ------------

test('buildProviderPayload strips every denylisted key at the top level', () => {
  const canonical = {
    doc_number: 'JE-001',
    txn_date: '2026-05-25T00:00:00.000Z',
    currency: 'USD',
    draft_only: true,
    governance_decision: { policy: 'allow' },
    policy_decision: { rule: 'finance.ai.no_money_movement' },
    governance_policy_snapshot: { v: 1 },
    braid_trace_id: 'trace-1',
    correlation_id: 'corr-1',
    causation_id: 'cause-1',
    request_id: 'req-1',
    tenant_id: '00000000-0000-4000-8000-aaaaaaaaaaaa',
    ai_generated: true,
    created_by: 'user-1',
    updated_by: 'user-2',
    approved_by: 'user-3',
    lines: [],
  };

  const out = buildProviderPayload(canonical);

  assert.equal(out.doc_number, 'JE-001');
  assert.equal(out.currency, 'USD');
  assert.deepEqual(out.lines, []);

  for (const denied of INTERNAL_METADATA_DENYLIST) {
    assert.ok(!(denied in out), `denylisted key "${denied}" should be stripped`);
  }
});

test('INTERNAL_METADATA_DENYLIST contains the 11 items from §4.5', () => {
  // The "11-item denylist" per §4.5: 11 logical items, with the actor-id
  // trio (created_by/updated_by/approved_by) treated as one logical item.
  const expected = [
    'draft_only',
    'governance_decision',
    'policy_decision',
    'governance_policy_snapshot',
    'braid_trace_id',
    'correlation_id',
    'causation_id',
    'request_id',
    'tenant_id',
    'ai_generated',
    'created_by',
    'updated_by',
    'approved_by',
  ];
  for (const key of expected) {
    assert.ok(INTERNAL_METADATA_DENYLIST.includes(key), `denylist missing "${key}"`);
  }
});

// --- nested-object stripping --------------------------------------------------

test('buildProviderPayload strips denylisted keys at any depth', () => {
  const canonical = {
    doc_number: 'JE-002',
    metadata: {
      provider_extras: {
        custom_field: 'kept',
        tenant_id: 'NESTED-TENANT', // must be stripped
        braid_trace_id: 'NESTED-TRACE', // must be stripped
      },
      created_by: 'nested-user', // must be stripped
    },
    lines: [
      {
        amount_cents: 1000,
        posting_type: 'Debit',
        governance_decision: { foo: 'bar' }, // must be stripped from array element
        account_ref: {
          id: 'acct-1',
          name: 'Cash',
          correlation_id: 'should-be-stripped',
        },
      },
    ],
  };

  const out = buildProviderPayload(canonical);
  assert.equal(out.metadata.provider_extras.custom_field, 'kept');
  assert.ok(!('tenant_id' in out.metadata.provider_extras));
  assert.ok(!('braid_trace_id' in out.metadata.provider_extras));
  assert.ok(!('created_by' in out.metadata));
  assert.ok(!('governance_decision' in out.lines[0]));
  assert.ok(!('correlation_id' in out.lines[0].account_ref));
  assert.equal(out.lines[0].account_ref.id, 'acct-1');
});

// --- leading-underscore convention -------------------------------------------

test('buildProviderPayload strips leading-underscore keys at any depth', () => {
  const canonical = {
    name: 'kept',
    _internal: 'stripped',
    nested: {
      visible: true,
      _private: 'gone',
      deeper: { _hidden: 'gone too', actual: 1 },
    },
  };
  const out = buildProviderPayload(canonical);
  assert.equal(out.name, 'kept');
  assert.ok(!('_internal' in out));
  assert.equal(out.nested.visible, true);
  assert.ok(!('_private' in out.nested));
  assert.equal(out.nested.deeper.actual, 1);
  assert.ok(!('_hidden' in out.nested.deeper));
});

// --- allowlist override ------------------------------------------------------

test('buildProviderPayload allowlist override keeps named keys', () => {
  const canonical = {
    doc_number: 'JE-003',
    tenant_id: 'KEEP-ME',
    braid_trace_id: 'STRIP-ME',
    _kept_internal: 'keep this too',
  };
  const out = buildProviderPayload(canonical, {
    allowlist: new Set(['tenant_id', '_kept_internal']),
  });
  assert.equal(out.tenant_id, 'KEEP-ME');
  assert.equal(out._kept_internal, 'keep this too');
  assert.ok(!('braid_trace_id' in out), 'braid_trace_id not allowlisted — should be stripped');
});

test('buildProviderPayload accepts allowlist as array', () => {
  const canonical = { tenant_id: 'KEEP', request_id: 'STRIP' };
  const out = buildProviderPayload(canonical, { allowlist: ['tenant_id'] });
  assert.equal(out.tenant_id, 'KEEP');
  assert.ok(!('request_id' in out));
});

// --- deep clone (no mutation of input) ---------------------------------------

test('buildProviderPayload does not mutate the canonical input', () => {
  const canonical = {
    doc_number: 'JE-004',
    draft_only: true,
    lines: [{ amount_cents: 100, tenant_id: 'leaked' }],
  };
  const snapshot = JSON.parse(JSON.stringify(canonical));
  buildProviderPayload(canonical);
  assert.deepEqual(canonical, snapshot, 'input must not be mutated');
});

// --- input validation --------------------------------------------------------

test('buildProviderPayload throws TypeError for null', () => {
  assert.throws(() => buildProviderPayload(null), TypeError);
});

test('buildProviderPayload throws TypeError for non-object', () => {
  assert.throws(() => buildProviderPayload('not an object'), TypeError);
  assert.throws(() => buildProviderPayload(42), TypeError);
});

// --- assertNoInternalMetadata helper -----------------------------------------

test('assertNoInternalMetadata accepts a clean payload', () => {
  assert.doesNotThrow(() =>
    assertNoInternalMetadata({
      doc_number: 'JE-OK',
      lines: [{ amount_cents: 100, account_ref: { id: 'a', name: 'Cash' } }],
    }),
  );
});

test('assertNoInternalMetadata rejects each denylisted key (top-level)', () => {
  for (const key of INTERNAL_METADATA_DENYLIST) {
    const payload = { ok: true, [key]: 'leak' };
    assert.throws(
      () => assertNoInternalMetadata(payload),
      (err) => err.message.includes(key),
      `should reject top-level "${key}"`,
    );
  }
});

test('assertNoInternalMetadata rejects denylisted keys in nested objects', () => {
  assert.throws(
    () => assertNoInternalMetadata({ metadata: { foo: { tenant_id: 'leak' } } }),
    /tenant_id/,
  );
});

test('assertNoInternalMetadata rejects denylisted keys in array elements', () => {
  assert.throws(
    () => assertNoInternalMetadata({ lines: [{ amount_cents: 100, draft_only: true }] }),
    /draft_only/,
  );
});

test('assertNoInternalMetadata rejects leading-underscore keys', () => {
  assert.throws(() => assertNoInternalMetadata({ _internal: 'leak' }), /_internal/);
});

test('assertNoInternalMetadata accepts the output of buildProviderPayload by default', () => {
  // Integration: every key the builder strips must also be rejected by the
  // assertion helper, so a clean round-trip never fails the assertion.
  const canonical = {
    doc_number: 'JE-005',
    draft_only: true,
    governance_decision: {},
    braid_trace_id: 'x',
    metadata: { tenant_id: 'leak', _flag: true, kept: 1 },
    lines: [{ amount_cents: 100, approved_by: 'should-strip' }],
  };
  const out = buildProviderPayload(canonical);
  assert.doesNotThrow(() => assertNoInternalMetadata(out));
});

test('assertNoInternalMetadata handles cycles without infinite recursion', () => {
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  assert.doesNotThrow(() => assertNoInternalMetadata(cyclic));
});
