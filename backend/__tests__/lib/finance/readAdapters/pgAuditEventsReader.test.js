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

  test('requires a pool', () => {
    assert.throws(() => createPgAuditEventsReader({}), /requires a Postgres pool/);
  });
});
