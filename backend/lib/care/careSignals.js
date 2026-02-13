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
  AT_RISK_SILENCE_DAYS: parseInt(process.env.CARE_LEAD_STAGNANT_DAYS) || 14,
  
  /** Days of silence before marking dormant */
  DORMANT_SILENCE_DAYS: parseInt(process.env.CARE_DEAL_DECAY_DAYS) * 2 || 30,
  
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
 * Calculates silence_days if last_inbound_at is provided but silence_days is not.
 * This is a convenience helper for callers who track timestamps but not derived metrics.
 * 
 * @param {CareSignals} signals - Raw signals
 * @returns {CareSignals} Enriched signals
 */
export function enrichSignals(signals) {
  const enriched = { ...signals };
  
  // Calculate silence_days if not provided
  if (signals.last_inbound_at && signals.silence_days === undefined) {
    enriched.silence_days = calculateSilenceDays(signals.last_inbound_at);
  }
  
  return enriched;
}

export default {
  SIGNAL_THRESHOLDS,
  calculateSilenceDays,
  validateSignals,
  enrichSignals
};
