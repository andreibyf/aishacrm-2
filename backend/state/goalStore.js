/**
 * Goal Store - Redis-backed persistence for active goals
 * 
 * Uses the existing memoryClient for Redis operations.
 * Goals have a 15-minute TTL and are namespaced by conversationId.
 */

import { getMemoryClient, isMemoryAvailable } from '../lib/memoryClient.js';

const GOAL_TTL_SECONDS = 900; // 15 minutes
const GOAL_KEY_PREFIX = 'activeGoal:';

/**
 * Generate Redis key for a conversation's active goal
 * @param {string} conversationId
 * @returns {string}
 */
function goalKey(conversationId) {
  return `${GOAL_KEY_PREFIX}${conversationId}`;
}

/**
 * Store an active goal in Redis
 * @param {string} conversationId
 * @param {import('./activeGoal.js').ActiveGoal} goal
 * @returns {Promise<void>}
 */
export async function setActiveGoal(conversationId, goal) {
  if (!isMemoryAvailable()) {
    console.warn('[GoalStore] Redis not available, goal not persisted');
    return;
  }
  
  const client = getMemoryClient();
  const key = goalKey(conversationId);
  const now = Date.now();
  
  const goalData = {
    ...goal,
    updatedAt: now,
    expiresAt: now + (GOAL_TTL_SECONDS * 1000),
  };
  
  await client.set(key, JSON.stringify(goalData), { EX: GOAL_TTL_SECONDS });
}

/**
 * Retrieve an active goal from Redis
 * @param {string} conversationId
 * @returns {Promise<import('./activeGoal.js').ActiveGoal | null>}
 */
export async function getActiveGoal(conversationId) {
  if (!isMemoryAvailable()) {
    return null;
  }
  
  const client = getMemoryClient();
  const key = goalKey(conversationId);
  const data = await client.get(key);
  
  if (!data) {
    return null;
  }
  
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('[GoalStore] Failed to parse goal data:', err.message);
    return null;
  }
}

/**
 * Remove an active goal from Redis
 * @param {string} conversationId
 * @returns {Promise<void>}
 */
export async function clearActiveGoal(conversationId) {
  if (!isMemoryAvailable()) {
    return;
  }
  
  const client = getMemoryClient();
  const key = goalKey(conversationId);
  await client.del(key);
}

/**
 * Refresh the TTL on an existing goal (extend expiration)
 * @param {string} conversationId
 * @returns {Promise<boolean>} True if goal exists and was refreshed
 */
export async function refreshGoalTTL(conversationId) {
  if (!isMemoryAvailable()) {
    return false;
  }
  
  const client = getMemoryClient();
  const key = goalKey(conversationId);
  const result = await client.expire(key, GOAL_TTL_SECONDS);
  return result === 1 || result === true;
}

export { GOAL_TTL_SECONDS };
