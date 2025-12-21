/**
 * Router Guard Middleware
 * 
 * Determines the routing mode for an incoming chat message based on:
 * 1. Whether there's an active goal in Redis for this conversation
 * 2. Whether the user's message indicates a new goal-triggering intent
 */

import { getActiveGoal } from '../state/goalStore.js';

/**
 * Goal-triggering keywords mapped to goal types
 */
const GOAL_TRIGGERS = {
  schedule_call: [
    'schedule a call',
    'book a call',
    'set up a call',
    'arrange a call',
    'schedule call with',
    'call with',
  ],
  send_email: [
    'send an email',
    'email to',
    'draft an email',
    'compose email',
    'send email to',
  ],
  create_reminder: [
    'remind me',
    'set a reminder',
    'create a reminder',
    'reminder to',
  ],
  book_meeting: [
    'book a meeting',
    'schedule a meeting',
    'set up a meeting',
    'arrange a meeting',
  ],
};

/**
 * Detect if text contains a goal-triggering phrase
 * @param {string} text - User input text
 * @returns {{detected: boolean, goalType: string | null}}
 */
function detectGoalIntent(text) {
  const normalized = text.toLowerCase().trim();
  
  for (const [goalType, triggers] of Object.entries(GOAL_TRIGGERS)) {
    for (const trigger of triggers) {
      if (normalized.includes(trigger)) {
        return { detected: true, goalType };
      }
    }
  }
  
  return { detected: false, goalType: null };
}

/**
 * @typedef {'SET_NEW_GOAL' | 'CONTINUE_ACTIVE_GOAL' | 'NORMAL_ROUTING'} RoutingMode
 */

/**
 * @typedef {Object} RouterGuardResult
 * @property {RoutingMode} mode - The determined routing mode
 * @property {import('../state/activeGoal.js').ActiveGoal | null} [activeGoal] - Active goal if continuing
 * @property {string | null} [detectedGoalType] - Detected goal type if setting new
 */

/**
 * Determine routing mode for a chat message
 * 
 * @param {Object} params
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.userText - User's message text
 * @returns {Promise<RouterGuardResult>}
 */
export async function routerGuard({ conversationId, userText }) {
  // First, check if there's an active goal
  const activeGoal = await getActiveGoal(conversationId);
  
  if (activeGoal) {
    // There's an active goal - route to continuation flow
    return {
      mode: 'CONTINUE_ACTIVE_GOAL',
      activeGoal,
      detectedGoalType: null,
    };
  }
  
  // No active goal - check if this message triggers a new goal
  const { detected, goalType } = detectGoalIntent(userText);
  
  if (detected && goalType) {
    return {
      mode: 'SET_NEW_GOAL',
      activeGoal: null,
      detectedGoalType: goalType,
    };
  }
  
  // No goal context - proceed with normal AI chat routing
  return {
    mode: 'NORMAL_ROUTING',
    activeGoal: null,
    detectedGoalType: null,
  };
}

export { detectGoalIntent, GOAL_TRIGGERS };
