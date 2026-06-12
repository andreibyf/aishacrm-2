/**
 * Pre-flight complexity router + tier ladder — picks the ENTRY model from the task
 * itself (not just the assignee role) and defines the lite→full escalation ladder.
 *
 * Makes model selection task-dependent and graduated, using all the chat tiers:
 *   3B (CPU)  → 7B (CPU)  → 14B (GPU)      [the escalation ladder]
 *   coder-7B (CPU)         → 14B (GPU)      [structured/JSON branch]
 *
 * Tool-aligned by design: "is this a lite-appropriate action?" is answered from
 * `detectIntents` — the SAME description→facet taxonomy that mirrors the Braid
 * tools (`create_note`→note, `create_activity`→activity, `draft_email`→email, …)
 * and that the request monitor uses — not a separate regex list. So routing, the
 * monitor, and the tools share one taxonomy.
 *
 * Cheap + deterministic (zero LLM calls). Entry only sets the STARTING model; the
 * quality pipeline's graduated escalation (next rung) is the safety net. The CPU
 * rungs exist to keep work OFF the GPU, so a hard task climbs 3B→7B→GPU rather
 * than jumping straight to the GPU. Opt-in via AISHA_COMPLEXITY_ROUTING.
 *
 * See docs/plans/2026-06-11-lite-tier-supervisor-refine.md (Decision 2; the
 * 3B→7B→14B ladder).
 */
import { detectTaskType, detectIntents } from './taskType.js';

// tier → LiteLLM alias → physical model. CPU rungs keep work off the GPU;
// 'full' (GPU) is the capability ceiling + final escalation target.
export const TIER_ALIAS = {
  lite: 'aisha-task-lite', // qwen2.5:3b        CPU, fastest (~1.3s)
  mid: 'aisha-lite-7b', // qwen2.5:7b        CPU, general (~5s)
  coder: 'aisha-task-lite-plus', // qwen2.5-coder:7b  CPU, structured/JSON (~8s)
  full: 'aisha-task', // qwen-14b          GPU, ceiling (~1.75s)
};

// CPU tiers run the quality pipeline and can escalate. 'full' (GPU) does not.
export const CPU_TIERS = new Set(['lite', 'mid', 'coder']);

// Graduated escalation: each CPU rung's next step up. 3B→7B→GPU; coder→GPU.
const ESCALATION_LADDER = { lite: 'mid', mid: 'full', coder: 'full' };

/** LiteLLM alias for a tier (defaults to the GPU ceiling for unknown tiers). */
export function aliasForTier(tier) {
  return TIER_ALIAS[tier] || TIER_ALIAS.full;
}

/** The next tier up the ladder when a CPU rung hits a capability gap. */
export function escalationTarget(tier) {
  return ESCALATION_LADDER[tier] || 'full';
}

// Structured / machine-readable output — the code-tuned 7B handles format
// fidelity (valid JSON, columns, schema) better than the general models.
const STRUCTURED_RE =
  /\b(json|csv|tsv|xml|ya?ml|schema|table|spreadsheet|export|parse|formatted?|fields?|columns?|structured|key[-\s]?value)\b/i;

/**
 * Decide the ENTRY tier for a task.
 *
 * Precedence when enabled:
 *   1. multi-step / sequenced   → 'full' (GPU) up front (not lite-appropriate)
 *   2. structured / JSON output → 'coder' (code-tuned 7B)
 *   3. maps to ≥1 Braid action  → 'lite' (3B; parallel "email + note" stays lite —
 *                                  difficulty is handled by the escalation ladder)
 *   4. maps to no tool action   → the role's configured tier (unchanged)
 *
 * When disabled, always returns the role tier (no behavioral change).
 *
 * @param {Object} opts
 * @param {string} opts.description
 * @param {'lite'|'full'} [opts.roleTier='full']
 * @param {boolean} [opts.enabled=false] - AISHA_COMPLEXITY_ROUTING.
 * @returns {{ tier: string, reason: string, intents: string[] }}
 */
export function routeEntryTier({ description, roleTier = 'full', enabled = false }) {
  const intents = detectIntents(description);
  if (!enabled) return { tier: roleTier, reason: 'role_default', intents };

  const { isMultiStep } = detectTaskType(description);
  if (isMultiStep) return { tier: 'full', reason: 'multi_step', intents };

  if (STRUCTURED_RE.test(description)) {
    return { tier: 'coder', reason: 'structured', intents };
  }

  if (intents.length > 0) {
    return { tier: 'lite', reason: `tooled:${intents.join('+')}`, intents };
  }

  return { tier: roleTier, reason: 'untooled_role_default', intents };
}

export default routeEntryTier;
