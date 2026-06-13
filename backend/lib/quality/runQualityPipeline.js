/**
 * Lite-tier quality pipeline orchestrator — Phase 3 of
 * docs/plans/2026-06-11-lite-tier-supervisor-refine.md.
 *
 * Wraps the post-execution flow: GATE → classify each defect → cheapest mechanism
 * (mechanical→rule-fix, light/relevance→lite refine, severe/multi-step→escalate)
 * → re-GATE, bounded by a refine cap. Runs ONLY for lite-tier tasks.
 *
 * Modes (LITE_QUALITY_MODE):
 *   - 'shadow'  : gate + classify + log what it WOULD do; never mutate or escalate.
 *   - 'active'  : actually rule-fix / refine on lite, and SIGNAL escalation.
 *
 * Escalation itself (re-running the agentic task on the full/vLLM model) is done
 * by the caller (taskWorkers), not here — this module only decides it and returns
 * `meta.escalated`. The refiner/critic calls it makes stay on lite (CPU).
 */
import { runGates, extractSubjectTerms } from './gates.js';
import { applyRuleFixers } from './ruleFixers.js';
import { assessRelevance } from './relevanceCritic.js';
import { refineOnLite } from './refiner.js';
import { shouldEscalateNow, recordOutcome, shouldRecommendFull } from './escalator.js';

/**
 * @param {Object} opts
 * @param {string} opts.output - the lite agentic-loop's final answer.
 * @param {string} [opts.taskType]
 * @param {boolean} [opts.isMultiStep]
 * @param {Object} [opts.agentProfile]
 * @param {Object} [opts.tenant]
 * @param {Object} [opts.client] - OpenAI-style client for lite critic/refine.
 * @param {string} [opts.model] - lite alias for critic/refine calls.
 * @param {string} [opts.taskDescription]
 * @param {string} [opts.agent] - assignee label (frequency tracking).
 * @param {Object} [opts.config] - { mode, refineMaxAttempts, escalateEnabled, refineTemperature, limits }
 * @returns {Promise<{ output: string, meta: Object }>}
 */
export async function runQualityPipeline({
  output,
  taskType = 'generic_text',
  isMultiStep = false,
  tier = 'lite',
  agentProfile,
  tenant,
  client,
  model,
  taskDescription = '',
  agent,
  config = {},
}) {
  const mode = config.mode === 'active' ? 'active' : 'shadow';
  const cap = Number.isFinite(config.refineMaxAttempts) ? config.refineMaxAttempts : 1;
  const escalateEnabled = config.escalateEnabled !== false;
  const refineTemp = Number.isFinite(config.refineTemperature) ? config.refineTemperature : 0.15;

  const subjectTerms = extractSubjectTerms(taskDescription);
  const ctx = {
    taskType,
    taskDescription,
    subjectTerms,
    agentProfile,
    tenant,
    limits: config.limits || {},
  };

  const meta = {
    tier,
    mode,
    taskType,
    isMultiStep,
    defectsFound: [],
    ruleFixes: [],
    refineCount: 0,
    escalated: false,
    escalateReason: null,
    finalGatePass: null,
    recommendFull: false,
  };

  const settle = (current) => {
    if (mode === 'active') recordOutcome({ agent, taskType, escalated: meta.escalated });
    meta.recommendFull = shouldRecommendFull(agent, taskType);
    return { output: current, meta };
  };

  // Multi-step / sequenced tasks aren't lite-appropriate → escalate up front.
  if (isMultiStep) {
    const g = runGates(output, ctx);
    meta.defectsFound = g.defects;
    meta.finalGatePass = g.pass;
    meta.escalateReason = 'multi_step';
    meta.escalated = mode === 'active' && escalateEnabled;
    return settle(output);
  }

  // Initial gate.
  let current = String(output ?? '');
  let gate = runGates(current, ctx);
  meta.defectsFound = gate.defects;
  if (gate.pass) {
    meta.finalGatePass = true;
    return settle(current);
  }

  // Severe defect → escalate immediately (skip refine).
  let decision = shouldEscalateNow({ defects: gate.defects, isMultiStep, attempts: 0, cap });
  if (decision.escalate) {
    meta.finalGatePass = false;
    meta.escalateReason = decision.reason;
    meta.escalated = mode === 'active' && escalateEnabled;
    return settle(current);
  }

  // SHADOW: record what the active path would attempt, but don't mutate/escalate.
  if (mode !== 'active') {
    meta.finalGatePass = false;
    meta.wouldRuleFix = gate.defects
      .filter((d) => d.defectClass === 'mechanical')
      .map((d) => d.gate);
    meta.wouldRefine = gate.defects.some((d) => d.defectClass !== 'mechanical');
    return settle(output);
  }

  // ── ACTIVE: rule-fix → refine → re-gate, bounded by `cap` ──────────────────
  let attempts = 0;
  // +1 so a final rule-fix-only pass can run after the last refine.
  for (let guard = 0; guard <= cap + 1; guard++) {
    // 1. Cheap mechanical rule-fixes (free).
    const rf = applyRuleFixers(current, gate.defects, ctx);
    if (rf.fixed.length) {
      current = rf.output;
      meta.ruleFixes.push(...rf.fixed);
      gate = runGates(current, ctx);
      if (gate.pass) break;
    }

    // 2. Non-mechanical defects left to refine?
    const refinable = gate.defects.filter((d) => d.defectClass !== 'mechanical');
    if (!refinable.length) break; // nothing a refine pass can address
    if (attempts >= cap || !client) break; // cap spent / no client → stop (escalate below)

    // 3. Build critiques: relevance critic's missing[] + the gate details.
    const critiques = [];
    if (refinable.some((d) => d.defectClass === 'relevance')) {
      const critic = await assessRelevance({
        client,
        model,
        output: current,
        taskDescription,
        subjectTerms,
      });
      if (!critic.relevant && critic.missing.length) critiques.push(...critic.missing);
    }
    for (const d of refinable) if (d.detail) critiques.push(d.detail);
    if (!critiques.length) break;

    // 4. One surgical refine pass on lite.
    const refined = await refineOnLite({
      client,
      model,
      draft: current,
      critiques,
      temperature: refineTemp,
    });
    meta.refineCount += 1;
    attempts += 1;
    if (refined && refined !== current) {
      current = refined;
      gate = runGates(current, ctx);
      if (gate.pass) break;
    } else {
      break; // refine made no change → stop
    }
  }

  meta.finalGatePass = gate.pass;
  meta.defectsFound = gate.defects;

  // Still failing after the cap → escalate to full (capability gap).
  if (!gate.pass) {
    decision = shouldEscalateNow({ defects: gate.defects, isMultiStep, attempts, cap });
    if (decision.escalate && escalateEnabled) {
      meta.escalated = true;
      meta.escalateReason = decision.reason;
    }
  }

  return settle(current);
}

export default runQualityPipeline;
