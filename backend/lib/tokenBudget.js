/**
 * TOKEN BUDGET MANAGER
 * Provides token estimation and budget enforcement for AI calls
 * 
 * Purpose:
 * - Prevent runaway payload sizes
 * - Provide telemetry for cost optimization
 * - Enforce hard ceilings on token usage
 * 
 * Note: Token counting is approximate (~4 chars/token).
 * This is intentional - we only need stable estimation, not exact counts.
 * 
 * @see backend/README-ai-budget.md for full documentation
 * @see backend/lib/aiBudgetConfig.js for centralized configuration
 */

import { getAiBudgetConfig, CORE_TOOLS } from './aiBudgetConfig.js';

// Re-export for consumers who need the drop order
export { DROP_ORDER } from './aiBudgetConfig.js';

// ============================================================================
// RESOLVED CAPS (from centralized config)
// ============================================================================

/**
 * Get current token caps from centralized config
 * @returns {object} Token caps object
 */
export function getTokenCaps() {
  return getAiBudgetConfig().caps;
}

// Legacy export for backwards compatibility
// Note: This is evaluated at module load time - for dynamic config, use getTokenCaps()
export const TOKEN_CAPS = {
  get HARD_CEILING() { return getAiBudgetConfig().caps.HARD_CEILING; },
  get SYSTEM_PROMPT() { return getAiBudgetConfig().caps.SYSTEM_PROMPT; },
  get TOOL_SCHEMA() { return getAiBudgetConfig().caps.TOOL_SCHEMA; },
  get MEMORY() { return getAiBudgetConfig().caps.MEMORY; },
  get TOOL_RESULT() { return getAiBudgetConfig().caps.TOOL_RESULT; },
  get OUTPUT_MAX() { return getAiBudgetConfig().caps.OUTPUT_MAX; },
};

// ============================================================================
// TOKEN ESTIMATION FUNCTIONS
// ============================================================================

/**
 * Estimate token count for a text string
 * Rough estimate: 1 token ≈ 4 characters
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

/**
 * Estimate token count for a messages array
 * Accounts for role, content, and tool_calls
 * @param {Array} messages - Array of message objects
 * @returns {number} Estimated token count
 */
export function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  
  let totalTokens = 0;
  for (const msg of messages) {
    // Role overhead (~4 tokens per message for role/formatting)
    totalTokens += 4;
    
    // Content
    if (msg.content) {
      totalTokens += estimateTokens(msg.content);
    }
    
    // Tool calls (serialize to JSON and estimate)
    if (msg.tool_calls) {
      try {
        totalTokens += estimateTokens(JSON.stringify(msg.tool_calls));
      } catch {
        totalTokens += 50; // Fallback estimate
      }
    }
    
    // Tool response content
    if (msg.tool_call_id) {
      totalTokens += 10; // ID overhead
    }
  }
  
  return totalTokens;
}

/**
 * Estimate token count for tool schemas
 * @param {Array} tools - Array of tool definitions
 * @returns {number} Estimated token count
 */
export function estimateToolsTokens(tools) {
  if (!Array.isArray(tools)) return 0;
  
  let totalTokens = 0;
  for (const tool of tools) {
    try {
      // Extract key parts: name, description, parameters
      const schemaText = JSON.stringify({
        name: tool.function?.name,
        description: tool.function?.description,
        parameters: tool.function?.parameters
      });
      totalTokens += estimateTokens(schemaText);
    } catch {
      totalTokens += 100; // Fallback per-tool estimate
    }
  }
  
  return totalTokens;
}

// ============================================================================
// BUDGET REPORTING
// ============================================================================

/**
 * Build a detailed budget report
 * @param {object} params - Components to measure
 * @param {object} customCaps - Optional custom caps (uses getTokenCaps() by default)
 * @returns {object} Budget report with token counts
 */
export function buildBudgetReport({ systemPrompt, messages, tools, memoryText, toolResultSummaries }, customCaps = null) {
  const caps = customCaps || getTokenCaps();
  const systemTokens = estimateTokens(systemPrompt);
  const messagesTokens = estimateMessagesTokens(messages);
  const toolsTokens = estimateToolsTokens(tools);
  const memoryTokens = estimateTokens(memoryText);
  const toolResultTokens = estimateTokens(toolResultSummaries);
  
  const totalTokens = systemTokens + messagesTokens + toolsTokens + memoryTokens + toolResultTokens;
  
  return {
    systemTokens,
    messagesTokens,
    toolsTokens,
    memoryTokens,
    toolResultTokens,
    totalTokens,
    caps: { ...caps },
    overBudget: totalTokens > caps.HARD_CEILING,
    breakdown: {
      system: `${systemTokens}/${caps.SYSTEM_PROMPT}`,
      tools: `${toolsTokens}/${caps.TOOL_SCHEMA}`,
      memory: `${memoryTokens}/${caps.MEMORY}`,
      toolResults: `${toolResultTokens}/${caps.TOOL_RESULT}`,
      total: `${totalTokens}/${caps.HARD_CEILING}`,
    }
  };
}

// ============================================================================
// BUDGET ENFORCEMENT (DROP ORDER)
// ============================================================================

/**
 * Apply budget caps with strict drop order
 * Drop order when over budget:
 * 1. Drop/trim memoryText
 * 2. Reduce tools further (keep forced + core tools)
 * 3. Trim conversation messages (keep system + last 2 user turns + last assistant)
 * 4. Hard-trim systemPrompt (last resort)
 * 
 * @param {object} params - Components to trim
 * @param {object} customCaps - Optional custom caps (uses getTokenCaps() by default)
 * @returns {object} Trimmed components + report + actions taken
 */
export function applyBudgetCaps({
  systemPrompt,
  messages,
  tools,
  memoryText = '',
  toolResultSummaries = '',
  forcedTool = null,
  caps = null
}) {
  // Use centralized config if no custom caps provided
  const effectiveCaps = caps || getTokenCaps();
  const actionsTaken = [];
  let currentSystemPrompt = systemPrompt || '';
  let currentMessages = [...(messages || [])];
  let currentTools = [...(tools || [])];
  let currentMemoryText = memoryText || '';
  let currentToolResultSummaries = toolResultSummaries || '';
  
  // Helper to get current total
  const getCurrentTotal = () => {
    return estimateTokens(currentSystemPrompt) +
           estimateMessagesTokens(currentMessages) +
           estimateToolsTokens(currentTools) +
           estimateTokens(currentMemoryText) +
           estimateTokens(currentToolResultSummaries);
  };
  
  let currentTotal = getCurrentTotal();
  
  // -------------------------------------------------------------------------
  // STEP 1: Drop/trim memoryText if over budget
  // -------------------------------------------------------------------------
  if (currentTotal > effectiveCaps.HARD_CEILING && currentMemoryText) {
    const memoryTokens = estimateTokens(currentMemoryText);
    
    if (memoryTokens > effectiveCaps.MEMORY) {
      // Trim to cap
      const maxChars = effectiveCaps.MEMORY * 4; // Rough chars for token cap
      currentMemoryText = currentMemoryText.substring(0, maxChars);
      actionsTaken.push(`trimmed_memory_to_${effectiveCaps.MEMORY}_tokens`);
    }
    
    // If still over, drop memory entirely
    if (getCurrentTotal() > effectiveCaps.HARD_CEILING) {
      currentMemoryText = '';
      actionsTaken.push('dropped_memory');
    }
    
    currentTotal = getCurrentTotal();
  }
  
  // Also enforce memory cap even if under total budget
  if (currentMemoryText && estimateTokens(currentMemoryText) > effectiveCaps.MEMORY) {
    const maxChars = effectiveCaps.MEMORY * 4;
    currentMemoryText = currentMemoryText.substring(0, maxChars);
    if (!actionsTaken.includes('trimmed_memory_to_250_tokens')) {
      actionsTaken.push(`capped_memory_at_${effectiveCaps.MEMORY}_tokens`);
    }
  }
  
  // -------------------------------------------------------------------------
  // STEP 2: Reduce tools if still over budget
  // -------------------------------------------------------------------------
  if (getCurrentTotal() > effectiveCaps.HARD_CEILING) {
    const toolsTokens = estimateToolsTokens(currentTools);
    
    if (toolsTokens > effectiveCaps.TOOL_SCHEMA && currentTools.length > 3) {
      // Keep forced tool, core tools, and first few others
      const mustKeep = new Set(CORE_TOOLS);
      if (forcedTool) mustKeep.add(forcedTool);
      
      const keptTools = currentTools.filter(t => mustKeep.has(t.function?.name));
      const otherTools = currentTools.filter(t => !mustKeep.has(t.function?.name));
      
      // Keep just 1-2 additional tools
      const additionalCount = Math.max(1, 3 - keptTools.length);
      currentTools = [...keptTools, ...otherTools.slice(0, additionalCount)];
      actionsTaken.push(`reduced_tools_to_${currentTools.length}`);
    }
    
    currentTotal = getCurrentTotal();
  }
  
  // -------------------------------------------------------------------------
  // STEP 3: Trim conversation messages if still over budget
  // -------------------------------------------------------------------------
  if (getCurrentTotal() > effectiveCaps.HARD_CEILING) {
    // CRITICAL: Always retain system message + LAST user message
    const systemMsg = currentMessages.find(m => m.role === 'system');
    const nonSystemMsgs = currentMessages.filter(m => m.role !== 'system');
    
    // Find the LAST user message (must always be retained)
    const lastUserMsgIndex = nonSystemMsgs.map((m, i) => ({ m, i })).filter(x => x.m.role === 'user').pop()?.i;
    const lastUserMsg = lastUserMsgIndex !== undefined ? nonSystemMsgs[lastUserMsgIndex] : null;
    
    // Get recent messages, ensuring last user message is included
    let recentNonSystem = nonSystemMsgs.slice(-4);
    
    // If last user message isn't in recent 4, force-include it
    if (lastUserMsg && !recentNonSystem.includes(lastUserMsg)) {
      recentNonSystem = [lastUserMsg, ...recentNonSystem.slice(0, 3)];
    }
    
    currentMessages = systemMsg ? [systemMsg, ...recentNonSystem] : recentNonSystem;
    
    if (currentMessages.length < messages.length) {
      actionsTaken.push(`trimmed_messages_to_${currentMessages.length}`);
    }
    
    currentTotal = getCurrentTotal();
  }
  
  // -------------------------------------------------------------------------
  // STEP 4: Hard-trim systemPrompt (last resort)
  // -------------------------------------------------------------------------
  if (getCurrentTotal() > effectiveCaps.HARD_CEILING) {
    const systemTokens = estimateTokens(currentSystemPrompt);
    
    if (systemTokens > effectiveCaps.SYSTEM_PROMPT) {
      const maxChars = effectiveCaps.SYSTEM_PROMPT * 4;
      currentSystemPrompt = currentSystemPrompt.substring(0, maxChars) + '\n\n[System prompt truncated for token budget]';
      actionsTaken.push(`hard_trimmed_system_prompt_to_${effectiveCaps.SYSTEM_PROMPT}`);
    }
    
    currentTotal = getCurrentTotal();
  }
  
  // -------------------------------------------------------------------------
  // STEP 5: Enforce tool result cap
  // -------------------------------------------------------------------------
  if (currentToolResultSummaries && estimateTokens(currentToolResultSummaries) > effectiveCaps.TOOL_RESULT) {
    const maxChars = effectiveCaps.TOOL_RESULT * 4;
    currentToolResultSummaries = currentToolResultSummaries.substring(0, maxChars);
    actionsTaken.push(`capped_tool_results_at_${effectiveCaps.TOOL_RESULT}_tokens`);
  }
  
  // Build final report
  const report = buildBudgetReport({
    systemPrompt: currentSystemPrompt,
    messages: currentMessages,
    tools: currentTools,
    memoryText: currentMemoryText,
    toolResultSummaries: currentToolResultSummaries
  }, effectiveCaps);
  
  return {
    systemPrompt: currentSystemPrompt,
    messages: currentMessages,
    tools: currentTools,
    memoryText: currentMemoryText,
    toolResultSummaries: currentToolResultSummaries,
    report,
    actionsTaken
  };
}

/**
 * Enforce tool schema token cap
 * @param {Array} tools - Tool schemas
 * @param {object} options - Options
 * @returns {Array} Capped tools
 */
export function enforceToolSchemaCap(tools, { forcedTool = null, cap = null } = {}) {
  if (!Array.isArray(tools)) return [];
  
  // Use centralized config cap if not provided
  const effectiveCap = cap ?? getTokenCaps().TOOL_SCHEMA;
  let currentTokens = estimateToolsTokens(tools);
  
  if (currentTokens <= effectiveCap) {
    return tools;
  }
  
  // Must keep these
  const mustKeep = new Set(CORE_TOOLS);
  if (forcedTool) mustKeep.add(forcedTool);
  
  const keptTools = tools.filter(t => mustKeep.has(t.function?.name));
  const otherTools = tools.filter(t => !mustKeep.has(t.function?.name));
  
  // Iteratively add tools until we hit cap
  let result = [...keptTools];
  for (const tool of otherTools) {
    const testResult = [...result, tool];
    if (estimateToolsTokens(testResult) <= effectiveCap) {
      result.push(tool);
    } else {
      break;
    }
  }
  
  console.log('[TokenBudget] Enforced tool schema cap:', {
    original: tools.length,
    capped: result.length,
    tokensEstimate: estimateToolsTokens(result),
    cap: effectiveCap
  });
  
  return result;
}

/**
 * Log a one-line budget summary
 * @param {object} report - Budget report from buildBudgetReport
 * @param {Array} actionsTaken - Actions taken during budget enforcement
 */
export function logBudgetSummary(report, actionsTaken = []) {
  console.log('[Budget] total=' + report.totalTokens + 
    ', system=' + report.systemTokens + 
    ', tools=' + report.toolsTokens + 
    ', memory=' + report.memoryTokens + 
    ', history=' + report.messagesTokens +
    (actionsTaken.length > 0 ? ', actions=' + actionsTaken.join(',') : ''));
}
