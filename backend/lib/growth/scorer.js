/**
 * scorer — real LLM-backed opportunity scorer (OSINT Opportunity Intelligence).
 *
 * `opportunityEngine.generateForInsight` calls an injected `scoreFn(candidate)` to
 * turn a deterministic candidate into a scored, worded opportunity. This module
 * provides the PRODUCTION scorer: it routes through **LiteLLM** using the
 * `aisha-summary` virtual alias, which `litellm_config.yaml` maps to the
 * self-hosted **vLLM (Qwen2.5-14B) on the AI Cloud Server** — zero marginal cost,
 * the right fit for cheap, directional batch scoring, and consistent with the
 * app's LiteLLM routing layer.
 *
 * Robust by construction: if LiteLLM/the model is unavailable, returns an error,
 * or emits unparseable output, it falls back to a conservative deterministic
 * score. The engine additionally runs `sanitizeReason` on the final text
 * (stripping invented percentages from trends-sourced reasons), so honesty is
 * enforced downstream too.
 *
 * `callLiteLLMVirtual` is injectable (`deps`) so this is unit-testable without a
 * live LiteLLM / network.
 */

import { callLiteLLMVirtual as defaultCallLiteLLM } from '../aiEngine/index.js';
import logger from '../logger.js';

// LiteLLM virtual alias for growth scoring → vLLM/AI server (see litellm_config.yaml).
const SCORING_MODEL = 'aisha-summary';

const IMPACT = new Set(['high', 'medium', 'low']);

const SYSTEM_PROMPT = `You score market "growth opportunities" for a small business.
Return STRICT JSON only (no prose, no code fences) with these keys:
  "score" (integer 0-100), "expected_impact" ("high"|"medium"|"low"),
  "difficulty" ("high"|"medium"|"low"), "title" (short),
  "reason" (one or two sentences, DIRECTIONAL — describe rising/falling/high/low
  interest; NEVER state absolute search volumes or invented percentages),
  "recommended_action" (one short actionable sentence).`;

/**
 * Conservative deterministic fallback (used when the LLM is unavailable/unparseable).
 * @param {object} candidate
 * @returns {{score:number, expected_impact:string, difficulty:string, recommended_action:string}}
 */
export function fallbackScore(candidate = {}) {
  const isTrends = candidate.signal_type === 'trends';
  return {
    score: isTrends ? 70 : 55,
    expected_impact: isTrends ? 'medium' : 'low',
    difficulty: 'low',
    recommended_action: 'Review this opportunity and decide whether to pursue it.',
  };
}

/**
 * Parse + validate the LLM's JSON output. Returns null if unusable.
 * @param {string} content
 * @returns {object|null}
 */
export function parseScore(content) {
  if (!content || typeof content !== 'string') return null;
  // Tolerate code fences / surrounding text: grab the first {...} block.
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const score = Math.round(Number(obj.score));
  if (!Number.isFinite(score)) return null;
  return {
    score: Math.max(0, Math.min(100, score)),
    expected_impact: IMPACT.has(obj.expected_impact) ? obj.expected_impact : 'medium',
    difficulty: IMPACT.has(obj.difficulty) ? obj.difficulty : 'medium',
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : undefined,
    reason: typeof obj.reason === 'string' && obj.reason.trim() ? obj.reason.trim() : undefined,
    recommended_action:
      typeof obj.recommended_action === 'string' && obj.recommended_action.trim()
        ? obj.recommended_action.trim()
        : fallbackScore({}).recommended_action,
  };
}

/**
 * Build a production scoreFn bound to a tenant. Returns an async function the
 * opportunityEngine can call per candidate.
 *
 * @param {{tenantId:string, deps?:object}} args
 * @returns {(candidate:object)=>Promise<object>}
 */
export function createLlmScoreFn({ tenantId, deps = {} }) {
  const callLiteLLM = deps.callLiteLLMVirtual || defaultCallLiteLLM;

  return async function scoreFn(candidate = {}) {
    try {
      const userPrompt = `Opportunity candidate:
- type: ${candidate.type}
- subject: ${candidate.subject}
- region: ${candidate.region || 'n/a'}
- source signal: ${candidate.signal_type}
Score it per the rules.`;

      const result = await callLiteLLM({
        model: SCORING_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        tenantId,
      });

      if (!result || result.status !== 'success') {
        logger.warn('[growth scorer] LiteLLM did not return success; using fallback', {
          model: SCORING_MODEL,
          tenantId,
          status: result?.status,
          error: result?.error,
        });
        return fallbackScore(candidate);
      }
      const parsed = parseScore(result.content);
      if (!parsed) {
        logger.warn('[growth scorer] LiteLLM output unparseable; using fallback', {
          model: SCORING_MODEL,
          tenantId,
        });
        return fallbackScore(candidate);
      }
      logger.info('[growth scorer] scored via LiteLLM', {
        model: SCORING_MODEL,
        tenantId,
        type: candidate.type,
        score: parsed.score,
      });
      return parsed;
    } catch (err) {
      logger.warn('[growth scorer] LLM scoring failed; using fallback', {
        message: err?.message,
      });
      return fallbackScore(candidate);
    }
  };
}

export default { createLlmScoreFn, fallbackScore, parseScore };
