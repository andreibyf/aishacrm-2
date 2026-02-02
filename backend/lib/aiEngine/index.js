// TESTED AND WORKING - DO NOT MODIFY WITHOUT EXPRESS APPROVAL
// This file has been thoroughly tested and is core to AI engine functionality
// Last verified: 2026-01-31

/**
 * AiSHA AI Engine - Unified AI infrastructure
 * 
 * Centralizes model routing, API key resolution, and tenant context
 * for all AI-related routes (ai.js, aiRealtime.js, mcp.js).
 */

export { pickModel, selectLLMConfigForTenant } from "./modelRouter.js";
export { resolveLLMApiKey } from "./keyResolver.js";
export { generateChatCompletion } from "./llmClient.js";
export {
  getTenantIdFromRequest,
  resolveTenantRecord,
  validateUserTenantAccess,
} from "./tenantContext.js";
export {
  logLLMActivity,
  getLLMActivity,
  getLLMActivityStats,
  clearLLMActivity,
} from "./activityLogger.js";
export {
  createAnthropicClientWrapper,
  createAnthropicChatCompletion,
  convertToolsToAnthropic,
  convertMessagesToAnthropic,
  convertResponseToOpenAI,
} from "./anthropicAdapter.js";
