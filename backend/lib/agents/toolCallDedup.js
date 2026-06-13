/**
 * Per-run idempotency for the SINGLE-ENTITY task worker's agentic loop.
 *
 * Weak (lite-tier/3B) models frequently re-issue an IDENTICAL tool call after it has
 * already succeeded — they don't recognize the work is done. For a mutating tool
 * (create_note, create_activity, …) the loop would otherwise execute it again and
 * again, producing duplicate records (observed: one "create a note" task created three
 * identical notes across iterations) and burning ~40s LLM iterations until the cap.
 *
 * This guard lets the worker:
 *   1. Skip RE-EXECUTING an identical mutating call (no duplicate side-effect), and
 *   2. Detect an iteration that is nothing but already-done work, so it can stop early
 *      instead of looping to MAX_ITERATIONS.
 *
 * Scope: task worker ONLY. Not in the shared executeBraidTool — AiSHA chat is
 * multi-entity with its own loop and is intentionally unaffected. Read/query tools are
 * NOT deduped (repeating a read is harmless and may be intentional to observe new state);
 * only mutations, where a duplicate has a real cost, are guarded.
 */

// Tools that change state — a repeated identical call is a duplicate, not intent.
const MUTATING_TOOL_RE =
  /^(create|update|delete|add|remove|log|send|draft|schedule|convert|promote|advance|assign|set|mark|move|attach|link|post)_/i;

/** True for a state-mutating tool name (vs. a read/search/get). */
export function isMutatingTool(toolName) {
  return typeof toolName === 'string' && MUTATING_TOOL_RE.test(toolName);
}

// Keys excluded from the dedup signature: they are injected/normalized by the system
// (Braid overrides tenant_id with the authorized context regardless of what the model
// passes) or are volatile, so they don't define whether two calls are the SAME action.
// Critically, weak models fill tenant_id inconsistently (null on the first call, the real
// id afterward), which would otherwise make two identical creates look different and
// defeat dedup.
const SIGNATURE_IGNORE_KEYS = new Set([
  'tenant_id',
  'tenant_id_text',
  'created_by',
  'created_at',
  'updated_at',
  'updated_by',
  'id',
  'request_id',
  'requestId',
  'idempotency_key',
]);

/** Stable signature for a tool call (key order independent, system keys ignored) → string. */
export function toolCallSignature(toolName, args) {
  let argsPart = '';
  try {
    const obj = args && typeof args === 'object' ? args : {};
    const keys = Object.keys(obj)
      .filter((k) => !SIGNATURE_IGNORE_KEYS.has(k))
      .sort();
    argsPart = JSON.stringify(obj, keys);
  } catch (_) {
    argsPart = String(args);
  }
  return `${toolName}::${argsPart}`;
}

/**
 * Tracks executed mutating calls within one agentic-loop run and reports duplicates.
 * Construct one per run.
 */
export class MutationGuard {
  constructor() {
    this.seen = new Map(); // signature -> first result
  }

  /**
   * Check a tool call against prior mutations this run.
   * @returns {{ duplicate: boolean, priorResult: any }} duplicate=true if this exact
   *   mutating call already ran (caller should NOT execute it again).
   */
  check(toolName, args) {
    if (!isMutatingTool(toolName)) return { duplicate: false, priorResult: null };
    const sig = toolCallSignature(toolName, args);
    if (this.seen.has(sig)) return { duplicate: true, priorResult: this.seen.get(sig) };
    return { duplicate: false, priorResult: null };
  }

  /** Record a successful mutating call so later identical calls are flagged duplicates. */
  record(toolName, args, result) {
    if (!isMutatingTool(toolName)) return;
    this.seen.set(toolCallSignature(toolName, args), result);
  }
}
