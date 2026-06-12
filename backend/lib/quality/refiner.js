/**
 * Surgical lite self-refine (CPU) — Phase 2 of the lite-tier quality pipeline.
 *
 * One constrained-edit pass: fix ONLY the listed issues, keep everything else
 * verbatim. Editing an existing draft is materially easier than generating from
 * scratch, so a 3B does this well at low temperature — and it keeps the GPU out
 * of the per-task hot path (the whole point of the lite tier). Never escalates by
 * itself; the orchestrator owns that decision. See
 * docs/plans/2026-06-11-lite-tier-supervisor-refine.md (component 5).
 *
 * Pure I/O around an injected client. Any failure → return the original draft
 * unchanged (a refine pass can never make a task worse or block it).
 */

const REFINE_SYSTEM =
  'You revise a draft by changing ONLY the specific issues listed by the user. ' +
  'Keep everything else exactly as written — same structure, tone, and wording. ' +
  'Do not rewrite, do not add commentary or preamble. Output only the revised text.';

/**
 * @param {Object} opts
 * @param {Object} opts.client - OpenAI-style client.
 * @param {string} opts.model - lite alias (e.g. 'aisha-task-lite').
 * @param {string} opts.draft - the text to refine.
 * @param {string[]} opts.critiques - the specific issues to fix (and only these).
 * @param {number} [opts.temperature=0.15] - low temp keeps the edit faithful.
 * @returns {Promise<string>} the refined text, or the original draft on no-op/error.
 */
export async function refineOnLite({ client, model, draft, critiques = [], temperature = 0.15 }) {
  const original = String(draft || '');
  if (!client || !original.trim() || !critiques.length) return original;

  const list = critiques.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const user =
    `Issues to fix (and ONLY these):\n${list}\n\n` +
    `Draft:\n"""${original}"""\n\n` +
    'Revised text:';

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: REFINE_SYSTEM },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: 1024,
    });
    const revised = String(completion?.choices?.[0]?.message?.content || '').trim();
    // Strip a stray wrapping quote block if the model echoed the """ fences.
    const cleaned = revised.replace(/^"""\s*|\s*"""$/g, '').trim();
    return cleaned.length ? cleaned : original;
  } catch {
    return original;
  }
}

export default refineOnLite;
