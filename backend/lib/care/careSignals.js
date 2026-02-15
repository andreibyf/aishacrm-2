/**
 * C.A.R.E. Signals
 * 
 * Defines the signal schema used to drive state transitions in the C.A.R.E. engine.
 * 
 * Signals are deterministic indicators derived from:
 * - Message exchange patterns
 * - Call transcripts
 * - Activity logs
 * - Email engagement
 * - Meeting outcomes
 * 
 * This is a minimal v1 schema focused on observable, objective signals.
 * No AI inference is required for PR2.
 * 
 * @module careSignals
 */

/**
 * Signal thresholds for state transitions (configurable)
 * 
 * These values can be tuned per tenant or globally via config.
 * 
 * @type {Object}
 */
export const SIGNAL_THRESHOLDS = {
  /** Days of silence before marking at_risk */
  AT_RISK_SILENCE_DAYS: (() => {
    const val = parseInt(process.env.CARE_LEAD_STAGNANT_DAYS);
    return Number.isNaN(val) ? 14 : val;
  })(),
  
  /** Days of silence before marking dormant */
  DORMANT_SILENCE_DAYS: (() => {
    const val = parseInt(process.env.CARE_DEAL_DECAY_DAYS);
    return Number.isNaN(val) ? 30 : val * 2;
  })(),
  
  /** Minimum bidirectional exchanges to consider engaged */
  MIN_BIDIRECTIONAL_EXCHANGES: 1
};

/**
 * C.A.R.E. Signals schema
 * 
 * All fields are optional. The state engine will interpret absence
 * as "no signal" and only transition when positive signals exist.
 * 
 * @typedef {Object} CareSignals
 * 
 * @property {Date} [last_inbound_at] - Last inbound communication (email, call, SMS, etc.)
 * @property {Date} [last_outbound_at] - Last outbound communication from us
 * @property {boolean} [has_bidirectional] - True if >= 1 back-and-forth exchange
 * @property {boolean} [proposal_sent] - True if formal proposal/quote sent
 * @property {boolean} [commitment_recorded] - True if commitment detected (verbal/written)
 * @property {boolean} [negative_sentiment] - True if explicit negative sentiment detected
 * @property {boolean} [explicit_rejection] - True if clear "no thanks" or "not interested"
 * @property {number} [silence_days] - Days since last inbound (calculated from last_inbound_at)
 * @property {number} [total_inbound_count] - Total inbound messages (lifetime)
 * @property {number} [total_outbound_count] - Total outbound messages (lifetime)
 * @property {boolean} [meeting_scheduled] - True if meeting scheduled
 * @property {boolean} [meeting_completed] - True if meeting occurred
 * @property {boolean} [contract_signed] - True if contract/agreement signed
 * @property {boolean} [payment_received] - True if payment processed
 */

/**
 * Calculate silence days from last_inbound_at
 * 
 * @param {Date|null} last_inbound_at - Last inbound timestamp
 * @returns {number} Days since last inbound (0 if never, or days elapsed)
 */
export function calculateSilenceDays(last_inbound_at) {
  if (!last_inbound_at) {
    return 0; // No inbound yet = no silence to measure
  }
  
  const now = new Date();
  const lastInbound = new Date(last_inbound_at);
  const diffMs = now - lastInbound;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Validate signals object shape
 * 
 * This is a runtime check to ensure signals passed to the state engine
 * conform to the expected schema.
 * 
 * @param {CareSignals} signals - Signals to validate
 * @returns {boolean} True if valid
 * @throws {Error} If signals object is malformed
 */
export function validateSignals(signals) {
  if (!signals || typeof signals !== 'object') {
    throw new Error('Signals must be an object');
  }
  
  // Optional: validate specific field types if needed
  if (signals.last_inbound_at !== undefined && !(signals.last_inbound_at instanceof Date)) {
    throw new Error('last_inbound_at must be a Date object');
  }
  
  if (signals.last_outbound_at !== undefined && !(signals.last_outbound_at instanceof Date)) {
    throw new Error('last_outbound_at must be a Date object');
  }
  
  if (signals.silence_days !== undefined && typeof signals.silence_days !== 'number') {
    throw new Error('silence_days must be a number');
  }
  
  return true;
}

/**
 * Enrich signals with derived fields
 * 
 * - Calculates silence_days from last_inbound_at if not provided
 * - Overrides caller-provided silence_days when last_inbound_at proves it stale
 *   (e.g., trigger worker computed silence_days=20 from a DB query, but a new
 *   inbound arrived since then — last_inbound_at takes precedence)
 * - Computes engagement_score as a composite signal for future ranking/prioritization
 * 
 * @param {CareSignals} signals - Raw signals
 * @returns {CareSignals} Enriched signals with derived fields
 */
export function enrichSignals(signals) {
  const enriched = { ...signals };
  
  // Recalculate silence_days from last_inbound_at — this is the source of truth.
  // If caller passed both silence_days AND last_inbound_at, the computed value wins
  // because the inbound timestamp is more authoritative than a pre-computed count.
  if (signals.last_inbound_at) {
    const computed = calculateSilenceDays(signals.last_inbound_at);
    
    if (signals.silence_days === undefined) {
      // No caller-provided value — fill in
      enriched.silence_days = computed;
    } else if (computed < signals.silence_days) {
      // Caller's silence_days is stale — a more recent inbound exists.
      // Use the lower (more accurate) value to prevent false at_risk transitions.
      enriched.silence_days = computed;
      enriched.meta = {
        ...(enriched.meta || {}),
        silence_days_overridden: true,
        silence_days_original: signals.silence_days,
        silence_days_computed: computed,
      };
    }
    // If computed >= caller's value, keep caller's (they may have a tighter window)
  }
  
  // Composite engagement score (0-10 scale, for future ranking)
  let score = 0;
  if (enriched.has_bidirectional) score += 3;
  if (enriched.proposal_sent) score += 2;
  if (enriched.commitment_recorded) score += 3;
  if (enriched.meeting_completed) score += 1;
  if (enriched.contract_signed) score += 1;
  if (enriched.explicit_rejection) score -= 5;
  if (enriched.negative_sentiment) score -= 2;
  
  // Silence penalty (diminishing)
  const silence = enriched.silence_days || 0;
  if (silence >= SIGNAL_THRESHOLDS.DORMANT_SILENCE_DAYS) {
    score -= 3;
  } else if (silence >= SIGNAL_THRESHOLDS.AT_RISK_SILENCE_DAYS) {
    score -= 2;
  } else if (silence >= 7) {
    score -= 1;
  }
  
  enriched.engagement_score = Math.max(-5, Math.min(10, score));
  
  return enriched;
}

export default {
  SIGNAL_THRESHOLDS,
  calculateSilenceDays,
  validateSignals,
  enrichSignals
};
