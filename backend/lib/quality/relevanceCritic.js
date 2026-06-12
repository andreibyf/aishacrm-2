/**
 * Lite self-assessment relevance critic (CPU) — Phase 2 of the lite-tier quality
 * pipeline. Asks the lite model whether its OWN output addresses the stated ask,
 * returning the concrete missing elements.
 *
 * Why this can run on lite (and not the GPU): the quality bar is *topical
 * relevance* (Decision 1) — "does this address the stated subject?" is an
 * objective classification a 3B can do, unlike subjective quality scoring (which
 * would need a judge that out-classes the generator). The `missing[]` it returns
 * is fed straight into the refiner, so the relevance check and the refine
 * instruction are the same artifact. See
 * docs/plans/2026-06-11-lite-tier-supervisor-refine.md (component 3).
 *
 * Pure I/O around an injected OpenAI-style client (so tests stub it). Any failure
 * → abstain (treat as relevant) so the critic can never block a task.
 */
import { repairJson } from './ruleFixers.js';

const CRITIC_SYSTEM =
  'You are a strict reviewer. Judge ONLY whether the draft addresses the stated ask — ' +
  'not its style or polish. Reply with compact JSON and nothing else: ' +
  '{"relevant": true|false, "missing": ["..."]}. "missing" lists concrete elements of ' +
  'the ask the draft fails to cover (empty if it is on-topic). JSON only, no prose.';

/**
 * @param {Object} opts
 * @param {Object} opts.client - OpenAI-style client (chat.completions.create).
 * @param {string} opts.model - lite alias (e.g. 'aisha-task-lite').
 * @param {string} opts.output - the draft to assess.
 * @param {string} opts.taskDescription - the stated ask.
 * @param {string[]} [opts.subjectTerms] - salient subject terms (hint for the judge).
 * @returns {Promise<{ relevant: boolean, missing: string[], assessed: boolean }>}
 */
export async function assessRelevance({
  client,
  model,
  output,
  taskDescription,
  subjectTerms = [],
}) {
  if (!client || !String(output || '').trim()) {
    return { relevant: true, missing: [], assessed: false };
  }

  const subj = subjectTerms.length ? ` Subject terms: ${subjectTerms.join(', ')}.` : '';
  const user =
    `Stated ask: ${taskDescription}.${subj}\n\n` +
    `Draft:\n"""${output}"""\n\n` +
    'Does the draft address the stated ask?';

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: user },
      ],
      temperature: 0,
      max_tokens: 200,
    });
    const raw = completion?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(repairJson(raw));
    return {
      // Default to relevant unless the model explicitly says false — abstain on
      // ambiguity rather than trigger needless refine/escalation.
      relevant: parsed.relevant !== false,
      missing: Array.isArray(parsed.missing)
        ? parsed.missing.filter(Boolean).map((m) => String(m).trim())
        : [],
      assessed: true,
    };
  } catch {
    return { relevant: true, missing: [], assessed: false };
  }
}

export default assessRelevance;
