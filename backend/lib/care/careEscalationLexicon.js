/**
 * C.A.R.E. v1 - Escalation Detection Lexicon
 * 
 * PR3: Deterministic phrase libraries for escalation triggers
 * 
 * This module contains phrase/keyword arrays used by the escalation detector
 * to identify signals requiring human intervention.
 * 
 * Design:
 * - Keep lists minimal for v1 (expand in future PRs)
 * - All phrases lowercase for case-insensitive matching
 * - Conservative: prefer false positives (escalate when uncertain)
 * 
 * Safety: No side effects, no database access, no external calls.
 */

/**
 * Objection phrases indicating customer wants to stop/opt-out
 * High confidence trigger for escalation
 * 
 * @readonly
 * @type {string[]}
 */
export const OBJECTION_PHRASES = [
  'not interested',
  'stop calling',
  'stop contacting',
  'stop emailing',
  'unsubscribe',
  'leave me alone',
  "don't call",
  "don't contact",
  "don't email",
  'remove me',
  'take me off',
  'opt out',
  'no thanks',
  'not now',
];

/**
 * Pricing and contract phrases requiring careful handling
 * Medium-high confidence trigger
 * 
 * @readonly
 * @type {string[]}
 */
export const PRICING_CONTRACT_PHRASES = [
  'price',
  'pricing',
  'cost',
  'expensive',
  'too much',
  'premium',
  'contract',
  'agreement',
  'terms',
  'cancel',
  'cancellation',
  'refund',
  'money back',
  'payment',
  'billing',
  'invoice',
  'discount',
  'negotiat',
];

/**
 * Compliance-sensitive phrases requiring legal/regulatory caution
 * High confidence trigger for immediate escalation
 * 
 * @readonly
 * @type {string[]}
 */
export const COMPLIANCE_SENSITIVE_PHRASES = [
  'hipaa',
  'gdpr',
  'ssn',
  'social security',
  'lawsuit',
  'attorney',
  'lawyer',
  'legal action',
  'complaint',
  'fraud',
  'scam',
  'illegal',
  'violat',
  'regulation',
  'privacy breach',
  'data breach',
  'sue',
  'court',
];

/**
 * High-risk ambiguous phrases (fail-safe triggers)
 * Low-medium confidence, but escalate to be safe
 * 
 * @readonly
 * @type {string[]}
 */
export const HIGH_RISK_AMBIGUOUS_PHRASES = [
  'threat',
  'harass',
  'abuse',
  'report you',
  'complaint',
  'unethical',
  'inappropriate',
];

/**
 * Negative sentiment indicator words
 * Used as secondary signals with sentiment scoring
 * 
 * @readonly
 * @type {string[]}
 */
export const NEGATIVE_SENTIMENT_WORDS = [
  'angry',
  'frustrated',
  'disappointed',
  'terrible',
  'awful',
  'worst',
  'horrible',
  'useless',
  'waste',
  'regret',
  'mistake',
  'never again',
];

/**
 * Normalize text for phrase matching
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces
 * 
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeText(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Check if text contains any phrase from a list
 * Case-insensitive, partial matching
 * 
 * @param {string} text - Text to search
 * @param {string[]} phrases - Phrases to look for
 * @returns {{matched: boolean, matches: string[]}} Match result
 */
export function containsAnyPhrase(text, phrases) {
  const normalized = normalizeText(text);
  const matches = [];
  
  for (const phrase of phrases) {
    if (normalized.includes(phrase.toLowerCase())) {
      matches.push(phrase);
    }
  }
  
  return {
    matched: matches.length > 0,
    matches,
  };
}
