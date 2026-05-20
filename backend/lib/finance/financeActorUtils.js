/**
 * financeActorUtils.js
 *
 * Shared actor utilities for Finance Ops envelope builders.
 * Extracted from financeEventEnvelope.js and financeCommandEnvelope.js to
 * prevent divergence when new actor types (e.g. 'service_account') are added.
 */

/**
 * Normalizes an actor type string to one of the three canonical values.
 * Any unrecognized type is treated as 'human' — the most restrictive default.
 *
 * @param {string} actorType
 * @returns {'human' | 'ai_agent' | 'system'}
 */
export function normalizeActorType(actorType) {
  if (actorType === 'ai_agent' || actorType === 'system') return actorType;
  return 'human';
}
