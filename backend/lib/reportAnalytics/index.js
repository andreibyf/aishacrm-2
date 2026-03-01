/**
 * Report Analytics — barrel re-export.
 *
 * All business logic extracted from backend/routes/reports.v2.js.
 */

export { calculatePipelineHealth, calculateLeadHealth } from './healthScoring.js';
export { generateDashboardSuggestions } from './suggestions.js';
export { generateDashboardInsights, generateTrendPredictions } from './insights.js';
export {
  buildDashboardAiContext,
  createStubAiContext,
  warnIfSlow,
  ENABLE_AI_ENRICHMENT,
  SLOW_THRESHOLD_MS,
} from './dashboardAiContext.js';
export { safeCount } from './safeCount.js';
