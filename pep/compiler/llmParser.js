/**
 * PEP LLM Parser — LLM-powered CBE parser
 *
 * Replaces the rigid Phase 1 regex parser with an LLM call that normalizes
 * free-form English into the same CBE pattern object.
 *
 * The output contract is identical to parser.js:
 *   Success: { match: true, trigger, action, fallback, raw }
 *   Failure: { match: false, reason }
 *
 * The parser NEVER throws. Fail-closed on any error.
 *
 * Provider/model driven by environment variables:
 *   PEP_LLM_PROVIDER  (default: "local")
 *   PEP_LLM_MODEL     (default: "qwen2.5-coder:3b")
 *   LOCAL_LLM_BASE_URL (default: "http://ollama:11434/v1")
 */

/* global process */
'use strict';

import { generateChatCompletion } from '../../backend/lib/aiEngine/llmClient.js';

/**
 * Build compact catalog summaries for the system prompt.
 * @param {{ entity_catalog: object, capability_catalog: object }} catalogs
 * @returns {{ entity_summary: string, capability_summary: string }}
 */
function buildCatalogSummaries(catalogs) {
  const { entity_catalog, capability_catalog } = catalogs;

  const entityLines = (entity_catalog.entities || []).map(
    (e) => `${e.id} — ${e.description} in table ${e.aisha_binding?.table || 'unknown'}`,
  );

  const capabilityLines = (capability_catalog.capabilities || []).map(
    (c) => `${c.id} — ${c.description}`,
  );

  return {
    entity_summary: entityLines.join('\n'),
    capability_summary: capabilityLines.join('\n'),
  };
}

/**
 * Build the system prompt for the LLM parser.
 * @param {{ entity_summary: string, capability_summary: string }} summaries
 * @returns {string}
 */
function buildSystemPrompt(summaries) {
  return `You are a strict CBE (Controlled Business English) parser for a business automation system.

Your task: parse a plain English business rule into a structured JSON pattern object.

OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- If you cannot confidently parse the input, return: { "match": false, "reason": "<why>" }
- Never invent entities or capabilities not in the catalog summaries below.

OUTPUT SHAPE (on success):
{
  "match": true,
  "trigger": {
    "entity_ref": "<entity name in plain English>",
    "state_change": "<what condition triggers this>"
  },
  "action": {
    "capability_ref": "<verb phrase describing what to do>",
    "entity_ref": "<entity being acted on>",
    "attribute_ref": "<field or pattern driving the action>"
  },
  "fallback": {
    "outcome_condition": "<condition that triggers fallback>",
    "capability_ref": "<fallback action verb phrase>",
    "role_ref": "<role to notify>"
  }
}

If there is no fallback clause, set "fallback" to null.

VALID ENTITIES:
${summaries.entity_summary}

VALID CAPABILITIES:
${summaries.capability_summary}

Return { "match": false, "reason": "..." } if:
- The intent does not describe a trigger → action pattern
- The entity or capability cannot be mapped to the catalog
- The input is ambiguous or incomplete`;
}

/**
 * Parse English source using an LLM to produce a CBE pattern object.
 *
 * @param {string} englishSource - The plain English program text
 * @param {{ entity_catalog: object, capability_catalog: object }} catalogs
 * @returns {Promise<{ match: boolean, trigger?, action?, fallback?, raw?, reason? }>}
 */
export async function parseLLM(englishSource, catalogs) {
  try {
    const summaries = buildCatalogSummaries(catalogs);
    const systemPrompt = buildSystemPrompt(summaries);

    const provider = process.env.PEP_LLM_PROVIDER || 'local';
    const model = process.env.PEP_LLM_MODEL || 'qwen2.5-coder:3b';

    const opts = {
      provider,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: englishSource },
      ],
      temperature: 0,
    };

    // When provider is "local", pass baseUrl for Ollama
    if (provider === 'local') {
      opts.baseUrl = process.env.LOCAL_LLM_BASE_URL || 'http://ollama:11434/v1';
    }

    const response = await generateChatCompletion(opts);

    if (response.status !== 'success' || !response.content) {
      return {
        match: false,
        reason: `LLM parser unavailable: ${response.error || 'no content returned'}`,
      };
    }

    // Strip markdown code fences if present
    let content = response.content.trim();
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    // Parse LLM response as JSON
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (_jsonErr) {
      return {
        match: false,
        reason: `LLM returned invalid JSON: ${content.slice(0, 100)}`,
      };
    }

    // Validate shape
    if (parsed.match === false) {
      return {
        match: false,
        reason: parsed.reason || 'LLM could not parse the input',
      };
    }

    if (parsed.match === true && parsed.trigger && parsed.action) {
      return {
        match: true,
        trigger: parsed.trigger,
        action: parsed.action,
        fallback: parsed.fallback || null,
        raw: englishSource,
      };
    }

    // Unexpected shape
    return {
      match: false,
      reason: 'LLM returned unexpected response shape',
    };
  } catch (err) {
    // Fail closed — never throw
    return {
      match: false,
      reason: `LLM parser unavailable: ${err.message}`,
    };
  }
}

// Exported for testing
export { buildCatalogSummaries, buildSystemPrompt };
