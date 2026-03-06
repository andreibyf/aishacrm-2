/**
 * carePlaybookRouter.test.js
 *
 * Unit tests for the CARE Playbook Router.
 * Tests: playbook lookup, cooldown, daily limit, routing modes, cache, fallback.
 *
 * Run: node --test --force-exit backend/lib/care/__tests__/carePlaybookRouter.test.js
 */

import { describe, test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

// Lightweight mock logger
const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

const baseTriggerData = {
  triggerId: 'lead_stagnant',
  recordType: 'lead',
  recordId: '00000000-0000-0000-0000-000000000001',
  context: { lead_name: 'Test Lead', days_stagnant: 10 },
};

describe('CARE Playbook Router', () => {
  let routeTriggerToPlaybook;
  let invalidatePlaybookCache;

  beforeEach(async () => {
    const mod = await import('../carePlaybookRouter.js');
    routeTriggerToPlaybook = mod.routeTriggerToPlaybook;
    invalidatePlaybookCache = mod.invalidatePlaybookCache;
    // Clear cache between tests — use unique tenant IDs per test instead
  });

  test('returns null when no playbook exists (PGRST116)', async () => {
    const mockSupa = buildMockSupabase({
      playbook: { data: null, error: { code: 'PGRST116' } },
    });

    const result = await routeTriggerToPlaybook('tenant-no-pb', baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    assert.equal(result, null);
  });

  test('returns null when playbook is disabled', async () => {
    const mockSupa = buildMockSupabase({
      playbook: {
        data: { id: 'pb1', is_enabled: false, trigger_type: 'lead_stagnant' },
        error: null,
      },
    });

    const result = await routeTriggerToPlaybook('tenant-disabled', baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    assert.equal(result, null);
  });

  test('returns cooldown_skipped when recent execution exists', async () => {
    const mockSupa = buildMockSupabase({
      playbook: {
        data: {
          id: 'pb-cd',
          is_enabled: true,
          shadow_mode: true,
          trigger_type: 'lead_stagnant',
          cooldown_minutes: 1440,
          steps: [{ step_id: 's1', action_type: 'send_notification' }],
          max_executions_per_day: 50,
          execution_mode: 'native',
        },
        error: null,
      },
      cooldownHit: true,
    });

    invalidatePlaybookCache('tenant-cd-test');
    const result = await routeTriggerToPlaybook('tenant-cd-test', baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    assert.equal(result?.status, 'cooldown_skipped');
  });

  test('returns daily_limit_reached when max exceeded', async () => {
    const mockSupa = buildMockSupabase({
      playbook: {
        data: {
          id: 'pb-dl',
          is_enabled: true,
          shadow_mode: true,
          trigger_type: 'lead_stagnant',
          cooldown_minutes: 1440,
          steps: [],
          max_executions_per_day: 5,
          execution_mode: 'native',
        },
        error: null,
      },
      cooldownHit: false,
      dailyCount: 5, // equals max
    });

    invalidatePlaybookCache('tenant-dl-test');
    const result = await routeTriggerToPlaybook('tenant-dl-test', baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    assert.equal(result?.status, 'daily_limit_reached');
  });

  test('routes to playbook when all checks pass', async () => {
    const mockSupa = buildMockSupabase({
      playbook: {
        data: {
          id: 'pb-ok',
          is_enabled: true,
          shadow_mode: true,
          trigger_type: 'lead_stagnant',
          cooldown_minutes: 1440,
          steps: [{ step_id: 's1' }],
          max_executions_per_day: 50,
          execution_mode: 'native',
          name: 'Test Playbook',
          webhook_url: null,
          webhook_secret: null,
        },
        error: null,
      },
      cooldownHit: false,
      dailyCount: 0,
      executionInsert: { data: { id: 'exec-ok' }, error: null },
    });

    invalidatePlaybookCache('tenant-ok-test');
    const result = await routeTriggerToPlaybook('tenant-ok-test', baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    assert.equal(result?.status, 'routed');
    assert.equal(result?.executionId, 'exec-ok');
    assert.equal(result?.playbookName, 'Test Playbook');
    assert.equal(result?.shadowMode, true);
  });

  test('falls through gracefully on unexpected error', async () => {
    const mockSupa = {
      from: () => {
        throw new Error('DB connection failed');
      },
    };

    invalidatePlaybookCache('tenant-err-test');
    const result = await routeTriggerToPlaybook('tenant-err-test', baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    assert.equal(result, null, 'Should return null on error');
  });

  test('cache returns same playbook on second call without invalidation', async () => {
    let lookupCount = 0;
    const mockSupa = buildMockSupabase({
      playbook: {
        data: { id: 'pb-cache', is_enabled: false, trigger_type: 'lead_stagnant' },
        error: null,
      },
      onPlaybookLookup: () => {
        lookupCount++;
      },
    });

    const tenantId = 'tenant-cache-' + Date.now();

    // First call — hits DB
    await routeTriggerToPlaybook(tenantId, baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    // Second call — should use cache
    await routeTriggerToPlaybook(tenantId, baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    assert.equal(lookupCount, 1, 'Should only query DB once due to cache');
  });

  after(async () => {
    // Close Bull queue Redis connection so Node can exit cleanly
    try {
      const { playbookQueue } = await import('../carePlaybookQueue.js');
      await playbookQueue.close();
    } catch (_) {
      /* queue may not be initialized */
    }
  });

  test('invalidatePlaybookCache forces fresh lookup', async () => {
    let lookupCount = 0;
    const mockSupa = buildMockSupabase({
      playbook: {
        data: { id: 'pb-inv', is_enabled: false, trigger_type: 'lead_stagnant' },
        error: null,
      },
      onPlaybookLookup: () => {
        lookupCount++;
      },
    });

    const tenantId = 'tenant-inv-' + Date.now();

    await routeTriggerToPlaybook(tenantId, baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    invalidatePlaybookCache(tenantId, 'lead_stagnant');

    await routeTriggerToPlaybook(tenantId, baseTriggerData, {
      supabase: mockSupa,
      logger: mockLogger,
    });

    assert.equal(lookupCount, 2, 'Should query DB twice after cache invalidation');
  });
});

// ============================================================
// Mock Supabase builder
// ============================================================

function buildMockSupabase(opts = {}) {
  const {
    playbook,
    cooldownHit = false,
    dailyCount = 0,
    executionInsert = { data: { id: 'mock-exec-' + Date.now() }, error: null },
    onPlaybookLookup,
  } = opts;

  let currentTable = '';
  let isCountQuery = false;

  const chainable = () => {
    const chain = {
      select: (...args) => {
        // Detect count queries: select('id', { count: 'exact', head: true })
        if (args[1]?.count === 'exact') {
          isCountQuery = true;
        }
        return chain;
      },
      insert: () => chain,
      update: () => chain,
      eq: () => chain,
      neq: () => chain,
      gte: () => chain,
      gt: () => chain,
      in: () => chain,
      limit: () => chain,
      single: () => {
        if (currentTable === 'care_playbook') {
          if (onPlaybookLookup) onPlaybookLookup();
          return Promise.resolve(playbook || { data: null, error: { code: 'PGRST116' } });
        }
        if (currentTable === 'care_playbook_execution') {
          return Promise.resolve(executionInsert);
        }
        return Promise.resolve({ data: null, error: null });
      },
    };

    // Make chainable thenable for non-.single() queries (cooldown check, daily limit)
    chain.then = (resolve, reject) => {
      if (currentTable === 'care_playbook_execution') {
        if (isCountQuery) {
          isCountQuery = false;
          return Promise.resolve({ count: dailyCount, error: null }).then(resolve, reject);
        }
        // Cooldown check — returns array
        const result = cooldownHit
          ? { data: [{ id: 'existing' }], error: null }
          : { data: [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    };

    return chain;
  };

  return {
    from: (table) => {
      currentTable = table;
      isCountQuery = false;
      return chainable();
    },
  };
}
