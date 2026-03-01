/**
 * AI suggestion generation for dashboard analytics.
 *
 * Pure function — no I/O, no side-effects.
 */

/**
 * Generate AI suggestions based on dashboard data
 */
export function generateDashboardSuggestions(stats, pipelineHealth, leadHealth) {
  const suggestions = [];

  // Pipeline suggestions
  if (pipelineHealth.status === 'at_risk' || pipelineHealth.status === 'critical') {
    suggestions.push({
      action: 'review_stalled_opportunities',
      priority: 'high',
      reason: `Pipeline health is ${pipelineHealth.status} (score: ${pipelineHealth.score}/100)`,
      confidence: 0.85,
      category: 'pipeline',
    });
  }

  if (pipelineHealth.winRate !== undefined && pipelineHealth.winRate < 30) {
    suggestions.push({
      action: 'analyze_lost_deals',
      priority: 'high',
      reason: `Win rate is ${pipelineHealth.winRate}% - analyze lost opportunities`,
      confidence: 0.9,
      category: 'pipeline',
    });
  }

  // Lead suggestions
  if (leadHealth.stagnationRisk > 50) {
    suggestions.push({
      action: 'work_new_leads',
      priority: 'high',
      reason: `${leadHealth.stagnationRisk}% of leads are unworked - prioritize outreach`,
      confidence: 0.9,
      category: 'leads',
    });
  }

  if (leadHealth.conversionRate < 10) {
    suggestions.push({
      action: 'improve_qualification',
      priority: 'medium',
      reason: `Low conversion rate (${leadHealth.conversionRate}%) - review lead sources`,
      confidence: 0.75,
      category: 'leads',
    });
  }

  // Activity suggestions
  if (stats.activitiesLast30Days < 10) {
    suggestions.push({
      action: 'increase_activity',
      priority: 'medium',
      reason: 'Low activity volume in last 30 days',
      confidence: 0.8,
      category: 'activities',
    });
  }

  // Contact/Account ratio
  if (stats.totalContacts > 0 && stats.totalAccounts > 0) {
    const ratio = stats.totalContacts / stats.totalAccounts;
    if (ratio < 1.5) {
      suggestions.push({
        action: 'add_more_contacts',
        priority: 'low',
        reason: `Low contacts-per-account ratio (${ratio.toFixed(1)})`,
        confidence: 0.65,
        category: 'data_quality',
      });
    }
  }

  return suggestions;
}
