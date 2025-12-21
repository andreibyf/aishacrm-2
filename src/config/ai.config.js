/**
 * AI Agent Configuration
 * Centralized configuration for AI chat and agent behavior
 */

export const AI_CONFIG = {
  /**
   * Conversation persistence settings
   */
  conversation: {
    // Number of days before a conversation is considered stale and removed from localStorage
    maxAgeDays: 7,
    
    // Storage key prefix for conversation IDs
    storageKeyPrefix: 'agent_conversation_',
    
    // Default agent name
    defaultAgentName: 'crm_assistant',
    
    // Default greeting message
    defaultGreeting: 'Hi, how may I help?',
  },

  /**
   * Polling settings for message updates
   */
  polling: {
    // Interval between polls in milliseconds (increased to reduce load)
    intervalMs: 3000,
    // Maximum number of poll attempts after sending a message (slightly fewer attempts)
    maxAttempts: 12,
    // Pause polling when tab/window not focused to avoid wasted cycles
    pauseWhenUnfocused: true,
  },

  /**
   * Voice/Audio settings
   */
  voice: {
    // Delay before playing audio to ensure mic lock takes effect (ms)
    playbackDelayMs: 200,
  },

  /**
   * Context injection settings
   */
  context: {
    // Description for AI assistant
    assistantName: 'Ai-SHA Executive Assistant',
    assistantDescription: 'Context-aware CRM assistant with memory',
  },
};

export default AI_CONFIG;
