/**
 * Growth — opportunityEngine tests (Task 5)
 *
 * Pure-unit coverage for backend/lib/growth/opportunityEngine.js.
 * No live DB / network / LLM: a hand-rolled fake supabase client records the
 * builder/filter args so we can assert tenant isolation, the dedupe/expire
 * filters, and the inserted-row shape. `scoreFn` and `now` are injected.
 *
 * Run: node --test backend/__tests__/growth.opportunityEngine.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateCandidates,
  dedupeCandidates,
  sanitizeReason,
  buildDefaultTitle,
  buildDefaultReason,
  generateForInsight,
  expireStale,
  supersedePreviousOpportunities,
} from '../lib/growth/opportunityEngine.js';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INSIGHT_ID = '22222222-2222-2222-2222-222222222222';

/**
 * Build a fake supabase client whose `.from(table)` returns a thenable query
 * builder. Builder methods (select/insert/update/eq/in/lt) are chainable and
 * record their args on `calls`. A terminal `.select()` after insert/update makes
 * the builder resolve to the next queued result for that table; a bare `await`
 * also resolves. Returns the queued { data, error } for the table in order.
 *
 * @param {Record<string, Array<{data:any,error:any}>>} resultsByTable
 */
function makeFakeSupabase(resultsByTable = {}) {
  const calls = [];
  const queues = {};
  for (const [table, results] of Object.entries(resultsByTable)) {
    queues[table] = [...results];
  }

  function nextResult(table) {
    const q = queues[table];
    return (q && q.length ? q.shift() : null) || { data: null, error: null };
  }

  function makeBuilder(table) {
    const builder = {
      table,
      eqArgs: [],
      inArgs: [],
      ltArgs: [],
      _resolve() {
        return nextResult(table);
      },
    };
    const chain =
      (name) =>
      (...args) => {
        calls.push({ table, method: name, args });
        if (name === 'eq') builder.eqArgs.push(args);
        if (name === 'in') builder.inArgs.push(args);
        if (name === 'lt') builder.ltArgs.push(args);
        return builder;
      };
    builder.select = chain('select');
    builder.insert = chain('insert');
    builder.update = chain('update');
    builder.eq = chain('eq');
    builder.neq = chain('neq');
    builder.in = chain('in');
    builder.lt = chain('lt');
    builder.single = (...args) => {
      calls.push({ table, method: 'single', args });
      return Promise.resolve(builder._resolve());
    };
    builder.maybeSingle = (...args) => {
      calls.push({ table, method: 'maybeSingle', args });
      return Promise.resolve(builder._resolve());
    };
    // Allow `await builder` to resolve directly (no terminal selector).
    builder.then = (onF, onR) => Promise.resolve(builder._resolve()).then(onF, onR);
    return builder;
  }

  return {
    calls,
    from(table) {
      calls.push({ table, method: 'from', args: [table] });
      return makeBuilder(table);
    },
  };
}

// A scoreFn that returns minimal scoring and relies on default title/reason.
function defaultScoreFn() {
  return {
    score: 70,
    expected_impact: 'medium',
    difficulty: 'low',
    recommended_action: 'Do the thing',
  };
}

// ---------------------------------------------------------------------------
// generateCandidates (pure)
// ---------------------------------------------------------------------------

test('generateCandidates: positive trends in a region → one geographic candidate', () => {
  const signals = [
    {
      id: 's1',
      signal_type: 'trends',
      subject: 'solar panels',
      region: 'Wellington',
      delta_pct: 12.5,
    },
  ];
  const out = generateCandidates(signals, { service_catalog: [] });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    type: 'geographic',
    subject: 'solar panels',
    region: 'Wellington',
    signal_ids: ['s1'],
    signal_type: 'trends',
    action_type: 'create_campaign',
  });
});

test('generateCandidates: non-positive delta or no region → no geographic candidate', () => {
  const signals = [
    { id: 's1', signal_type: 'trends', subject: 'a', region: 'Wellington', delta_pct: 0 },
    { id: 's2', signal_type: 'trends', subject: 'b', region: 'Wellington', delta_pct: -5 },
    { id: 's3', signal_type: 'trends', subject: 'c', region: '', delta_pct: 20 },
    { id: 's4', signal_type: 'trends', subject: 'd', region: null, delta_pct: 20 },
  ];
  const out = generateCandidates(signals, { service_catalog: [] });
  assert.equal(out.length, 0);
});

test('generateCandidates: autocomplete with no matching service → content candidate', () => {
  const signals = [
    { id: 's1', signal_type: 'autocomplete', subject: 'battery storage', region: null },
  ];
  const profile = { service_catalog: [{ name: 'Solar Install', slug: 'solar', keywords: ['pv'] }] };
  const out = generateCandidates(signals, profile);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    type: 'content',
    subject: 'battery storage',
    region: null,
    signal_ids: ['s1'],
    signal_type: 'autocomplete',
    action_type: 'create_task',
  });
});

test('generateCandidates: autocomplete matching a service (name/slug/keyword) → no candidate', () => {
  const profile = {
    service_catalog: [{ name: 'Solar Install', slug: 'solar-install', keywords: ['pv panels'] }],
  };
  // Matches name (case-insensitive), slug, and a keyword respectively.
  assert.equal(
    generateCandidates(
      [{ id: 'a', signal_type: 'autocomplete', subject: 'SOLAR install' }],
      profile,
    ).length,
    0,
  );
  assert.equal(
    generateCandidates(
      [{ id: 'b', signal_type: 'autocomplete', subject: 'solar-install' }],
      profile,
    ).length,
    0,
  );
  assert.equal(
    generateCandidates([{ id: 'c', signal_type: 'autocomplete', subject: 'PV Panels' }], profile)
      .length,
    0,
  );
});

test('generateCandidates: community/web signals are ignored in v1', () => {
  const signals = [
    { id: 's1', signal_type: 'community', subject: 'x', region: 'NZ', delta_pct: 50 },
    { id: 's2', signal_type: 'web', subject: 'y' },
  ];
  assert.equal(generateCandidates(signals, { service_catalog: [] }).length, 0);
});

// ---------------------------------------------------------------------------
// dedupeCandidates (pure)
// ---------------------------------------------------------------------------

test('dedupeCandidates: drops a candidate equal by type+subject+region to an open opp', () => {
  const candidates = [
    { type: 'geographic', subject: 'Solar Panels', region: 'Wellington', signal_ids: ['s1'] },
    { type: 'content', subject: 'battery storage', region: null, signal_ids: ['s2'] },
  ];
  const existingOpen = [
    // Same key as the first candidate (case-insensitive subject), status open.
    { type: 'geographic', subject: 'solar panels', region: 'Wellington', status: 'viewed' },
  ];
  const out = dedupeCandidates(candidates, existingOpen);
  assert.equal(out.length, 1);
  assert.equal(out[0].subject, 'battery storage');
});

test('dedupeCandidates: dedupes candidates against each other (first wins)', () => {
  const candidates = [
    { type: 'content', subject: 'Heat Pumps', region: null, signal_ids: ['a'] },
    { type: 'content', subject: 'heat pumps', region: null, signal_ids: ['b'] },
  ];
  const out = dedupeCandidates(candidates, []);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].signal_ids, ['a']);
});

// ---------------------------------------------------------------------------
// sanitizeReason (pure honesty guardrail)
// ---------------------------------------------------------------------------

test('sanitizeReason: trends reason loses all percent tokens', () => {
  const out = sanitizeReason('Searches are up 21% this month and climbing 5 %.', 'trends');
  assert.ok(!/\d+\s*%/.test(out), `expected no percent in: ${out}`);
});

test('sanitizeReason: trends reason strips large bare digit runs', () => {
  const out = sanitizeReason('About 1200 searches recorded last week.', 'trends');
  assert.ok(!/\d{3,}/.test(out), `expected no large digit run in: ${out}`);
});

test('sanitizeReason: non-trends reasons are left intact (trimmed only)', () => {
  const out = sanitizeReason('  Mentioned 14% in 3 threads.  ', 'community');
  assert.equal(out, 'Mentioned 14% in 3 threads.');
});

// ---------------------------------------------------------------------------
// buildDefaultTitle / buildDefaultReason (pure)
// ---------------------------------------------------------------------------

test('buildDefaultTitle/Reason: geographic and content copy', () => {
  const geo = { type: 'geographic', subject: 'solar', region: 'Wellington' };
  assert.equal(buildDefaultTitle(geo), 'Target solar in Wellington');
  assert.equal(
    buildDefaultReason(geo),
    'Interest in solar appears to be rising in Wellington — consider focused outreach.',
  );

  const content = { type: 'content', subject: 'battery storage', region: null };
  assert.equal(buildDefaultTitle(content), 'Create content for "battery storage"');
  assert.equal(
    buildDefaultReason(content),
    'People are searching for "battery storage" but you have no matching service page — consider adding content.',
  );
});

// ---------------------------------------------------------------------------
// generateForInsight (I/O via fake supabase)
// ---------------------------------------------------------------------------

test('generateForInsight: stamps tenant_id, insight_id, status, and expires_at ~ttlDays out', async () => {
  const FIXED_NOW = 1_700_000_000_000;
  const supabase = makeFakeSupabase({
    growth_opportunities: [
      { data: [], error: null }, // existing OPEN lookup → none
      { data: null, error: null }, // insert (no echo) → fall back to built rows
    ],
  });

  const signals = [
    {
      id: 's1',
      signal_type: 'trends',
      subject: 'solar',
      region: 'Wellington',
      delta_pct: 10,
    },
  ];

  const rows = await generateForInsight(supabase, {
    tenantId: TENANT_ID,
    insightId: INSIGHT_ID,
    signals,
    profile: { service_catalog: [] },
    scoreFn: defaultScoreFn,
    now: () => FIXED_NOW,
    ttlDays: 30,
  });

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.tenant_id, TENANT_ID);
  assert.equal(row.insight_id, INSIGHT_ID);
  assert.equal(row.status, 'new');
  assert.equal(row.type, 'geographic');
  assert.equal(row.action_type, 'create_campaign');
  assert.deepEqual(row.signal_ids, ['s1']);
  assert.deepEqual(row.action_payload, {});
  assert.equal(row.score, 70);

  const expected = new Date(FIXED_NOW + 30 * 86_400_000).toISOString();
  assert.equal(row.expires_at, expected);

  // The existing-OPEN lookup filtered by tenant + open statuses.
  const eqCall = supabase.calls.find((c) => c.method === 'eq');
  assert.deepEqual(eqCall.args, ['tenant_id', TENANT_ID]);
  const inCall = supabase.calls.find((c) => c.method === 'in');
  assert.deepEqual(inCall.args, ['status', ['new', 'viewed', 'actioned']]);

  // An insert happened.
  const insertCall = supabase.calls.find((c) => c.method === 'insert');
  assert.ok(insertCall, 'insert should have been called');
  assert.equal(insertCall.args[0][0].tenant_id, TENANT_ID);
});

test('generateForInsight: dedupes against existing open opportunities (inserts nothing)', async () => {
  const supabase = makeFakeSupabase({
    growth_opportunities: [
      // existing OPEN includes the exact candidate key.
      {
        data: [{ type: 'geographic', subject: 'solar', region: 'Wellington', status: 'new' }],
        error: null,
      },
    ],
  });

  const rows = await generateForInsight(supabase, {
    tenantId: TENANT_ID,
    insightId: INSIGHT_ID,
    signals: [
      { id: 's1', signal_type: 'trends', subject: 'solar', region: 'Wellington', delta_pct: 10 },
    ],
    profile: { service_catalog: [] },
    scoreFn: defaultScoreFn,
    now: () => 1_700_000_000_000,
  });

  assert.deepEqual(rows, []);
  // No insert was issued since the only candidate was a duplicate.
  assert.ok(!supabase.calls.some((c) => c.method === 'insert'));
});

test('generateForInsight: dedupeExisting=false skips the existing fetch and inserts the full set', async () => {
  const supabase = makeFakeSupabase({
    // Only the INSERT result is consumed — there is NO existing-open fetch.
    growth_opportunities: [
      {
        data: [{ id: 'opp-1', type: 'geographic', subject: 'solar', region: 'Wellington' }],
        error: null,
      },
    ],
  });

  const rows = await generateForInsight(supabase, {
    tenantId: TENANT_ID,
    insightId: INSIGHT_ID,
    signals: [
      { id: 's1', signal_type: 'trends', subject: 'solar', region: 'Wellington', delta_pct: 10 },
    ],
    profile: { service_catalog: [] },
    scoreFn: defaultScoreFn,
    now: () => 1_700_000_000_000,
    dedupeExisting: false,
  });

  assert.equal(rows.length, 1);
  assert.ok(
    supabase.calls.some((c) => c.table === 'growth_opportunities' && c.method === 'insert'),
  );
});

test('supersedePreviousOpportunities: expires open opportunities from OTHER insights, tenant-scoped', async () => {
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: [{ id: 'old-1' }, { id: 'old-2' }], error: null }],
  });

  const { count } = await supersedePreviousOpportunities(supabase, {
    tenantId: TENANT_ID,
    currentInsightId: INSIGHT_ID,
  });

  assert.equal(count, 2);
  const update = supabase.calls.find(
    (c) => c.table === 'growth_opportunities' && c.method === 'update',
  );
  assert.deepEqual(update.args[0], { status: 'expired' });
  const neq = supabase.calls.find((c) => c.method === 'neq');
  assert.deepEqual(neq.args, ['insight_id', INSIGHT_ID]);
  const tenantEq = supabase.calls.find((c) => c.method === 'eq' && c.args[0] === 'tenant_id');
  assert.deepEqual(tenantEq.args, ['tenant_id', TENANT_ID]);
});

test('generateForInsight: honesty — scoreFn percent reason is scrubbed before storage', async () => {
  const supabase = makeFakeSupabase({
    growth_opportunities: [
      { data: [], error: null }, // existing OPEN → none
      { data: null, error: null }, // insert (no echo)
    ],
  });

  const scoreFn = () => ({
    score: 80,
    expected_impact: 'high',
    difficulty: 'low',
    recommended_action: 'Run a campaign',
    reason: 'Interest is up 21% — strike now.',
  });

  const rows = await generateForInsight(supabase, {
    tenantId: TENANT_ID,
    insightId: INSIGHT_ID,
    signals: [
      { id: 's1', signal_type: 'trends', subject: 'solar', region: 'Wellington', delta_pct: 21 },
    ],
    profile: { service_catalog: [] },
    scoreFn,
    now: () => 1_700_000_000_000,
  });

  assert.equal(rows.length, 1);
  assert.ok(
    !/\d+\s*%/.test(rows[0].reason),
    `final stored reason must not contain a percent: ${rows[0].reason}`,
  );
});

// ---------------------------------------------------------------------------
// expireStale (I/O via fake supabase)
// ---------------------------------------------------------------------------

test('expireStale: targets only expires_at < now rows with status new/viewed', async () => {
  const FIXED_NOW = 1_700_000_000_000;
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: [{ id: 'o1' }, { id: 'o2' }], error: null }],
  });

  const result = await expireStale(supabase, { tenantId: TENANT_ID, now: () => FIXED_NOW });

  assert.equal(result.count, 2);

  // Update set status=expired.
  const updateCall = supabase.calls.find((c) => c.method === 'update');
  assert.deepEqual(updateCall.args[0], { status: 'expired' });

  // Filtered by tenant.
  const eqCall = supabase.calls.find((c) => c.method === 'eq');
  assert.deepEqual(eqCall.args, ['tenant_id', TENANT_ID]);

  // lt on expires_at using the injected now.
  const ltCall = supabase.calls.find((c) => c.method === 'lt');
  assert.deepEqual(ltCall.args, ['expires_at', new Date(FIXED_NOW).toISOString()]);

  // in on the expirable statuses.
  const inCall = supabase.calls.find((c) => c.method === 'in');
  assert.deepEqual(inCall.args, ['status', ['new', 'viewed']]);
});
