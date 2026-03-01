/**
 * Dashboard insight and trend prediction generation.
 *
 * Pure functions — no I/O, no side-effects.
 */

/**
 * Generate insights from dashboard data
 */
export function generateDashboardInsights(stats, pipelineHealth, leadHealth) {
  const insights = [];

  // Overall data health
  const totalRecords =
    (stats.totalContacts || 0) +
    (stats.totalAccounts || 0) +
    (stats.totalLeads || 0) +
    (stats.totalOpportunities || 0);

  if (totalRecords === 0) {
    insights.push('No CRM data found - start by adding leads or accounts');
    return insights;
  }

  // Pipeline insights
  if (pipelineHealth.score !== undefined) {
    insights.push(`Pipeline health score: ${pipelineHealth.score}/100 (${pipelineHealth.status})`);
    if (pipelineHealth.winRate !== undefined) {
      insights.push(`Historical win rate: ${pipelineHealth.winRate}%`);
    }
  }

  // Lead insights
  if (leadHealth.score !== undefined) {
    insights.push(`Lead funnel health: ${leadHealth.score}/100 (${leadHealth.status})`);
    if (stats.newLeadsLast30Days > 0) {
      insights.push(`${stats.newLeadsLast30Days} new leads in last 30 days`);
    }
  }

  // Activity velocity
  if (stats.activitiesLast30Days > 0) {
    const dailyAvg = (stats.activitiesLast30Days / 30).toFixed(1);
    insights.push(`Activity velocity: ${dailyAvg} activities/day`);
  }

  // Open opportunity focus
  if (stats.openOpportunities > 0) {
    insights.push(`${stats.openOpportunities} open opportunities require attention`);
  }

  return insights;
}

/**
 * Generate trend predictions
 */
export function generateTrendPredictions(stats, pipelineHealth, leadHealth) {
  const predictions = {
    nextMonth: {},
    trends: {},
    recommendations: [],
  };

  // Lead volume trend prediction
  const monthlyLeadRate = stats.newLeadsLast30Days || 0;
  predictions.nextMonth.expectedNewLeads = monthlyLeadRate; // Assume stable
  predictions.trends.leadVolume =
    monthlyLeadRate > 10 ? 'stable' : monthlyLeadRate > 5 ? 'low' : 'critical';

  // Activity trend prediction
  const monthlyActivityRate = stats.activitiesLast30Days || 0;
  predictions.nextMonth.expectedActivities = monthlyActivityRate;
  predictions.trends.activityLevel =
    monthlyActivityRate > 30 ? 'high' : monthlyActivityRate > 10 ? 'moderate' : 'low';

  // Conversion prediction based on current funnel
  if (leadHealth.conversionRate !== undefined) {
    predictions.nextMonth.expectedConversions = Math.round(
      (stats.totalLeads || 0) * (leadHealth.conversionRate / 100) * 0.1,
    );
  }

  // Win prediction based on pipeline
  if (stats.openOpportunities > 0 && pipelineHealth.winRate !== undefined) {
    predictions.nextMonth.expectedWins = Math.round(
      stats.openOpportunities * (pipelineHealth.winRate / 100) * 0.15,
    );
  }

  // Recommendations based on predictions
  if (predictions.trends.leadVolume === 'critical') {
    predictions.recommendations.push('Increase lead generation efforts');
  }
  if (predictions.trends.activityLevel === 'low') {
    predictions.recommendations.push('Schedule more customer touchpoints');
  }

  return predictions;
}
