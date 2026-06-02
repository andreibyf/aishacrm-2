import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceV2Routes, {
  defaultFinanceReadAdapterFactory,
} from '../../routes/finance.v2.js';
import createFinanceDomainService from '../../lib/finance/financeDomainService.js';

// A minimal pg pool stub — the projection-backed deps capture it lazily and do
// not query at construction time.
const spyPool = () => ({ query: async () => ({ rows: [{ n: 0 }] }) });

const PREV = process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
afterEach(() => {
  if (PREV === undefined) delete process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
  else process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = PREV;
});

describe('finance.v2 read-adapter selection (Phase 4-1 §5 / §9 rows 1,2,7)', () => {
  test('defaultFinanceReadAdapterFactory: false → in-memory; true+pool → projection-backed; true+no-pool → throws', () => {
    const service = createFinanceDomainService();

    const inMemory = defaultFinanceReadAdapterFactory({
      persistentEvents: false,
      pgPool: null,
      service,
    });
    assert.equal(typeof inMemory.getRuntimeStatus, 'function');
    assert.equal(typeof inMemory.listJournalEntries, 'function');

    assert.throws(
      () => defaultFinanceReadAdapterFactory({ persistentEvents: true, pgPool: null, service }),
      /requires a Postgres pool/i,
    );

    const projectionBacked = defaultFinanceReadAdapterFactory({
      persistentEvents: true,
      pgPool: spyPool(),
      service,
    });
    assert.equal(typeof projectionBacked.getRuntimeStatus, 'function');
  });

  test('route construction selects the in-memory adapter when the flag is unset (row 1)', () => {
    delete process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
    let captured = null;
    createFinanceV2Routes(null, {
      isFinanceModuleEnabled: async () => true,
      readAdapterFactory: (args) => {
        captured = args;
        return { async getRuntimeStatus() {} };
      },
    });
    assert.equal(captured.persistentEvents, false);
  });

  test('persistence mode is deploy-time: env read once at construction, no runtime swap (row 7)', () => {
    delete process.env.ENABLE_FINANCE_PERSISTENT_EVENTS; // false at construction
    let calls = 0;
    const captured = [];
    createFinanceV2Routes(null, {
      isFinanceModuleEnabled: async () => true,
      readAdapterFactory: (args) => {
        calls += 1;
        captured.push(args.persistentEvents);
        return { async getRuntimeStatus() {} };
      },
    });
    // Flip the flag AFTER construction — the adapter must not be re-selected.
    process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = 'true';
    assert.equal(calls, 1, 'factory called exactly once at construction');
    assert.equal(captured[0], false, 'selection used the construction-time env value');
  });
});
