/**
 * Pre-flight complexity router — picks the ENTRY model tier from the task itself,
 * not just the assignee role. This makes model selection task-dependent: a task
 * that maps to concrete Braid tool actions (a single or parallel action) enters on
 * lite (CPU), a multi-step/sequenced task enters on full (GPU) up front, and
 * anything that maps to no tool action falls back to the role's tier.
 *
 * Tool-aligned by design: "is this a lite-appropriate action?" is answered from
 * `detectIntents` — the SAME description→facet taxonomy that mirrors the Braid
 * tools (`create_note`→note, `create_activity`→activity, `draft_email`→email,
 * `call_contact`→call, …, see TOOL_FACETS) and that the request monitor uses for
 * mismatch detection. So routing, the monitor, and the tools share one taxonomy
 * rather than a separate regex list.
 *
 * Cheap + deterministic (zero LLM calls). It only sets the STARTING model — the
 * quality pipeline's escalation remains the safety net when a lite entry turns out
 * to be too hard. Opt-in via AISHA_COMPLEXITY_ROUTING.
 *
 * See docs/plans/2026-06-11-lite-tier-supervisor-refine.md (Decision 2: multi-step
 * routes to full up front; simple explicit actions are lite-appropriate; several
 * parallel actions joined by "and" are still simple).
 */
import { detectTaskType, detectIntents } from './taskType.js';

/**
 * Decide the entry tier for a task.
 *
 * Precedence when enabled:
 *   1. multi-step / sequenced        → 'full' (not lite-appropriate; skip the wasted lite pass)
 *   2. maps to ≥1 Braid tool action  → 'lite' (concrete single/parallel action)
 *   3. maps to no tool action        → the role's configured tier (current behavior)
 *
 * When disabled, always returns the role tier (no behavioral change).
 *
 * @param {Object} opts
 * @param {string} opts.description - the task description.
 * @param {'lite'|'full'} [opts.roleTier='full'] - the assignee role's configured tier.
 * @param {boolean} [opts.enabled=false] - AISHA_COMPLEXITY_ROUTING.
 * @returns {{ tier: 'lite'|'full', reason: string, intents: string[] }}
 */
export function routeEntryTier({ description, roleTier = 'full', enabled = false }) {
  const intents = detectIntents(description);

  if (!enabled) return { tier: roleTier, reason: 'role_default', intents };

  const { isMultiStep } = detectTaskType(description);
  if (isMultiStep) return { tier: 'full', reason: 'multi_step', intents };

  // Tool-aligned: a description that maps to known Braid tool facets is a
  // concrete action → lite-appropriate (parallel "email + note" stays lite).
  if (intents.length > 0) {
    return { tier: 'lite', reason: `tooled:${intents.join('+')}`, intents };
  }

  // No recognizable tool action (open-ended reasoning, "update the forecast") →
  // defer to the role's tier.
  return { tier: roleTier, reason: 'untooled_role_default', intents };
}

export default routeEntryTier;
