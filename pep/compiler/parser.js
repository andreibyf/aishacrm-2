/**
 * PEP Parser — English → CBE Pattern Object
 *
 * Normalises a plain English business rule into a Controlled Business English (CBE)
 * pattern object using deterministic rule-based matching. No LLM calls.
 *
 * Supported CBE grammar (Phase 1):
 *   TRIGGER   ::= "When" ENTITY_REF "is" STATE_CHANGE
 *   ACTION    ::= "automatically" CAPABILITY_REF ENTITY_REF "based on" ATTRIBUTE_REF
 *   FALLBACK  ::= "If" OUTCOME_CONDITION "," CAPABILITY_REF ROLE_REF
 *
 * If the input does not match any supported pattern: returns { match: false, reason }.
 * The parser NEVER guesses. It NEVER returns a partial pattern.
 */

'use strict';

/**
 * Normalize source text: lowercase, collapse whitespace, trim.
 * @param {string} source
 * @returns {string}
 */
function normalize(source) {
  return source
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Extract TRIGGER clause: "when <entity_ref> is <state_change>"
 * @param {string} text - normalized text
 * @returns {{ entity_ref: string, state_change: string } | null}
 */
function extractTrigger(text) {
  // Pattern: "when a/an <entity_ref> is <state_change>,"
  const triggerRegex = /when\s+(?:a\s+|an\s+)?(.+?)\s+is\s+(.+?)(?:,|$)/;
  const match = text.match(triggerRegex);
  if (!match) return null;
  return {
    entity_ref: match[1].trim(),
    state_change: match[2].trim(),
  };
}

/**
 * Extract ACTION clause: "automatically <capability_ref> <entity_ref> based on <attribute_ref>"
 * @param {string} text - normalized text
 * @returns {{ capability_ref: string, entity_ref: string, attribute_ref: string } | null}
 */
function extractAction(text) {
  // Pattern: "automatically <capability_ref> based on <attribute_ref>"
  const actionRegex = /automatically\s+(.+?)\s+based\s+on\s+(?:the\s+)?(.+?)(?:\.|,|$)/;
  const match = text.match(actionRegex);
  if (!match) return null;

  const capabilityPhrase = match[1].trim();
  const attributeRef = match[2].trim();

  return {
    capability_ref: capabilityPhrase,
    entity_ref: extractEntityFromCapability(capabilityPhrase),
    attribute_ref: attributeRef,
  };
}

/**
 * Extract entity reference embedded in capability phrase.
 * E.g. "create the next transaction" → "transaction"
 * @param {string} phrase
 * @returns {string}
 */
function extractEntityFromCapability(phrase) {
  // Remove common verb prefixes and articles
  const cleaned = phrase
    .replace(/^(create|update|delete|read|list|get|fetch|find)\s+/i, '')
    .replace(/^(the\s+)?(next\s+|new\s+|existing\s+)?/i, '')
    .trim();
  return cleaned || phrase;
}

/**
 * Extract FALLBACK clause: "if <outcome_condition>, <capability_ref> <role_ref>"
 * @param {string} text - normalized text
 * @returns {{ outcome_condition: string, capability_ref: string, role_ref: string } | null}
 */
function extractFallback(text) {
  // Pattern: "if <condition>, <capability> the <role>"
  // or: "if <condition>, <capability> <role>"
  const fallbackRegex = /if\s+(.+?)\s*,\s*(.+?)\s+(?:the\s+)?(\w+)\s*\.?\s*$/;
  const match = text.match(fallbackRegex);
  if (!match) return null;

  return {
    outcome_condition: match[1].trim(),
    capability_ref: match[2].trim(),
    role_ref: match[3].trim(),
  };
}

/**
 * Parse plain English source into a CBE pattern object.
 *
 * @param {string} englishSource - The plain English program text
 * @returns {{ match: true, trigger: object, action: object, fallback: object|null, raw: string } | { match: false, reason: string }}
 */
function parse(englishSource) {
  if (!englishSource || typeof englishSource !== 'string') {
    return { match: false, reason: 'Input must be a non-empty string' };
  }

  const raw = englishSource.trim();
  const text = normalize(raw);

  // Attempt to extract TRIGGER
  const trigger = extractTrigger(text);
  if (!trigger) {
    return {
      match: false,
      reason: 'No TRIGGER pattern found. Expected: "When <entity> is <state_change>, ..."',
    };
  }

  // Attempt to extract ACTION
  const action = extractAction(text);
  if (!action) {
    return {
      match: false,
      reason: 'No ACTION pattern found. Expected: "automatically <action> based on <attribute>"',
    };
  }

  // Attempt to extract FALLBACK (optional but expected for full programs)
  const fallback = extractFallback(text);

  return {
    match: true,
    trigger,
    action,
    fallback: fallback || null,
    raw,
  };
}

export { parse, normalize, extractTrigger, extractAction, extractFallback };
