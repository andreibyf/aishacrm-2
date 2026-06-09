/**
 * researchAgent — on-demand web research synthesis
 * (OSINT Opportunity Intelligence, Phase 1 / Task 10).
 *
 * Used by Braid (in a later task) to answer ad-hoc directional questions about
 * a market/region. It searches the web, optionally reads the top result, and
 * synthesizes a SHORT directional summary via an injected LLM.
 *
 * Everything is injected (searchWeb, fetchPage, llm) so the orchestration is
 * pure-unit testable with no live network and no real model.
 *
 * Honesty contract
 * ----------------
 * The summary must stay DIRECTIONAL — no invented absolute numbers, percentages
 * or rankings. That instruction is baked into the prompt, and when no LLM is
 * available we fall back to joining the source snippets verbatim (no synthesis).
 */

import { searchWeb as defaultSearchWeb, fetchPage as defaultFetchPage } from './webResearch.js';

const DIRECTIONAL_INSTRUCTION =
  'Write a SHORT, directional summary (2-4 sentences). ' +
  'Describe trends and direction only. Do NOT invent absolute numbers, ' +
  'precise percentages, market sizes or rankings that are not present in the ' +
  'sources. If the sources are thin, say so plainly.';

/**
 * Build the LLM prompt from the query and gathered sources.
 * @param {string} query
 * @param {string} region
 * @param {Array<{title?:string, snippet?:string}>} sources
 * @param {string} [pageText]
 * @returns {string}
 */
function buildPrompt(query, region, sources, pageText) {
  const lines = [];
  lines.push(`Research request: ${query}${region ? ` (region: ${region})` : ''}`);
  lines.push('');
  lines.push(DIRECTIONAL_INSTRUCTION);
  lines.push('');
  lines.push('Sources:');
  (sources || []).forEach((s, i) => {
    lines.push(`${i + 1}. ${s.title || 'Untitled'}: ${s.snippet || ''}`);
  });
  if (pageText) {
    lines.push('');
    lines.push('Top-source page extract:');
    lines.push(pageText.slice(0, 4_000));
  }
  return lines.join('\n');
}

/**
 * Fallback summary when no LLM is injected: join source snippets verbatim.
 * @param {Array<{snippet?:string}>} sources
 * @returns {string}
 */
function snippetFallback(sources) {
  const parts = (sources || []).map((s) => s.snippet).filter(Boolean);
  return parts.join(' ');
}

/**
 * Run on-demand research and synthesize a directional summary.
 *
 * @param {object} args
 * @param {string} args.query
 * @param {string} [args.region]
 * @param {object} [deps]
 * @param {Function} [deps.searchWeb] ({q,limit}, deps) => Promise<sources[]>
 * @param {Function} [deps.fetchPage] ({url}, deps) => Promise<page>
 * @param {(prompt:string)=>Promise<string>} [deps.llm] synthesis model.
 * @param {boolean} [deps.readTopResult=false] also fetch the top result's page.
 * @returns {Promise<{query:string, summary:string, sources:Array}>}
 */
export async function research({ query, region } = {}, deps = {}) {
  const q = String(query || '').trim();
  const search = typeof deps.searchWeb === 'function' ? deps.searchWeb : defaultSearchWeb;
  const fetchPageImpl = typeof deps.fetchPage === 'function' ? deps.fetchPage : defaultFetchPage;

  let sources = [];
  try {
    sources = await search({ q, limit: 5 }, deps);
    if (!Array.isArray(sources)) sources = [];
  } catch {
    sources = [];
  }

  // Optionally deepen by reading the top result's page text.
  let pageText = '';
  if (deps.readTopResult && sources.length && sources[0].url) {
    try {
      const page = await fetchPageImpl({ url: sources[0].url }, deps);
      if (page && page.text) pageText = page.text;
    } catch {
      // Fail-soft: keep going with snippets only.
    }
  }

  // No LLM injected → honest, non-synthesized fallback.
  if (typeof deps.llm !== 'function') {
    return { query: q, summary: snippetFallback(sources), sources };
  }

  let summary = '';
  try {
    summary = await deps.llm(buildPrompt(q, region, sources, pageText));
  } catch {
    // LLM failed → fall back to snippets rather than throwing.
    summary = snippetFallback(sources);
  }

  return { query: q, summary: summary || snippetFallback(sources), sources };
}

export default { research };
