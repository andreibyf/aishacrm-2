import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPgAuditEventsReader } from '../../../../lib/finance/readAdapters/pgAuditEventsReader.js';

describe('pgAuditEventsReader', () => {
  test('count() queries the schema-qualified finance.audit_events table', async () => {
    const calls = [];
    const pool = {
      query: async (text, values) => {
        calls.push({ text, values });
        return { rows: [{ n: 3 }] };
      },
    };
    const reader = createPgAuditEventsReader({ pool });
    const n = await reader.count('tenant-1');
    assert.equal(n, 3);
    assert.match(calls[0].text, /from\s+finance\.audit_events/i);
    assert.equal(
      calls[0].text.includes(' audit_events'),
      false,
      'must not use a bare audit_events',
    );
    assert.deepEqual(calls[0].values, ['tenant-1']);
  });

  test('listByType() filters by event_type, append order, and (when given) the Test/Live partition (Codex PR #647 P2)', async () => {
    const calls = [];
    const pool = {
      query: async (text, values) => {
        calls.push({ text, values });
        return { rows: [{ payload: { account_code: '4500' } }] };
      },
    };
    const reader = createPgAuditEventsReader({ pool });

    // No partition → 2 params, no is_test_data clause.
    await reader.listByType('tenant-1', 'finance.account.created');
    assert.match(calls[0].text, /event_type = \$2/);
    assert.match(calls[0].text, /order by created_at asc, seq asc/i);
    assert.equal(calls[0].text.includes('is_test_data'), false);
    assert.deepEqual(calls[0].values, ['tenant-1', 'finance.account.created']);

    // Partitioned → 3 params with the is_test_data filter.
    await reader.listByType('tenant-1', 'finance.account.created', true);
    assert.match(calls[1].text, /is_test_data = \$3/);
    assert.deepEqual(calls[1].values, ['tenant-1', 'finance.account.created', true]);
  });

  test('listByType() parses string payloads', async () => {
    const pool = { query: async () => ({ rows: [{ payload: '{"account_code":"1500"}' }] }) };
    const reader = createPgAuditEventsReader({ pool });
    const out = await reader.listByType('t', 'finance.account.created');
    assert.deepEqual(out, [{ account_code: '1500' }]);
  });

  test('requires a pool', () => {
    assert.throws(() => createPgAuditEventsReader({}), /requires a Postgres pool/);
  });
});
