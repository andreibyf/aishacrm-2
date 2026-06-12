/**
 * Deterministic quality gates for the lite-tier quality pipeline.
 *
 * Pure functions, zero LLM calls. Each gate inspects a lite-tier output against
 * the task context and returns pass/fail with a defect class + severity. The
 * headline gate is `relevant_to_subject` (Decision 1): topical relevance is the
 * "good enough" bar. See docs/plans/2026-06-11-lite-tier-supervisor-refine.md.
 *
 * Defect classes:   relevance | mechanical | tone
 * Severity:         severe (→ escalate now) | mild (→ refine) | minor (→ rule-fix)
 *
 * The orchestrator (Phase 3) maps severity → mechanism; gates only diagnose.
 */

// Small stopword set so the relevance overlap measures content words, not glue.
const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'your',
  'you',
  'are',
  'our',
  'was',
  'were',
  'has',
  'have',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'about',
  'into',
  'over',
  'under',
  'they',
  'them',
  'their',
  'there',
  'here',
  'what',
  'when',
  'where',
  'who',
  'how',
  'why',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'at',
  'is',
  'it',
  'be',
  'as',
  'or',
  'by',
  'we',
  'us',
  'me',
  'my',
  'so',
  'do',
  'draft',
  'write',
  'create',
  'schedule',
  'send',
  'compose',
  'summarize',
  'summarise',
  'add',
  'book',
  'arrange',
  'reply',
  'respond',
  'recap',
  'please',
  'email',
  'message',
]);

// Phrases that signal the model refused / punted rather than doing the task.
const REFUSAL_RE =
  /\b(i('?m| am) (sorry|unable|not able)|i can('?t| ?not)|as an ai|i cannot (help|assist|provide)|unable to (help|comply|assist))\b/i;

/**
 * Tokenize text into a set of lowercased content words (length > 2, no stopwords).
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Extract salient subject terms from a task description: quoted phrases and
 * proper nouns (capitalized words), excluding leading/action verbs. Cheap
 * heuristic — when it finds nothing, the relevance gate abstains rather than
 * guessing.
 * @param {string} taskDescription
 * @returns {string[]}
 */
export function extractSubjectTerms(taskDescription) {
  const text = String(taskDescription || '');
  const terms = new Set();

  // Quoted phrases are the strongest subject signal.
  for (const m of text.matchAll(/["'“”‘’]([^"'“”‘’]{2,40})["'“”‘’]/g)) {
    terms.add(m[1].trim());
  }

  // Capitalized words → likely names/companies. Skip the sentence-initial word
  // (usually the action verb: "Draft", "Create") and anything in STOPWORDS.
  const capRe = /\b([A-Z][a-zA-Z]{2,})\b/g;
  let first = true;
  for (const m of text.matchAll(capRe)) {
    const w = m[1];
    if (first && m.index <= 1) {
      first = false;
      continue;
    }
    first = false;
    if (!STOPWORDS.has(w.toLowerCase())) terms.add(w);
  }

  return [...terms];
}

/**
 * Does the output reference the task's subject terms?
 * @returns {{ overlap: number, hits: string[], terms: string[] }}
 */
function subjectOverlap(output, ctx) {
  const terms = ctx.subjectTerms ?? extractSubjectTerms(ctx.taskDescription);
  if (!terms.length) return { overlap: null, hits: [], terms };
  const out = tokenize(output);
  const hits = terms.filter((t) => {
    for (const w of tokenize(t)) if (out.has(w)) return true;
    return false;
  });
  return { overlap: hits.length / terms.length, hits, terms };
}

// ─── Gate definitions ────────────────────────────────────────────────────────
// check(output, ctx) → { pass: true } | { pass: false, severity?, detail? }

const GATE_NON_EMPTY = {
  id: 'non_empty',
  defectClass: 'relevance',
  severity: 'mild', // empty → refine first (Decision 4), not escalate
  check(output) {
    return String(output || '').trim().length > 0
      ? { pass: true }
      : { pass: false, detail: 'output is empty' };
  },
};

const GATE_NO_REFUSAL = {
  id: 'no_model_refusal',
  defectClass: 'relevance',
  severity: 'mild',
  check(output) {
    return REFUSAL_RE.test(String(output || ''))
      ? { pass: false, detail: 'output reads as a refusal/punt' }
      : { pass: true };
  },
};

const GATE_RELEVANT = {
  id: 'relevant_to_subject',
  defectClass: 'relevance',
  severity: 'severe',
  check(output, ctx) {
    const { overlap, hits, terms } = subjectOverlap(output, ctx);
    if (overlap === null) return { pass: true }; // no terms → cannot assess
    if (overlap === 0) {
      return {
        pass: false,
        severity: 'severe',
        detail: `mentions none of the subject terms: ${terms.join(', ')}`,
      };
    }
    if (overlap < 0.34) {
      return {
        pass: false,
        severity: 'mild',
        detail: `low subject overlap (${hits.length}/${terms.length}): ${hits.join(', ')}`,
      };
    }
    return { pass: true };
  },
};

const GATE_NO_PLACEHOLDERS = {
  id: 'no_unfilled_placeholders',
  defectClass: 'mechanical',
  severity: 'minor',
  check(output) {
    const found = String(output || '').match(/\[[A-Za-z][\w ./-]*\]/g);
    return found
      ? { pass: false, detail: `unfilled placeholders: ${[...new Set(found)].join(', ')}` }
      : { pass: true };
  },
};

const GATE_WITHIN_LENGTH = {
  id: 'within_length',
  defectClass: 'mechanical',
  severity: 'minor',
  check(output, ctx) {
    const max = ctx?.limits?.maxChars;
    if (!max) return { pass: true };
    const len = String(output || '').length;
    return len <= max
      ? { pass: true }
      : { pass: false, detail: `output ${len} chars exceeds limit ${max}` };
  },
};

const GATE_HAS_CTA = {
  id: 'has_cta',
  defectClass: 'tone',
  severity: 'mild',
  check(output) {
    const text = String(output || '').toLowerCase();
    const hasCta =
      text.includes('?') ||
      /\b(call|meeting|schedule|book|available|let me know|reach out|reply|connect|chat|discuss)\b/.test(
        text,
      );
    return hasCta ? { pass: true } : { pass: false, detail: 'no clear call-to-action' };
  },
};

const GATE_VALID_JSON = {
  id: 'valid_json',
  defectClass: 'mechanical',
  severity: 'minor',
  check(output) {
    try {
      JSON.parse(String(output || ''));
      return { pass: true };
    } catch {
      return { pass: false, detail: 'output is not valid JSON' };
    }
  },
};

// Gates that run for every task type.
const COMMON_GATES = [GATE_NON_EMPTY, GATE_NO_REFUSAL, GATE_RELEVANT];

// Additional gates per task type.
const GATES_BY_TYPE = {
  email_draft: [GATE_NO_PLACEHOLDERS, GATE_HAS_CTA, GATE_WITHIN_LENGTH],
  activity_create: [GATE_NO_PLACEHOLDERS],
  note_summary: [GATE_WITHIN_LENGTH],
  generic_text: [],
  tool_result: [GATE_VALID_JSON],
};

/**
 * Run the gate set for a task type against an output.
 *
 * @param {string} output - The lite-tier output to inspect.
 * @param {Object} ctx
 * @param {string} [ctx.taskType='generic_text']
 * @param {string} [ctx.taskDescription]
 * @param {string[]} [ctx.subjectTerms] - Pre-extracted terms (else derived).
 * @param {Object} [ctx.limits] - e.g. { maxChars }.
 * @returns {{ pass: boolean, defects: Array<{gate, defectClass, severity, detail}> }}
 */
export function runGates(output, ctx = {}) {
  const taskType = ctx.taskType || 'generic_text';

  // Empty output short-circuits to a single non_empty defect (avoid double-
  // reporting it as also "irrelevant").
  if (String(output || '').trim().length === 0) {
    return {
      pass: false,
      defects: [
        {
          gate: GATE_NON_EMPTY.id,
          defectClass: GATE_NON_EMPTY.defectClass,
          severity: GATE_NON_EMPTY.severity,
          detail: 'output is empty',
        },
      ],
    };
  }

  const gateSet = [...COMMON_GATES, ...(GATES_BY_TYPE[taskType] || [])];
  const defects = [];
  for (const gate of gateSet) {
    const r = gate.check(output, ctx);
    if (r && r.pass === false) {
      defects.push({
        gate: gate.id,
        defectClass: gate.defectClass,
        severity: r.severity || gate.severity,
        detail: r.detail || null,
      });
    }
  }
  return { pass: defects.length === 0, defects };
}

export default runGates;
