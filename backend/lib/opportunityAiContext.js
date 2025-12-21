// AI context helper for v2 opportunities
// Re-exports from the unified aiContextEnricher module

import { buildOpportunityAiContext as enrichOpportunity } from './aiContextEnricher.js';

export async function buildOpportunityAiContext(opportunity, options = {}) {
  return enrichOpportunity(opportunity, options);
}

