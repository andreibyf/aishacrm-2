/**
 * Chat Router - Central routing for AI chat messages
 * 
 * Integrates the router guard with flow handlers to provide
 * goal-based conversation management.
 */

import { routerGuard } from '../middleware/routerGuard.js';
import { initializeNewGoalFlow } from './initializeNewGoalFlow.js';
import { continueGoalFlow } from './continueGoalFlow.js';
import logger from '../lib/logger.js';

/**
 * @typedef {Object} ChatRouterResult
 * @property {'goal_response' | 'normal_chat'} type - Response type
 * @property {string} [message] - Response message for goal flows
 * @property {boolean} [handled] - Whether the message was fully handled by goal flow
 * @property {Object} [goal] - Active or new goal object
 */

/**
 * Route an incoming chat message
 * 
 * This function should be called before the standard AI chat processing.
 * If it returns { handled: true }, the caller should use the provided message
 * and skip the normal AI chat flow.
 * 
 * @param {Object} params
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.tenantId - Tenant UUID
 * @param {string} params.userText - User's message text
 * @returns {Promise<ChatRouterResult>}
 */
export async function routeChat({ conversationId, tenantId, userText }) {
  try {
    // Step 1: Determine routing mode
    const guardResult = await routerGuard({ conversationId, userText });
    
    switch (guardResult.mode) {
      case 'CONTINUE_ACTIVE_GOAL': {
        // There's an active goal - handle with continuation flow
        const result = await continueGoalFlow({
          conversationId,
          tenantId,
          userText,
          activeGoal: guardResult.activeGoal,
        });
        
        return {
          type: 'goal_response',
          message: result.message,
          handled: true,
          goal: result.goalCleared ? null : guardResult.activeGoal,
          goalCleared: result.goalCleared,
        };
      }
      
      case 'SET_NEW_GOAL': {
        // New goal detected - initialize it
        const result = await initializeNewGoalFlow({
          conversationId,
          tenantId,
          userText,
          goalType: guardResult.detectedGoalType,
        });
        
        return {
          type: 'goal_response',
          message: result.message,
          handled: true,
          goal: result.goal || null,
          needsMoreInfo: result.needsMoreInfo || false,
        };
      }
      
      case 'NORMAL_ROUTING':
      default: {
        // No goal context - let normal AI chat handle it
        return {
          type: 'normal_chat',
          handled: false,
          message: null,
          goal: null,
        };
      }
    }
  } catch (error) {
    logger.error('[ChatRouter] Error routing message:', error.message);
    
    // On error, fall through to normal chat
    return {
      type: 'normal_chat',
      handled: false,
      message: null,
      goal: null,
      error: error.message,
    };
  }
}

export { routerGuard };
