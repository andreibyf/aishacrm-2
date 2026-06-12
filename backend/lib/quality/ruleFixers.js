/**
 * Deterministic rule-fixers for mechanical defects in lite-tier output.
 *
 * Pure functions, zero LLM calls. These resolve the cheapest defect class — a
 * mechanical fix in code is free and beats a refine pass. See
 * docs/plans/2026-06-11-lite-tier-supervisor-refine.md (Defect taxonomy).
 *
 * Each fixer returns the (possibly) modified string; `applyRuleFixers` maps gate
 * ids → fixers and reports which fixes landed.
 */

// Placeholder → identity-field resolver. Keys are matched case-insensitively.
const IDENTITY_PLACEHOLDERS = {
  name: ['your name', 'name', 'my name', 'sender', 'sender name', 'full name', 'your full name'],
  title: ['your title', 'title', 'position', 'role', 'your role', 'your position'],
  company: ['company', 'your company', 'company name', 'organization', 'organisation'],
};

function resolveIdentity(agentProfile, tenant) {
  return {
    name: agentProfile?.display_name || null,
    title: agentProfile?.metadata?.title || agentProfile?.display_name || null,
    company: tenant?.name || tenant?.display_name || null,
  };
}

/**
 * Replace `[Your Name]`-style placeholders with the agent/tenant identity.
 * Only placeholders we have a value for are replaced; others are left intact.
 *
 * @param {string} output
 * @param {Object} agentProfile
 * @param {Object} [tenant]
 * @returns {string}
 */
export function fillIdentityPlaceholders(output, agentProfile, tenant) {
  let text = String(output || '');
  const identity = resolveIdentity(agentProfile, tenant);

  text = text.replace(/\[([^\]]{1,40})\]/g, (match, inner) => {
    const key = String(inner).trim().toLowerCase();
    for (const [field, aliases] of Object.entries(IDENTITY_PLACEHOLDERS)) {
      if (aliases.includes(key) && identity[field]) {
        return identity[field];
      }
    }
    return match; // no value → leave the placeholder untouched
  });

  return text;
}

/**
 * Truncate to a max character length at the nearest sentence/word boundary
 * before the limit, so we don't cut mid-word.
 *
 * @param {string} output
 * @param {number} maxChars
 * @returns {string}
 */
export function truncateToLimit(output, maxChars) {
  const text = String(output || '');
  if (!maxChars || text.length <= maxChars) return text;

  const slice = text.slice(0, maxChars);
  // Prefer the last sentence end, else the last whitespace, else hard cut.
  const lastSentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  );
  if (lastSentence > maxChars * 0.5) return slice.slice(0, lastSentence + 1);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

/**
 * Best-effort extraction of a valid JSON value embedded in surrounding prose
 * (a common small-model failure: "Here is the JSON: {...}"). Returns the
 * canonical stringified JSON if a valid object/array is found, else the
 * original string unchanged.
 *
 * @param {string} output
 * @returns {string}
 */
export function repairJson(output) {
  const text = String(output || '');
  try {
    return JSON.stringify(JSON.parse(text)); // already valid
  } catch {
    /* fall through to extraction */
  }
  const start = text.search(/[{[]/);
  if (start === -1) return text;
  const lastObj = text.lastIndexOf('}');
  const lastArr = text.lastIndexOf(']');
  const end = Math.max(lastObj, lastArr);
  if (end <= start) return text;
  try {
    return JSON.stringify(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return text;
  }
}

/**
 * Apply the rule-fixers indicated by the gate defects.
 *
 * @param {string} output
 * @param {Array<{gate: string}>} defects - from runGates().
 * @param {Object} ctx - { agentProfile, tenant, limits }
 * @returns {{ output: string, fixed: string[] }} fixed = list of gate ids resolved
 */
export function applyRuleFixers(output, defects = [], ctx = {}) {
  let result = String(output || '');
  const fixed = [];

  for (const defect of defects) {
    const before = result;
    switch (defect.gate) {
      case 'no_unfilled_placeholders':
        result = fillIdentityPlaceholders(result, ctx.agentProfile, ctx.tenant);
        break;
      case 'within_length':
        if (ctx?.limits?.maxChars) result = truncateToLimit(result, ctx.limits.maxChars);
        break;
      case 'valid_json':
        result = repairJson(result);
        break;
      default:
        break; // non-mechanical defects are not rule-fixable
    }
    if (result !== before) fixed.push(defect.gate);
  }

  return { output: result, fixed };
}

export default applyRuleFixers;
