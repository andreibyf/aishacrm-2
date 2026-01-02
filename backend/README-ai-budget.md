# AI Token Budget & Memory Gating

This document describes the AI token budget system and memory gating configuration for Aisha CRM.

## Overview

The AI system uses a **token budget contract** to prevent runaway API costs while maintaining response quality. Key features:

- **Hard ceiling**: Maximum ~4000 tokens per request (configurable)
- **Component caps**: Individual limits for system prompt, tools, memory, etc.
- **Smart drop order**: When over budget, components are trimmed in a specific order
- **Memory gating**: RAG memory is only queried when user explicitly asks for historical context

## Configuration Files

| File | Purpose |
|------|---------|
| [aiBudgetConfig.js](lib/aiBudgetConfig.js) | **Single source of truth** for all budget constants |
| [tokenBudget.js](lib/tokenBudget.js) | Token estimation and budget enforcement functions |
| [aiMemory/index.js](lib/aiMemory/index.js) | Memory gating and RAG retrieval logic |

## Token Budget Constants

All values have sensible defaults and can be overridden via environment variables:

| Constant | Default | Env Var | Description |
|----------|---------|---------|-------------|
| HARD_CEILING | 4000 | `AI_TOKEN_HARD_CEILING` | Total token budget (input + reserved output) |
| SYSTEM_PROMPT_CAP | 1200 | `AI_SYSTEM_PROMPT_CAP` | Max tokens for system prompt |
| TOOL_SCHEMA_CAP | 800 | `AI_TOOL_SCHEMA_CAP` | Max tokens for tool JSON schemas |
| MEMORY_CAP | 250 | `AI_MEMORY_CAP` | Max tokens for RAG memory context |
| TOOL_RESULT_CAP | 700 | `AI_TOOL_RESULT_CAP` | Max tokens for tool result summaries |
| OUTPUT_MAX_TOKENS | 350 | `AI_OUTPUT_MAX_TOKENS` | Reserved tokens for model output |

### Bounds Validation

All environment variables are validated against bounds:

```javascript
HARD_CEILING:      { min: 1000,  max: 16000 }
SYSTEM_PROMPT_CAP: { min: 200,   max: 4000 }
TOOL_SCHEMA_CAP:   { min: 100,   max: 2000 }
MEMORY_CAP:        { min: 50,    max: 1000 }
TOOL_RESULT_CAP:   { min: 100,   max: 2000 }
OUTPUT_MAX_TOKENS: { min: 100,   max: 2000 }
```

## Drop Order (Over Budget)

When the total token count exceeds `HARD_CEILING`, components are trimmed in this order:

1. **Memory** - RAG context is trimmed first (least critical for immediate response)
2. **Tools** - Tool schemas are reduced (keep core + forced tools)
3. **Messages** - Conversation history is trimmed (keep system + last user message)
4. **System Prompt** - Hard-trimmed as last resort

```javascript
DROP_ORDER = ['memory', 'tools', 'messages', 'system']
```

### Core Tools (Never Removed)

These tools are preserved during tool trimming:

- `fetch_tenant_snapshot` - Essential for CRM data access
- `search_leads` - Core search functionality
- `search_contacts` - Core search functionality
- `search_accounts` - Core search functionality
- `create_activity` - Essential for CRM updates
- `suggest_next_actions` - Required for follow-up suggestions

## Memory Gating

Memory retrieval is **expensive** (embedding API calls + database queries). It's gated to only trigger when the user explicitly asks for historical context.

### Memory Configuration

| Setting | Default | Env Var | Description |
|---------|---------|---------|-------------|
| enabled | false | `MEMORY_ENABLED` | Master switch (must be `true`) |
| alwaysOn | false | `AI_MEMORY_ALWAYS_ON` | Bypass pattern matching |
| alwaysOff | false | `AI_MEMORY_ALWAYS_OFF` | Force memory off (overrides all) |
| topK | 3 | `MEMORY_TOP_K` | Number of memory chunks to retrieve |
| maxChunkChars | 300 | `MEMORY_MAX_CHUNK_CHARS` | Max characters per memory chunk |

### Gating Precedence

```
ALWAYS_OFF > MEMORY_ENABLED > ALWAYS_ON > patterns
```

1. If `AI_MEMORY_ALWAYS_OFF=true` → Memory is NEVER used
2. If `MEMORY_ENABLED` is not `true` → Memory is disabled
3. If `AI_MEMORY_ALWAYS_ON=true` → Memory is always used (for testing)
4. Otherwise → Memory is used only if trigger patterns match

### Trigger Patterns

Memory is queried when the user's message matches patterns like:

- "last time", "previously", "earlier", "before"
- "remind me", "what did we", "recap", "summary"
- "what happened", "follow up", "next steps"
- "discussed", "talked about", "mentioned"
- "remember when", "do you remember"

## Reading Budget Logs

The budget manager logs a one-line summary for each AI call:

```
[Budget] total=2847, system=423, tools=612, memory=0, history=1812
[Budget] total=3891, system=423, tools=612, memory=156, history=2700, actions=trimmed_messages_to_5
```

### Log Fields

| Field | Description |
|-------|-------------|
| `total` | Total estimated tokens |
| `system` | System prompt tokens |
| `tools` | Tool schema tokens |
| `memory` | RAG memory tokens |
| `history` | Conversation history tokens |
| `actions` | Budget enforcement actions taken |

### Common Actions

| Action | Meaning |
|--------|---------|
| `trimmed_memory_to_250_tokens` | Memory truncated to cap |
| `dropped_memory` | Memory removed entirely |
| `reduced_tools_to_5` | Tool count reduced |
| `trimmed_messages_to_5` | Conversation history trimmed |
| `hard_trimmed_system_prompt_to_1200` | System prompt truncated |
| `capped_tool_results_at_700_tokens` | Tool results truncated |

## API Usage

### Getting Configuration

```javascript
import { getAiBudgetConfig, getAiMemoryConfig } from './lib/aiBudgetConfig.js';

const budgetConfig = getAiBudgetConfig();
// Returns: { hardCeiling, systemPromptCap, toolSchemaCap, memoryCap, ... }

const memoryConfig = getAiMemoryConfig();
// Returns: { enabled, alwaysOn, alwaysOff, topK, maxChunkChars, ... }
```

### Enforcing Budget

```javascript
import { 
  enforceToolSchemaCap, 
  applyBudgetCaps, 
  logBudgetSummary 
} from './lib/tokenBudget.js';

// 1. Cap tool schemas
const cappedTools = enforceToolSchemaCap(tools, { forcedTool: 'create_lead' });

// 2. Apply full budget enforcement
const result = applyBudgetCaps({
  systemPrompt,
  messages,
  tools: cappedTools,
  memoryText,
  toolResultSummaries: '',
  forcedTool: 'create_lead'
});

// 3. Log summary
logBudgetSummary(result.report, result.actionsTaken);

// 4. Use enforced values
const finalMessages = [
  { role: 'system', content: result.systemPrompt },
  ...result.messages
];
```

### Checking Memory Gating

```javascript
import { shouldUseMemory, shouldInjectConversationSummary } from './lib/aiMemory/index.js';

if (shouldUseMemory(userMessage)) {
  // Query RAG memory
}

if (shouldInjectConversationSummary(userMessage, messageCount)) {
  // Inject rolling summary
}
```

## Environment Variable Reference

Add these to your Doppler configuration for production overrides:

```env
# Token Budget Caps
AI_TOKEN_HARD_CEILING=4000
AI_SYSTEM_PROMPT_CAP=1200
AI_TOOL_SCHEMA_CAP=800
AI_MEMORY_CAP=250
AI_TOOL_RESULT_CAP=700
AI_OUTPUT_MAX_TOKENS=350

# Memory Gating
MEMORY_ENABLED=true
MEMORY_TOP_K=3
MEMORY_MAX_CHUNK_CHARS=300
AI_MEMORY_ALWAYS_ON=false
AI_MEMORY_ALWAYS_OFF=false
```

## Troubleshooting

### Tokens Too High

If you see `total` exceeding 4000:
1. Check if `HARD_CEILING` has been raised via env var
2. Look for `actions=` in logs to see what was trimmed
3. Consider reducing `TOOL_SCHEMA_CAP` if many tools are being sent

### Memory Not Working

1. Verify `MEMORY_ENABLED=true` is set
2. Check that `AI_MEMORY_ALWAYS_OFF` is NOT `true`
3. Confirm user message contains trigger patterns (or set `AI_MEMORY_ALWAYS_ON=true` for testing)

### Forced Tool Removed

If your forced tool is being removed:
1. Ensure you're passing `forcedTool` to both `enforceToolSchemaCap` and `applyBudgetCaps`
2. Check that the tool name matches exactly

## Testing

Run the budget and memory gating tests:

```bash
cd backend
node --test __tests__/ai/tokenBudget.test.js __tests__/ai/memoryGating.test.js
```
