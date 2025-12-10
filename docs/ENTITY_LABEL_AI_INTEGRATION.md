# Entity Label AI Integration Guide

## Overview

This guide explains how to integrate custom entity labels (renamed navigation items) into the AI system so that AI-SHA can recognize and respond to custom terminology like "Clients" instead of "Accounts".

## Problem Statement

**Current State:**
- User renames "Accounts" to "Clients" in navigation
- AI tools still use hardcoded names: `list_accounts`, `create_account`, etc.
- User asks: "Show me all my clients"
- AI doesn't understand "clients" → needs clarification

**Desired State:**
- User renames "Accounts" to "Clients"
- User asks: "Show me all my clients"
- AI automatically maps "clients" → accounts → calls `list_accounts`
- AI responds: "Here are your clients..." (using custom terminology)

## Solution Architecture

### 1. Entity Label Injector Module
**File:** `backend/lib/entityLabelInjector.js`

**Functions:**
- `fetchEntityLabels(pool, tenantId)` - Fetches custom labels from database
- `generateEntityLabelPrompt(labels)` - Creates system prompt section
- `enhanceSystemPromptWithLabels(basePrompt, pool, tenantId)` - Injects custom terminology
- `updateToolSchemasWithLabels(toolSchemas, labels)` - Updates tool descriptions

### 2. Integration Points

#### A. Chat Endpoint (`/api/ai/chat`)
**Location:** `backend/routes/ai.js` line ~477

**Before:**
```javascript
const systemPrompt = `${buildSystemPrompt({ tenantName })}

${BRAID_SYSTEM_PROMPT}${userContext}
...
`;

const tools = await generateToolSchemas();
```

**After:**
```javascript
import { 
  enhanceSystemPromptWithLabels, 
  fetchEntityLabels, 
  updateToolSchemasWithLabels 
} from '../lib/entityLabelInjector.js';

// Build base system prompt
const baseSystemPrompt = `${buildSystemPrompt({ tenantName })}

${BRAID_SYSTEM_PROMPT}${userContext}
...
`;

// Inject entity label awareness
const systemPrompt = await enhanceSystemPromptWithLabels(
  baseSystemPrompt, 
  pgPool, 
  tenantIdentifier
);

// Generate tools and update descriptions with custom labels
const baseTools = await generateToolSchemas();
const labels = await fetchEntityLabels(pgPool, tenantIdentifier);
const tools = updateToolSchemasWithLabels(baseTools, labels);
```

#### B. Agent Conversation Endpoint
**Location:** `backend/routes/ai.js` line ~1695

Same pattern as above:
```javascript
// Base prompt
const baseSystemPrompt = `${buildSystemPrompt({ tenantName })}\n\n${BRAID_SYSTEM_PROMPT}\n\n- ALWAYS call fetch_tenant_snapshot before answering tenant data questions.\n- NEVER hallucinate records; only reference tool data.\n`;

// Inject entity labels
const systemPrompt = await enhanceSystemPromptWithLabels(
  baseSystemPrompt,
  pgPool,
  tenantIdentifier
);

// Update tools
const baseTools = await generateToolSchemas();
const labels = await fetchEntityLabels(pgPool, tenantIdentifier);
const tools = updateToolSchemasWithLabels(baseTools, labels);
```

#### C. Realtime Voice (OpenAI Realtime API)
**Location:** `backend/routes/aiRealtime.js`

For realtime voice, inject labels into session configuration:
```javascript
import { fetchEntityLabels, generateEntityLabelPrompt } from '../lib/entityLabelInjector.js';

// In realtime session setup
const labels = await fetchEntityLabels(pgPool, tenant_id);
const labelPrompt = generateEntityLabelPrompt(labels);

const sessionConfig = {
  instructions: `${BRAID_SYSTEM_PROMPT}${labelPrompt}`,
  tools: tools.map(t => t.function),
  // ... other config
};
```

## Example Output

### Scenario: User renames "Accounts" to "Clients"

**Database:**
```sql
INSERT INTO entity_labels (tenant_id, entity_key, custom_label, custom_label_singular)
VALUES ('a11dfb63-4b18-4eb8-872e-747af2e37c46', 'accounts', 'Clients', 'Client');
```

**Generated System Prompt Injection:**
```
**CUSTOM ENTITY TERMINOLOGY (CRITICAL):**
This tenant has customized their CRM terminology. When the user mentions these terms, map them to the correct entity type:

- "Clients" / "Client" → Accounts (accounts)
  Tools: Use accounts-related tools (e.g., list_accounts, create_account)

**Example Mapping:**
- User says: "Show me all clients" → Call: list_accounts
- User says: "Create a new client" → Call: create_account

**IMPORTANT:** Always use the canonical tool names (list_accounts, create_lead, etc.) even when the user uses custom terminology.
```

**Updated Tool Description:**
```javascript
// Before
{
  name: 'list_accounts',
  description: 'List Accounts in the CRM. IMPORTANT: If more than 5 results...'
}

// After (with custom labels)
{
  name: 'list_accounts',
  description: 'List Clients in the CRM. IMPORTANT: If more than 5 results...'
}
```

## Testing

### 1. Unit Tests
```javascript
import { fetchEntityLabels, generateEntityLabelPrompt } from '../lib/entityLabelInjector.js';

describe('Entity Label Injector', () => {
  it('should fetch custom labels from database', async () => {
    const labels = await fetchEntityLabels(pool, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
    expect(labels.accounts.plural).toBe('Clients');
  });

  it('should generate system prompt section', () => {
    const labels = {
      accounts: { plural: 'Clients', singular: 'Client' },
      leads: { plural: 'Prospects', singular: 'Prospect' },
    };
    const prompt = generateEntityLabelPrompt(labels);
    expect(prompt).toContain('CUSTOM ENTITY TERMINOLOGY');
    expect(prompt).toContain('"Clients"');
    expect(prompt).toContain('list_accounts');
  });
});
```

### 2. Integration Test
```bash
# 1. Set custom label
curl -X POST http://localhost:4001/api/entity-labels \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: a11dfb63-4b18-4eb8-872e-747af2e37c46" \
  -d '{
    "entity_key": "accounts",
    "custom_label": "Clients",
    "custom_label_singular": "Client"
  }'

# 2. Ask AI using custom terminology
curl -X POST http://localhost:4001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show me all my clients",
    "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46"
  }'

# Expected: AI calls list_accounts and responds with "Here are your clients..."
```

## Rollout Plan

### Phase 1: Backend Integration ✅ COMPLETE
- [x] Create `entityLabelInjector.js` module
- [x] Add database query functions
- [x] Add prompt generation functions

### Phase 2: AI Routes Integration (NEXT)
- [ ] Update `backend/routes/ai.js` chat endpoint (line ~477)
- [ ] Update `backend/routes/ai.js` agent endpoint (line ~1695)
- [ ] Update `backend/routes/aiRealtime.js` session setup

### Phase 3: Testing
- [ ] Add unit tests for entityLabelInjector
- [ ] Add integration tests for AI chat with custom labels
- [ ] Test realtime voice with custom terminology

### Phase 4: Performance Optimization
- [ ] Cache entity labels per tenant (Redis)
- [ ] Invalidate cache on label updates
- [ ] Monitor prompt length (ensure not exceeding token limits)

## Performance Considerations

**Database Queries:**
- Each AI request fetches entity labels (2 queries: tenant resolution + label fetch)
- **Solution:** Cache labels in Redis with 5-minute TTL
- **Cache Key:** `entity_labels:${tenant_uuid}`

**Prompt Length:**
- Each custom entity adds ~100 tokens to system prompt
- 6 entities = ~600 tokens
- **Mitigation:** Only inject customized entities (skip defaults)

## Security

**RLS Enforcement:**
- Entity labels table has RLS enabled
- Users can only read labels for their tenant
- No cross-tenant label leakage

**Injection Prevention:**
- Entity labels sanitized before injection into prompts
- No SQL injection risk (parameterized queries)
- No prompt injection risk (labels are structured data, not free text)

## Future Enhancements

1. **Synonym Support:** Allow multiple names for same entity
   - "Clients", "Customers", "Organizations" → all map to accounts

2. **Context-Aware Disambiguation:**
   - If user says "companies", AI asks: "Do you mean Accounts or the company field on Leads?"

3. **Multi-Language Support:**
   - Store labels in multiple languages
   - Switch based on user's language preference

4. **AI Training Data:**
   - Log which custom terms users use most
   - Fine-tune AI to better recognize common variations

## Conclusion

This integration enables AI-SHA to seamlessly adapt to custom entity terminology, providing a more intuitive and personalized user experience. The system maintains security through RLS, ensures performance through caching, and provides extensibility for future enhancements.
