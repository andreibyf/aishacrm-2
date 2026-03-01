/**
 * Health scoring functions for CRM pipeline and lead analysis.
 *
 * Pure functions — no I/O, no side-effects.
 */

/**
 * Calculate pipeline health based on stage distribution
 */
export function calculatePipelineHealth(stages) {
  if (!stages || stages.length === 0) return { score: 0, status: 'no_data' };

  const total = stages.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);
  if (total === 0) return { score: 0, status: 'no_data' };

  // Healthy pipeline should have good distribution across stages
  const wonStages = stages.filter((s) =>
    ['won', 'closed_won', 'closed'].includes(s.stage?.toLowerCase()),
  );
  const lostStages = stages.filter((s) => ['lost', 'closed_lost'].includes(s.stage?.toLowerCase()));
  const activeStages = stages.filter(
    (s) => !['won', 'closed_won', 'closed', 'lost', 'closed_lost'].includes(s.stage?.toLowerCase()),
  );

  const wonCount = wonStages.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);
  const lostCount = lostStages.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);
  const activeCount = activeStages.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);

  // Calculate win rate for closed deals
  const closedTotal = wonCount + lostCount;
  const winRate = closedTotal > 0 ? wonCount / closedTotal : 0;

  // Score based on: win rate (50%), active pipeline (30%), distribution (20%)
  let score = 0;
  score += winRate * 50; // Up to 50 points for win rate
  score += Math.min(30, (activeCount / Math.max(total, 1)) * 100); // Up to 30 for active pipeline
  score += activeStages.length >= 3 ? 20 : activeStages.length * 7; // Up to 20 for stage diversity

  let status = 'critical';
  if (score >= 75) status = 'healthy';
  else if (score >= 50) status = 'needs_attention';
  else if (score >= 25) status = 'at_risk';

  return { score: Math.round(score), status, winRate: Math.round(winRate * 100) };
}

/**
 * Calculate lead conversion health
 */
export function calculateLeadHealth(statuses) {
  if (!statuses || statuses.length === 0) return { score: 0, status: 'no_data' };

  const total = statuses.reduce((sum, s) => sum + (parseInt(s.count) || 0), 0);
  if (total === 0) return { score: 0, status: 'no_data' };

  const converted = statuses.find((s) => s.status?.toLowerCase() === 'converted');
  const qualified = statuses.find((s) => s.status?.toLowerCase() === 'qualified');
  const contacted = statuses.find((s) => s.status?.toLowerCase() === 'contacted');
  const newLeads = statuses.find((s) => s.status?.toLowerCase() === 'new');

  const convertedCount = parseInt(converted?.count) || 0;
  const qualifiedCount = parseInt(qualified?.count) || 0;
  const contactedCount = parseInt(contacted?.count) || 0;
  const newCount = parseInt(newLeads?.count) || 0;

  // Conversion rate
  const conversionRate = convertedCount / Math.max(total, 1);

  // Lead progression score (are leads moving through pipeline?)
  const progressionScore = (qualifiedCount + contactedCount) / Math.max(total - convertedCount, 1);

  // Stagnation indicator (too many new, unworked leads)
  const stagnationRisk = newCount / Math.max(total, 1);

  // Calculate overall score
  let score = 0;
  score += conversionRate * 40; // Up to 40 for conversion
  score += progressionScore * 35; // Up to 35 for progression
  score += (1 - stagnationRisk) * 25; // Up to 25 for low stagnation
  score = Math.min(100, score * 100);

  let status = 'critical';
  if (score >= 70) status = 'healthy';
  else if (score >= 45) status = 'needs_attention';
  else if (score >= 20) status = 'at_risk';

  return {
    score: Math.round(score),
    status,
    conversionRate: Math.round(conversionRate * 100),
    stagnationRisk: Math.round(stagnationRisk * 100),
  };
}
