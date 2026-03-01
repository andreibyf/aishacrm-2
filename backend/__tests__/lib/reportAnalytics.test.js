/**
 * Unit tests for backend/lib/reportAnalytics modules.
 *
 * Covers: healthScoring, suggestions, insights/predictions, barrel re-exports.
 * safeCount is skipped here because it requires a Supabase client;
 * it is already exercised indirectly via the reports route integration tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import everything via the barrel to verify re-exports resolve
import {
  calculatePipelineHealth,
  calculateLeadHealth,
  generateDashboardSuggestions,
  generateDashboardInsights,
  generateTrendPredictions,
  createStubAiContext,
  warnIfSlow,
  ENABLE_AI_ENRICHMENT,
  SLOW_THRESHOLD_MS,
  safeCount,
} from '../../lib/reportAnalytics/index.js';

/* ------------------------------------------------------------------ */
/*  Barrel index re-exports                                           */
/* ------------------------------------------------------------------ */
describe('reportAnalytics barrel index', () => {
  it('exports all expected symbols', () => {
    assert.strictEqual(typeof calculatePipelineHealth, 'function');
    assert.strictEqual(typeof calculateLeadHealth, 'function');
    assert.strictEqual(typeof generateDashboardSuggestions, 'function');
    assert.strictEqual(typeof generateDashboardInsights, 'function');
    assert.strictEqual(typeof generateTrendPredictions, 'function');
    assert.strictEqual(typeof createStubAiContext, 'function');
    assert.strictEqual(typeof warnIfSlow, 'function');
    assert.strictEqual(typeof safeCount, 'function');
    assert.strictEqual(typeof ENABLE_AI_ENRICHMENT, 'boolean');
    assert.strictEqual(typeof SLOW_THRESHOLD_MS, 'number');
  });
});

/* ------------------------------------------------------------------ */
/*  calculatePipelineHealth                                           */
/* ------------------------------------------------------------------ */
describe('calculatePipelineHealth', () => {
  it('returns no_data for null/undefined/empty input', () => {
    assert.deepStrictEqual(calculatePipelineHealth(null), { score: 0, status: 'no_data' });
    assert.deepStrictEqual(calculatePipelineHealth(undefined), { score: 0, status: 'no_data' });
    assert.deepStrictEqual(calculatePipelineHealth([]), { score: 0, status: 'no_data' });
  });

  it('returns no_data when all counts are zero', () => {
    const stages = [
      { stage: 'prospecting', count: '0' },
      { stage: 'won', count: '0' },
    ];
    assert.deepStrictEqual(calculatePipelineHealth(stages), { score: 0, status: 'no_data' });
  });

  it('returns healthy for high win rate with diverse active stages', () => {
    const stages = [
      { stage: 'prospecting', count: '10' },
      { stage: 'qualification', count: '8' },
      { stage: 'proposal', count: '5' },
      { stage: 'won', count: '15' },
      { stage: 'lost', count: '2' },
    ];
    const result = calculatePipelineHealth(stages);
    assert.strictEqual(result.status, 'healthy');
    assert.ok(result.score >= 75, `Expected score >= 75, got ${result.score}`);
    assert.ok(result.winRate >= 80, `Expected winRate >= 80, got ${result.winRate}`);
  });

  it('returns critical for pipeline with only lost deals', () => {
    const stages = [{ stage: 'lost', count: '20' }];
    const result = calculatePipelineHealth(stages);
    assert.strictEqual(result.status, 'critical');
    assert.strictEqual(result.winRate, 0);
  });

  it('returns at_risk for low win rate', () => {
    const stages = [
      { stage: 'prospecting', count: '5' },
      { stage: 'won', count: '2' },
      { stage: 'lost', count: '18' },
    ];
    const result = calculatePipelineHealth(stages);
    assert.ok(
      result.status === 'at_risk' || result.status === 'critical',
      `Expected at_risk or critical, got ${result.status}`,
    );
    assert.ok(result.winRate < 30, `Expected winRate < 30, got ${result.winRate}`);
  });

  it('handles string counts correctly (parseInt)', () => {
    const stages = [
      { stage: 'won', count: '10' },
      { stage: 'lost', count: '10' },
    ];
    const result = calculatePipelineHealth(stages);
    assert.strictEqual(result.winRate, 50);
  });

  it('handles missing stage field gracefully', () => {
    const stages = [{ count: '5' }, { stage: null, count: '3' }];
    // Should not throw — stages without valid stage go to activeStages
    const result = calculatePipelineHealth(stages);
    assert.strictEqual(typeof result.score, 'number');
    assert.strictEqual(typeof result.status, 'string');
  });
});

/* ------------------------------------------------------------------ */
/*  calculateLeadHealth                                               */
/* ------------------------------------------------------------------ */
describe('calculateLeadHealth', () => {
  it('returns no_data for null/undefined/empty input', () => {
    assert.deepStrictEqual(calculateLeadHealth(null), { score: 0, status: 'no_data' });
    assert.deepStrictEqual(calculateLeadHealth(undefined), { score: 0, status: 'no_data' });
    assert.deepStrictEqual(calculateLeadHealth([]), { score: 0, status: 'no_data' });
  });

  it('returns no_data when all counts are zero', () => {
    const statuses = [
      { status: 'new', count: '0' },
      { status: 'converted', count: '0' },
    ];
    assert.deepStrictEqual(calculateLeadHealth(statuses), { score: 0, status: 'no_data' });
  });

  it('returns high stagnation risk when most leads are new', () => {
    const statuses = [
      { status: 'new', count: '90' },
      { status: 'contacted', count: '5' },
      { status: 'converted', count: '5' },
    ];
    const result = calculateLeadHealth(statuses);
    assert.ok(
      result.stagnationRisk >= 80,
      `Expected stagnationRisk >= 80, got ${result.stagnationRisk}`,
    );
  });

  it('returns healthy for well-progressed funnel', () => {
    const statuses = [
      { status: 'new', count: '5' },
      { status: 'contacted', count: '20' },
      { status: 'qualified', count: '15' },
      { status: 'converted', count: '10' },
    ];
    const result = calculateLeadHealth(statuses);
    assert.ok(result.conversionRate > 0, 'Expected non-zero conversion rate');
    assert.ok(result.stagnationRisk < 20, `Expected low stagnation, got ${result.stagnationRisk}`);
  });

  it('returns low conversion rate when no leads converted', () => {
    const statuses = [
      { status: 'new', count: '50' },
      { status: 'contacted', count: '30' },
    ];
    const result = calculateLeadHealth(statuses);
    assert.strictEqual(result.conversionRate, 0);
  });
});

/* ------------------------------------------------------------------ */
/*  generateDashboardSuggestions                                      */
/* ------------------------------------------------------------------ */
describe('generateDashboardSuggestions', () => {
  it('returns empty array when everything is healthy', () => {
    const stats = { activitiesLast30Days: 50, totalContacts: 20, totalAccounts: 5 };
    const pipeline = { status: 'healthy', score: 85, winRate: 60 };
    const leads = { stagnationRisk: 10, conversionRate: 25 };
    const result = generateDashboardSuggestions(stats, pipeline, leads);
    assert.strictEqual(result.length, 0);
  });

  it('suggests reviewing stalled opportunities for at_risk pipeline', () => {
    const stats = { activitiesLast30Days: 50, totalContacts: 20, totalAccounts: 5 };
    const pipeline = { status: 'at_risk', score: 20, winRate: 40 };
    const leads = { stagnationRisk: 10, conversionRate: 25 };
    const result = generateDashboardSuggestions(stats, pipeline, leads);
    const actions = result.map((s) => s.action);
    assert.ok(actions.includes('review_stalled_opportunities'));
  });

  it('suggests analyzing lost deals for low win rate', () => {
    const stats = { activitiesLast30Days: 50, totalContacts: 20, totalAccounts: 5 };
    const pipeline = { status: 'needs_attention', score: 55, winRate: 15 };
    const leads = { stagnationRisk: 10, conversionRate: 25 };
    const result = generateDashboardSuggestions(stats, pipeline, leads);
    const actions = result.map((s) => s.action);
    assert.ok(actions.includes('analyze_lost_deals'));
  });

  it('suggests working new leads for high stagnation', () => {
    const stats = { activitiesLast30Days: 50, totalContacts: 20, totalAccounts: 5 };
    const pipeline = { status: 'healthy', score: 80, winRate: 60 };
    const leads = { stagnationRisk: 70, conversionRate: 25 };
    const result = generateDashboardSuggestions(stats, pipeline, leads);
    const actions = result.map((s) => s.action);
    assert.ok(actions.includes('work_new_leads'));
  });

  it('suggests increasing activity when volume is low', () => {
    const stats = { activitiesLast30Days: 3, totalContacts: 20, totalAccounts: 5 };
    const pipeline = { status: 'healthy', score: 80, winRate: 60 };
    const leads = { stagnationRisk: 10, conversionRate: 25 };
    const result = generateDashboardSuggestions(stats, pipeline, leads);
    const actions = result.map((s) => s.action);
    assert.ok(actions.includes('increase_activity'));
  });

  it('suggests adding contacts when ratio is low', () => {
    const stats = { activitiesLast30Days: 50, totalContacts: 5, totalAccounts: 10 };
    const pipeline = { status: 'healthy', score: 80, winRate: 60 };
    const leads = { stagnationRisk: 10, conversionRate: 25 };
    const result = generateDashboardSuggestions(stats, pipeline, leads);
    const actions = result.map((s) => s.action);
    assert.ok(actions.includes('add_more_contacts'));
  });
});

/* ------------------------------------------------------------------ */
/*  generateDashboardInsights                                         */
/* ------------------------------------------------------------------ */
describe('generateDashboardInsights', () => {
  it('returns single insight for zero data', () => {
    const stats = { totalContacts: 0, totalAccounts: 0, totalLeads: 0, totalOpportunities: 0 };
    const result = generateDashboardInsights(stats, {}, {});
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].includes('No CRM data'));
  });

  it('includes pipeline and lead health when data present', () => {
    const stats = {
      totalContacts: 10,
      totalAccounts: 5,
      totalLeads: 20,
      totalOpportunities: 15,
      newLeadsLast30Days: 8,
      activitiesLast30Days: 25,
      openOpportunities: 5,
    };
    const pipeline = { score: 72, status: 'needs_attention', winRate: 45 };
    const leads = { score: 55, status: 'needs_attention' };
    const result = generateDashboardInsights(stats, pipeline, leads);
    assert.ok(result.length >= 3, `Expected at least 3 insights, got ${result.length}`);
    assert.ok(result.some((i) => i.includes('Pipeline health')));
    assert.ok(result.some((i) => i.includes('win rate')));
    assert.ok(result.some((i) => i.includes('Lead funnel')));
  });

  it('includes activity velocity when activities exist', () => {
    const stats = {
      totalContacts: 10,
      totalAccounts: 5,
      totalLeads: 20,
      totalOpportunities: 15,
      activitiesLast30Days: 60,
      newLeadsLast30Days: 0,
      openOpportunities: 0,
    };
    const result = generateDashboardInsights(
      stats,
      { score: 50, status: 'needs_attention' },
      { score: 50, status: 'needs_attention' },
    );
    assert.ok(result.some((i) => i.includes('activities/day')));
  });
});

/* ------------------------------------------------------------------ */
/*  generateTrendPredictions                                          */
/* ------------------------------------------------------------------ */
describe('generateTrendPredictions', () => {
  it('returns critical lead volume for zero new leads', () => {
    const stats = { newLeadsLast30Days: 0, activitiesLast30Days: 0 };
    const result = generateTrendPredictions(stats, {}, {});
    assert.strictEqual(result.trends.leadVolume, 'critical');
    assert.strictEqual(result.trends.activityLevel, 'low');
    assert.ok(result.recommendations.length >= 1);
  });

  it('returns stable lead volume for > 10 new leads', () => {
    const stats = { newLeadsLast30Days: 25, activitiesLast30Days: 50 };
    const result = generateTrendPredictions(stats, {}, {});
    assert.strictEqual(result.trends.leadVolume, 'stable');
    assert.strictEqual(result.trends.activityLevel, 'high');
    assert.strictEqual(result.nextMonth.expectedNewLeads, 25);
  });

  it('calculates expected conversions from conversion rate', () => {
    const stats = { newLeadsLast30Days: 10, activitiesLast30Days: 20, totalLeads: 100 };
    const leads = { conversionRate: 20 };
    const result = generateTrendPredictions(stats, {}, leads);
    assert.strictEqual(result.nextMonth.expectedConversions, 2); // 100 * 0.2 * 0.1
  });

  it('calculates expected wins from pipeline win rate', () => {
    const stats = { newLeadsLast30Days: 10, activitiesLast30Days: 20, openOpportunities: 20 };
    const pipeline = { winRate: 50 };
    const result = generateTrendPredictions(stats, pipeline, {});
    assert.strictEqual(result.nextMonth.expectedWins, 2); // 20 * 0.5 * 0.15 = 1.5 → 2
  });
});

/* ------------------------------------------------------------------ */
/*  createStubAiContext                                               */
/* ------------------------------------------------------------------ */
describe('createStubAiContext', () => {
  it('creates stub with disabled message when no error', () => {
    const startTime = Date.now() - 100;
    const result = createStubAiContext(startTime);
    assert.strictEqual(result.confidence, 0);
    assert.strictEqual(result._stub, true);
    assert.ok(result.insights[0].includes('disabled'));
    assert.ok(result.processingTime >= 100);
  });

  it('creates stub with error message when error provided', () => {
    const startTime = Date.now();
    const result = createStubAiContext(startTime, 'connection timeout');
    assert.ok(result.insights[0].includes('connection timeout'));
    assert.strictEqual(result._stub, true);
  });
});

/* ------------------------------------------------------------------ */
/*  warnIfSlow                                                        */
/* ------------------------------------------------------------------ */
describe('warnIfSlow', () => {
  it('does not throw for any input', () => {
    // warnIfSlow only logs — just verify it doesn't crash
    assert.doesNotThrow(() => warnIfSlow('test-op', 0));
    assert.doesNotThrow(() => warnIfSlow('test-op', 99999));
  });
});
