/**
 * Inbound Classification and Safety Contract
 *
 * Defines how inbound safety checks, spam classification, and quarantine
 * decisions are represented inside AiSHA when the mailbox provider is external.
 *
 * ## Design principles
 *
 * 1. Provider-agnostic — every adapter normalizes its native trust signals
 *    (SpamAssassin headers, Microsoft SCL, Gmail verdict, etc.) into the
 *    canonical shapes defined here.
 *
 * 2. Three-outcome model — every inbound message ends up in exactly one of:
 *    • `accepted`   — delivered into the normal inbound pipeline
 *    • `quarantined` — held for human review before processing
 *    • `rejected`   — silently dropped (logged but never stored)
 *
 * 3. Worker contract — the communications-worker attaches a `safety`
 *    envelope to every inbound event payload before posting it to the
 *    backend internal route.  The backend persists it in
 *    `communications_messages.metadata.safety`.
 */

// ---------------------------------------------------------------------------
// Classification verdicts
// ---------------------------------------------------------------------------

export const SAFETY_VERDICTS = Object.freeze({
  ACCEPTED: 'accepted',
  QUARANTINED: 'quarantined',
  REJECTED: 'rejected',
});

// ---------------------------------------------------------------------------
// Threat categories (provider-normalized)
// ---------------------------------------------------------------------------

export const THREAT_CATEGORIES = Object.freeze({
  SPAM: 'spam',
  PHISHING: 'phishing',
  MALWARE: 'malware',
  SPOOFING: 'spoofing',
  BULK: 'bulk',
  UNKNOWN: 'unknown',
});

// ---------------------------------------------------------------------------
// Authentication result types
// ---------------------------------------------------------------------------

export const AUTH_RESULT_TYPES = Object.freeze({
  SPF: 'spf',
  DKIM: 'dkim',
  DMARC: 'dmarc',
  ARC: 'arc',
});

export const AUTH_RESULT_VALUES = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  SOFTFAIL: 'softfail',
  NEUTRAL: 'neutral',
  NONE: 'none',
  TEMPERROR: 'temperror',
  PERMERROR: 'permerror',
});

// ---------------------------------------------------------------------------
// Shape validators
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validate the safety classification envelope attached to an inbound message.
 *
 * Expected shape (stored in `communications_messages.metadata.safety`):
 * ```json
 * {
 *   "verdict": "accepted",
 *   "score": 0.12,
 *   "threshold": 5.0,
 *   "categories": [],
 *   "provider_verdict": "not_spam",
 *   "provider_score": null,
 *   "auth_results": [
 *     { "type": "spf",   "result": "pass", "detail": "sender IP authorized" },
 *     { "type": "dkim",  "result": "pass", "detail": "signature verified" },
 *     { "type": "dmarc", "result": "pass", "detail": "policy=reject" }
 *   ],
 *   "quarantine_reason": null,
 *   "classified_at": "2025-12-01T00:00:00Z",
 *   "classified_by": "imap_smtp"
 * }
 * ```
 */
export function validateSafetyClassification(safety) {
  const errors = [];

  if (typeof safety !== 'object' || safety === null) {
    return { valid: false, errors: ['safety classification must be an object'] };
  }

  // verdict
  if (!isNonEmptyString(safety.verdict)) {
    errors.push('verdict is required');
  } else if (!Object.values(SAFETY_VERDICTS).includes(safety.verdict)) {
    errors.push(`verdict must be one of: ${Object.values(SAFETY_VERDICTS).join(', ')}`);
  }

  // score (optional, but must be a number when present)
  if (safety.score !== undefined && safety.score !== null && typeof safety.score !== 'number') {
    errors.push('score must be a number when provided');
  }

  // categories
  if (safety.categories !== undefined && safety.categories !== null) {
    if (!Array.isArray(safety.categories)) {
      errors.push('categories must be an array when provided');
    }
  }

  // auth_results
  if (safety.auth_results !== undefined && safety.auth_results !== null) {
    if (!Array.isArray(safety.auth_results)) {
      errors.push('auth_results must be an array when provided');
    } else {
      for (let i = 0; i < safety.auth_results.length; i++) {
        const ar = safety.auth_results[i];
        if (typeof ar !== 'object' || ar === null) {
          errors.push(`auth_results[${i}] must be an object`);
          continue;
        }
        if (!isNonEmptyString(ar.type)) {
          errors.push(`auth_results[${i}].type must be a non-empty string`);
        }
        if (!isNonEmptyString(ar.result)) {
          errors.push(`auth_results[${i}].result must be a non-empty string`);
        }
      }
    }
  }

  // quarantine_reason (required when verdict = quarantined)
  if (safety.verdict === SAFETY_VERDICTS.QUARANTINED) {
    if (!isNonEmptyString(safety.quarantine_reason)) {
      errors.push('quarantine_reason is required when verdict is quarantined');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a single authentication result entry.
 */
export function validateAuthResult(ar) {
  const errors = [];

  if (typeof ar !== 'object' || ar === null) {
    return { valid: false, errors: ['auth result must be an object'] };
  }
  if (!isNonEmptyString(ar.type)) {
    errors.push('type must be a non-empty string');
  }
  if (!isNonEmptyString(ar.result)) {
    errors.push('result must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

/**
 * Build a default "accepted" safety classification for providers that don't
 * expose spam/trust metadata (e.g. basic IMAP with no SpamAssassin headers).
 */
export function buildDefaultSafetyClassification(providerType) {
  return {
    verdict: SAFETY_VERDICTS.ACCEPTED,
    score: null,
    threshold: null,
    categories: [],
    provider_verdict: null,
    provider_score: null,
    auth_results: [],
    quarantine_reason: null,
    classified_at: new Date().toISOString(),
    classified_by: providerType || 'unknown',
  };
}

/**
 * Build a safety classification from provider-specific raw headers.
 *
 * This is a generic normalizer.  Provider adapters may override this with
 * their own implementation that understands richer metadata (e.g. Microsoft
 * Graph `inferenceClassification`, Gmail `labelIds`).
 *
 * @param {object} headers  Parsed MIME headers (lowercase keys)
 * @param {object} options  { providerType, spamThreshold? }
 */
export function classifyFromHeaders(headers = {}, options = {}) {
  const providerType = options.providerType || 'unknown';
  const spamThreshold = typeof options.spamThreshold === 'number' ? options.spamThreshold : 5.0;

  const spamStatus = headers['x-spam-status'] || '';
  const spamScore = parseSpamScore(headers['x-spam-score'] || headers['x-spam-status'] || '');
  const sclHeader = headers['x-ms-exchange-organization-scl'];
  const sclScore = sclHeader !== undefined ? Number.parseInt(sclHeader, 10) : null;
  const authResults = parseAuthenticationResults(headers['authentication-results'] || '');

  // Determine categories
  const categories = [];
  if (
    spamStatus.toLowerCase().startsWith('yes') ||
    (spamScore !== null && spamScore >= spamThreshold)
  ) {
    categories.push(THREAT_CATEGORIES.SPAM);
  }
  if (Number.isInteger(sclScore) && sclScore >= 5) {
    categories.push(THREAT_CATEGORIES.SPAM);
  }

  // Determine verdict
  let verdict = SAFETY_VERDICTS.ACCEPTED;
  let quarantineReason = null;

  if (categories.length > 0) {
    verdict = SAFETY_VERDICTS.QUARANTINED;
    quarantineReason = `Provider classified message as: ${[...new Set(categories)].join(', ')}`;
  }

  return {
    verdict,
    score: spamScore,
    threshold: spamThreshold,
    categories: [...new Set(categories)],
    provider_verdict: spamStatus || null,
    provider_score: sclScore,
    auth_results: authResults,
    quarantine_reason: quarantineReason,
    classified_at: new Date().toISOString(),
    classified_by: providerType,
  };
}

/**
 * Parse a numeric spam score from SpamAssassin-style headers.
 *
 * Examples:
 *   "Yes, score=8.2 required=5.0" → 8.2
 *   "3.1"                         → 3.1
 *   ""                            → null
 */
export function parseSpamScore(header) {
  if (!header) return null;

  const scoreMatch = String(header).match(/score\s*=\s*([\d.+-]+)/i);
  if (scoreMatch) {
    const parsed = Number.parseFloat(scoreMatch[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const plain = Number.parseFloat(header);
  return Number.isFinite(plain) ? plain : null;
}

/**
 * Parse an `Authentication-Results` header into structured auth results.
 *
 * Example input:
 *   "mx.google.com; spf=pass smtp.mailfrom=sender@example.com; dkim=pass header.d=example.com"
 *
 * Returns:
 *   [
 *     { type: "spf",  result: "pass", detail: "smtp.mailfrom=sender@example.com" },
 *     { type: "dkim", result: "pass", detail: "header.d=example.com" }
 *   ]
 */
export function parseAuthenticationResults(header) {
  if (!header) return [];

  const results = [];
  // Split on semicolons, skip the first part (authserv-id)
  const parts = String(header).split(';').slice(1);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Match pattern: "spf=pass detail..."
    const match = trimmed.match(/^(\w+)\s*=\s*(\w+)\s*(.*)?$/);
    if (match) {
      results.push({
        type: match[1].toLowerCase(),
        result: match[2].toLowerCase(),
        detail: (match[3] || '').trim() || null,
      });
    }
  }

  return results;
}

export default {
  SAFETY_VERDICTS,
  THREAT_CATEGORIES,
  AUTH_RESULT_TYPES,
  AUTH_RESULT_VALUES,
  validateSafetyClassification,
  validateAuthResult,
  buildDefaultSafetyClassification,
  classifyFromHeaders,
  parseSpamScore,
  parseAuthenticationResults,
};
