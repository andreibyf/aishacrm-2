/**
 * marketInsights/synthesize tests
 * Run: node --test backend/__tests__/marketInsights.synthesize.test.js
 *
 * Pure-unit: injects a fake supabase, a fake fetch (Wikipedia skipped), and a
 * spy/stub callLLM — no live DB / network / LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  synthesizeMarketInsights,
  buildBaseline,
  buildInsightsSchema,
} from '../lib/marketInsights/synthesize.js';

const TENANT_ROW = {
  id: 't-uuid',
  tenant_id: 't-slug',
  name: 'Acme',
  industry: 'saas_and_cloud_services',
  business_model: 'b2b',
  geographic_focus: 'north_america',
  country: 'USA',
  major_city: 'Austin',
};

function makeFakeSupabase({ tenantRow = TENANT_ROW, counts = {} } = {}) {
  return {
    from(table) {
      const builder = {
        select() {
          return builder;
        },
        or() {
          return builder;
        },
        limit() {
          return Promise.resolve({ data: tenantRow ? [tenantRow] : [], error: null });
        },
        eq() {
          return Promise.resolve({ count: counts[table] ?? 0 });
        },
      };
      return builder;
    },
  };
}

// Wikipedia disabled (ok:false) → deterministic, no external context.
const noWiki = async () => ({ ok: false, json: async () => ({}) });

const VALID_REPORT = {
  executive_summary: 'Summary.',
  market_overview: 'Overview.',
  swot_analysis: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
  competitive_landscape: { overview: '', major_competitors: [], market_dynamics: '' },
  industry_trends: [],
  major_news: [],
  recommendations: [],
  economic_indicators: [],
};

test('returns parsed insights when callLLM returns valid JSON; passes tenantId + schema in prompt', async () => {
  let seen = null;
  const callLLM = async (args) => {
    seen = args;
    return {
      ok: true,
      content: JSON.stringify(VALID_REPORT),
      model: 'qwen-14b',
      provider: 'aisha-mcp',
      usage: { total_tokens: 10 },
    };
  };

  const result = await synthesizeMarketInsights({
    supabase: makeFakeSupabase({ counts: { accounts: 3, opportunities: 0, activities: 2 } }),
    tenantId: 't-uuid',
    deps: { callLLM, fetch: noWiki },
  });

  assert.deepEqual(result.insights, VALID_REPORT);
  assert.equal(result.fallback, false);
  assert.equal(result.model, 'qwen-14b');
  assert.equal(result.provider, 'aisha-mcp');

  // callLLM received tenantId and the schema-bearing prompt.
  assert.equal(seen.tenantId, 't-uuid');
  const userMsg = seen.messages.find((m) => m.role === 'user').content;
  for (const key of buildInsightsSchema().required) {
    assert.ok(userMsg.includes(key), `prompt should mention schema key ${key}`);
  }
  // Industry/location humanized into the prompt.
  assert.ok(userMsg.includes('SaaS & Cloud Services'));
  assert.ok(userMsg.includes('Austin, USA'));
});

test('falls back to baseline when LLM output is unparseable (fallback:true)', async () => {
  const callLLM = async () => ({ ok: true, content: 'not json at all', model: 'm', provider: 'p' });
  const result = await synthesizeMarketInsights({
    supabase: makeFakeSupabase(),
    tenantId: 't-uuid',
    deps: { callLLM, fetch: noWiki },
  });
  assert.equal(result.fallback, true);
  assert.ok(result.insights.executive_summary, 'baseline has executive_summary');
  assert.ok(Array.isArray(result.insights.recommendations));
});

test('key/not-configured error → baseline with fallback:true and null model', async () => {
  const callLLM = async () => ({ ok: false, error: 'API key not configured for provider' });
  const result = await synthesizeMarketInsights({
    supabase: makeFakeSupabase(),
    tenantId: 't-uuid',
    deps: { callLLM, fetch: noWiki },
  });
  assert.equal(result.fallback, true);
  assert.equal(result.model, null);
  assert.ok(result.insights.executive_summary);
});

test('non-key LLM error THROWS (route → 500, runner → fail-soft catch)', async () => {
  const callLLM = async () => ({ ok: false, error: 'upstream timeout' });
  await assert.rejects(
    () =>
      synthesizeMarketInsights({
        supabase: makeFakeSupabase(),
        tenantId: 't-uuid',
        deps: { callLLM, fetch: noWiki },
      }),
    /upstream timeout/,
  );
});

test('requires tenantId', async () => {
  await assert.rejects(
    () => synthesizeMarketInsights({ supabase: makeFakeSupabase(), tenantId: null }),
    /requires tenantId/,
  );
});

test('buildBaseline injects conditional recommendations for thin pipeline', () => {
  const ctx = {
    INDUSTRY: 'SaaS & Cloud Services',
    BUSINESS_MODEL: 'B2B',
    LOCATION: 'Austin, USA',
    tenantStats: { accounts: 1, contacts: 1, leads: 1, opportunities: 0, activities: 2 },
    searchResults: [],
  };
  const baseline = buildBaseline(ctx);
  const titles = baseline.recommendations.map((r) => r.title).join(' | ');
  assert.ok(titles.includes('Launch Targeted Outreach Sprint'), 'low activity → outreach rec');
  assert.ok(titles.includes('Kickstart Pipeline'), 'no opportunities → kickstart rec');
});
