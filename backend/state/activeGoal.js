/**
 * Active Goal Types and Interfaces
 * 
 * Defines the structure for multi-turn goal-based AI operator conversations.
 * Goals persist across conversation turns until completed, cancelled, or expired.
 */

/**
 * @typedef {'schedule_call' | 'send_email' | 'create_reminder' | 'book_meeting'} GoalType
 */

/**
 * @typedef {Object} ActiveGoal
 * @property {string} goalId - Unique identifier for this goal instance
 * @property {GoalType} goalType - The type of action being performed
 * @property {string} conversationId - Conversation this goal belongs to
 * @property {string} tenantId - Tenant UUID for isolation
 * @property {Record<string, any>} extractedData - Parameters extracted from user input
 * @property {'pending_confirmation' | 'in_progress' | 'awaiting_input' | 'completed' | 'cancelled'} status - Current goal status
 * @property {string} confirmationMessage - Message shown to user for confirmation
 * @property {number} createdAt - Epoch timestamp when goal was created
 * @property {number} updatedAt - Epoch timestamp of last update
 * @property {number} expiresAt - Epoch timestamp when goal expires (TTL enforcement)
 */

/**
 * @typedef {Object} GoalExecutionResult
 * @property {boolean} success - Whether execution succeeded
 * @property {string} message - Human-readable result message
 * @property {any} [data] - Optional result data
 * @property {string} [error] - Error message if failed
 */

// Export empty object since JS doesn't have type exports
export {};
