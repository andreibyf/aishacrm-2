/**
 * Emits a global event to update AiSHA's context.
 * @param {Object} context - { entity_type, entity_id, title, ... }
 */
export function setAiShaContext(context) {
  const event = new CustomEvent('aisha:context', { detail: context });
  window.dispatchEvent(event);
}

/**
 * Clears AiSHA's context.
 */
export function clearAiShaContext() {
  const event = new CustomEvent('aisha:context', { detail: null });
  window.dispatchEvent(event);
}
