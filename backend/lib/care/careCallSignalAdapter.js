/**
 * Customer C.A.R.E. v1 – Call Signal Adapter
 * 
 * PR5: Shadow wiring for call flows
 * 
 * Converts call context (direction, outcome, transcript, sentiment, etc.)
 * into CareSignals format used by the PR2 state engine.
 * 
 * This adapter is deterministic, stateless, and has no side effects.
 * 
 * Safety guarantees:
 * - Pure function (no DB writes, no external calls)
 * - No message sending
 * - No workflow execution
 * - Only signal derivation
 * 
 * @module backend/lib/care/careCallSignalAdapter
 */

/**
 * Convert call context into CareSignals for state engine
 * 
 * @param {Object} callContext - Call data
 * @param {'inbound' | 'outbound'} callContext.direction - Call direction
 * @param {'answered' | 'no-answer' | 'busy' | 'failed' | 'voicemail'} [callContext.outcome] - Call outcome
 * @param {string} [callContext.transcript] - Full call transcript
 * @param {string} [callContext.summary] - AI-generated summary
 * @param {'positive' | 'neutral' | 'negative'} [callContext.sentiment] - Detected sentiment
 * @param {Object} [callContext.analysis] - Full transcript analysis
 * @param {Array} [callContext.actionItems] - Extracted action items
 * @param {number} [callContext.duration] - Call duration in seconds
 * @param {Object} [callContext.meta] - Additional metadata
 * @returns {Object} CareSignals object
 */
export function signalsFromCall(callContext) {
  const {
    direction,
    outcome = 'unknown',
    transcript = '',
    summary = '',
    sentiment = 'neutral',
    _analysis = {}, // Unused, kept for future enhancement
    actionItems = [],
    duration = 0,
    meta = {}
  } = callContext;

  // Initialize signal object
  const signals = {
    has_bidirectional: false,
    negative_sentiment: false,
    explicit_rejection: false,
    multiple_attempts: false,
    high_engagement: false,
    recent_message: false,
    meta: {
      source: 'call_flow',
      direction,
      outcome,
      duration,
      has_transcript: transcript.length > 0,
      has_summary: summary.length > 0,
      sentiment,
      action_item_count: actionItems.length,
      ...meta
    }
  };

  // Bidirectional communication: answered calls indicate two-way conversation
  if (outcome === 'answered' && duration > 0) {
    signals.has_bidirectional = true;
  }

  // Negative sentiment detection
  if (sentiment === 'negative') {
    signals.negative_sentiment = true;
  }

  // Explicit rejection: voicemail or multiple no-answers can indicate avoidance
  // Note: escalation detector handles phrase-based objection detection
  if (outcome === 'voicemail' || outcome === 'no-answer' || outcome === 'busy') {
    // Mark as potential rejection signal (can be refined later)
    signals.meta.outcome_suggests_rejection = true;
  }

  // High engagement: meaningful conversation with action items
  if (outcome === 'answered' && actionItems.length > 0) {
    signals.high_engagement = true;
  }

  // Recent message: inbound calls are by definition recent customer activity
  if (direction === 'inbound') {
    signals.recent_message = true;
  }

  // Engagement score (optional metadata for future use)
  let engagementScore = 0;
  if (signals.has_bidirectional) engagementScore += 2;
  if (signals.high_engagement) engagementScore += 2;
  if (actionItems.length > 0) engagementScore += actionItems.length;
  if (summary.length > 100) engagementScore += 1;

  signals.meta.engagement_score = engagementScore;

  return signals;
}

/**
 * Build a text payload suitable for escalation detection
 * 
 * Prefers summary over transcript for efficiency.
 * Truncates transcript to safe length if no summary available.
 * 
 * @param {string} [summary] - AI-generated summary
 * @param {string} [transcript] - Full transcript
 * @param {number} [maxLength=5000] - Max characters for transcript
 * @returns {string} Text for analysis
 */
export function buildEscalationText(summary, transcript, maxLength = 5000) {
  if (summary && summary.trim().length > 0) {
    return summary.trim();
  }

  if (transcript && transcript.trim().length > 0) {
    const text = transcript.trim();
    if (text.length <= maxLength) {
      return text;
    }
    // Truncate with ellipsis
    return text.substring(0, maxLength - 3) + '...';
  }

  return '';
}
