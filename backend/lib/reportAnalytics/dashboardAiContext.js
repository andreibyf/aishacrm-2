/**
 * Dashboard AI context builder — orchestrates health scoring,
 * suggestions, insights, and trend predictions into a single
 * AI-enrichment payload.
 */

import { getSupabaseClient } from '../supabase-db.js';
import logger from '../logger.js';
import { calculatePipelineHealth, calculateLeadHealth } from './healthScoring.js';
import { generateDashboardSuggestions } from './suggestions.js';
import { generateDashboardInsights, generateTrendPredictions } from './insights.js';

export const ENABLE_AI_ENRICHMENT = process.env.AI_ENRICHMENT_ENABLED !== 'false';
export const SLOW_THRESHOLD_MS = parseInt(process.env.AI_CONTEXT_SLOW_THRESHOLD_MS || '500', 10);

/**
 * Log warning if processing exceeds threshold
 */
export function warnIfSlow(operation, processingTime) {
  if (processingTime > SLOW_THRESHOLD_MS) {
    logger.warn(
      `[reports.v2] SLOW: ${operation} took ${processingTime}ms (threshold: ${SLOW_THRESHOLD_MS}ms)`,
    );
  }
}

/**
 * Create stub AI context when enrichment is disabled or fails
 */
export function createStubAiContext(startTime, error = null) {
  return {
    confidence: 0,
    suggestions: [],
    predictions: null,
    insights: error ? [`AI enrichment unavailable: ${error}`] : ['AI enrichment disabled'],
    trends: null,
    healthScore: null,
    processingTime: Date.now() - startTime,
    _stub: true,
  };
}

/**
 * Build AI context for dashboard bundle
 */
export async function buildDashboardAiContext(stats, tenant_id) {
  const startTime = Date.now();

  if (!ENABLE_AI_ENRICHMENT) {
    return createStubAiContext(startTime);
  }

  try {
    const supabase = getSupabaseClient();

    // Fetch pipeline and lead status data in parallel
    const [pipelineResult, leadStatusResult] = await Promise.all([
      (async () => {
        try {
          let q = supabase.from('v_opportunity_pipeline_by_stage').select('stage, count');
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          const { data } = await q;
          return data || [];
        } catch {
          return [];
        }
      })(),
      (async () => {
        try {
          let q = supabase.from('v_lead_counts_by_status').select('status, count');
          if (tenant_id) q = q.eq('tenant_id', tenant_id);
          const { data } = await q;
          return data || [];
        } catch {
          return [];
        }
      })(),
    ]);

    // Calculate health scores
    const pipelineHealth = calculatePipelineHealth(pipelineResult);
    const leadHealth = calculateLeadHealth(leadStatusResult);

    // Generate AI components
    const suggestions = generateDashboardSuggestions(stats, pipelineHealth, leadHealth);
    const insights = generateDashboardInsights(stats, pipelineHealth, leadHealth);
    const predictions = generateTrendPredictions(stats, pipelineHealth, leadHealth);

    // Calculate overall health score (weighted average)
    let overallHealth = 0;
    let weightSum = 0;
    if (pipelineHealth.score !== undefined && pipelineHealth.status !== 'no_data') {
      overallHealth += pipelineHealth.score * 0.5;
      weightSum += 0.5;
    }
    if (leadHealth.score !== undefined && leadHealth.status !== 'no_data') {
      overallHealth += leadHealth.score * 0.5;
      weightSum += 0.5;
    }
    const healthScore = weightSum > 0 ? Math.round(overallHealth / weightSum) : null;

    const processingTime = Date.now() - startTime;
    warnIfSlow('dashboard-ai-context', processingTime);

    return {
      confidence: 0.82,
      suggestions,
      predictions,
      insights,
      trends: predictions.trends,
      healthScore: {
        overall: healthScore,
        pipeline: pipelineHealth,
        leads: leadHealth,
      },
      processingTime,
    };
  } catch (error) {
    logger.error('[reports.v2] AI context error:', error.message);
    return createStubAiContext(startTime, error.message);
  }
}
