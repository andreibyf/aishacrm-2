/**
 * Task-type detection for the lite-tier quality pipeline.
 *
 * Per the design (docs/plans/2026-06-11-lite-tier-supervisor-refine.md, Decision 2),
 * lite tasks are SINGLE, explicitly-stated actions — "Draft an email", "Create an
 * appointment" — with NO complex sequencing. We read the stated action verb rather
 * than infer intent, and flag anything sequential as `isMultiStep` so the caller can
 * escalate it to the full tier up front.
 *
 * Pure functions, zero LLM calls.
 */

// Ordered intent patterns — first match wins. Each pattern targets an explicit
// "verb + object" phrasing. Kept deliberately tight: we would rather fall through
// to `generic_text` than mislabel.
const INTENT_PATTERNS = [
  {
    type: 'email_draft',
    re: /\b(draft|write|compose|send|reply(?:\s+to)?|respond(?:\s+to)?)\b[\s\S]{0,30}\b(e-?mails?|messages?|notes?\s+to|replies?|outreach|introduction)\b/i,
  },
  {
    type: 'activity_create',
    re: /\b(create|schedule|set\s?up|book|arrange|add|log)\b[\s\S]{0,30}\b(appointments?|meetings?|calls?|tasks?|activit(?:y|ies)|reminders?|events?|follow[\s-]?ups?)\b/i,
  },
  {
    type: 'note_summary',
    re: /\b(summar(?:ise|ize)|recap|brief|condense|tl;?dr|take\s+notes?|note\s+down)\b/i,
  },
];

// Explicit sequencing / dependency connectives — the signal that a task chains
// steps and is therefore NOT lite-appropriate. Note: this is about *sequence*,
// not *count*. Several simple parallel actions joined by "and" — e.g. "create an
// appointment and add a note" — are still a simple request; only an explicit
// ordering ("then", "after that", "once they reply") makes it multi-step.
const SEQUENCING_RE =
  /\b(then|after\s+that|afterwards?|followed\s+by|next,|finally,|step\s*\d|once\s+(?:that|they|you|the)|subsequently|before\s+you)\b/i;

/**
 * Detect the task type and whether it implies multiple sequential steps.
 *
 * @param {string} taskDescription - The explicit task statement.
 * @returns {{ type: string, isMultiStep: boolean }}
 *   type: 'email_draft' | 'activity_create' | 'note_summary' | 'generic_text'
 *   isMultiStep: true only when the task chains steps in sequence (→ escalate).
 */
export function detectTaskType(taskDescription = '') {
  const text = String(taskDescription || '');

  const isMultiStep = SEQUENCING_RE.test(text);

  for (const pattern of INTENT_PATTERNS) {
    if (pattern.re.test(text)) {
      return { type: pattern.type, isMultiStep };
    }
  }

  return { type: 'generic_text', isMultiStep };
}

// ─── Topic / tool-facet classification (for the request monitor) ──────────────
// "Topic" is the legible label for a request, aligned with the tools it uses
// (e.g. "email+note"). We compute the REQUESTED topic from the description and
// the ACTUAL topic from the tools that fired — a divergence is a mismatch.

// Braid tool name → topic facet. Verified against the assistant .braid tools.
export const TOOL_FACETS = {
  draft_email: 'email',
  draftEmail: 'email',
  create_note: 'note',
  createNote: 'note',
  create_activity: 'activity',
  createActivity: 'activity',
  schedule_meeting: 'activity',
  call_contact: 'call',
  callContact: 'call',
  initiate_call: 'call',
  create_contact: 'contact',
  create_lead: 'lead',
  search_web: 'research',
  fetch_web_page: 'research',
  lookup_company_info: 'research',
  get_health_summary: 'summary',
  get_cashflow_summary: 'summary',
};

// Description keyword → requested intent. Mirrored (kept simple) by the monitor's
// Python fallback for jobs that have no worker meta (failed/waiting).
const INTENT_KEYWORDS = [
  { intent: 'email', re: /\b(e-?mail|compose|reply|respond|outreach|introduct(?:ion|ory))\b/i },
  { intent: 'note', re: /\bnotes?\b/i },
  { intent: 'summary', re: /\b(summar(?:ise|ize)|recap|brief|tl;?dr)\b/i },
  {
    intent: 'activity',
    re: /\b(appointments?|meetings?|schedule|calendar|tasks?|reminders?|follow[\s-]?ups?|events?)\b/i,
  },
  { intent: 'call', re: /\bcalls?\b/i },
  { intent: 'contact', re: /\bcontacts?\b/i },
  { intent: 'research', re: /\b(research|look\s?up|investigate|find\s+info)\b/i },
];

// Display ordering so "email+note" is stable regardless of detection order.
const FACET_ORDER = ['email', 'note', 'summary', 'activity', 'call', 'contact', 'lead', 'research'];

// Intents whose absence as a tool facet is a real "the action didn't happen"
// mismatch (DB-mutating side effects). email/summary/research are excluded —
// they can legitimately be satisfied by the response text without a tool.
const ACTION_INTENTS = new Set(['note', 'activity', 'call', 'contact', 'lead']);

/**
 * Requested intents parsed from the task description (a set, so "draft an email
 * and add a note" → ['email','note']).
 * @param {string} description
 * @returns {string[]}
 */
export function detectIntents(description = '') {
  const text = String(description || '');
  return [...new Set(INTENT_KEYWORDS.filter((k) => k.re.test(text)).map((k) => k.intent))];
}

/**
 * Topic facets derived from the tools that actually fired.
 * @param {string[]} toolNames
 * @returns {string[]}
 */
export function facetsFromTools(toolNames = []) {
  return [...new Set((toolNames || []).map((t) => TOOL_FACETS[t]).filter(Boolean))];
}

/**
 * Stable "email+note"-style label from a facet/intent set.
 * @param {string[]} facets
 * @returns {string}
 */
export function topicLabel(facets = []) {
  if (!facets || facets.length === 0) return 'other';
  return [...new Set(facets)]
    .sort((a, b) => {
      const ia = FACET_ORDER.indexOf(a);
      const ib = FACET_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .join('+');
}

/**
 * Did what the user asked for actually happen? Mismatch when a requested
 * action-intent has no corresponding tool facet, or a quality gate failed.
 *
 * @param {Object} opts
 * @param {string[]} opts.requestedIntents
 * @param {string[]} opts.actualFacets
 * @param {boolean|null} [opts.gatePass]
 * @returns {{ mismatch: boolean, reasons: string[] }}
 */
export function computeTopicMismatch({
  requestedIntents = [],
  actualFacets = [],
  gatePass = null,
}) {
  const reasons = [];
  for (const intent of requestedIntents) {
    if (ACTION_INTENTS.has(intent) && !actualFacets.includes(intent)) {
      reasons.push(`requested ${intent} but no ${intent} tool ran`);
    }
  }
  if (gatePass === false) reasons.push('quality gate failed');
  return { mismatch: reasons.length > 0, reasons };
}

export default detectTaskType;
