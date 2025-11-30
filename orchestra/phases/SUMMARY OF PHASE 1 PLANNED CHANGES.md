Perfect! Now I have a complete understanding. Let me summarize the planned implementation:

---

## 📋 

### **BRAIN-001: Documentation** ([AI_BRAIN.md](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html))

**Purpose**: Document the AI Brain architecture, schemas, and integration patterns.

**Content Structure**:

1. **Overview**: AI Brain = OpenAI + Braid MCP + CRM tools (no delete)
2. **Input Schema**: [{ tenant_id, user_id, task_type, context, mode }](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html)
3. **Output Schema**: [{ summary, insights[], proposed_actions[], requires_confirmation }](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html)
4. **Modes**: `read_only`, `propose_actions`, `apply_allowed`
5. **Tool Registry**: List of 27 available Braid tools organized by category
6. **No-Delete Policy**: Explicit enforcement at module boundary
7. **Usage Examples**: Code samples for common tasks

---

### **BRAIN-002: AI Brain Module** (`backend/lib/aiBrain.js`)

**Purpose**: Single entrypoint wrapper around existing Braid MCP + OpenAI integration.

**Implementation Plan**:

- **File**: `backend/lib/aiBrain.js` (JavaScript, matching existing codebase style)
- **Exports**: [runTask({ tenantId, userId, taskType, context, mode })](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html)
- **Internal Logic**:
    1. Validate inputs (tenant isolation, mode constraints)
    2. Resolve tenant record via [resolveCanonicalTenant()](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html)
    3. Filter available tools based on mode (exclude delete tools in all modes)
    4. Build system prompt with task context
    5. Call OpenAI with Braid tool schemas via [createChatCompletion()](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html)
    6. Execute tool calls via [executeBraidTool()](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) (existing function)
    7. Return structured response with [{ summary, insights, proposed_actions, requires_confirmation }](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html)

**Key Features**:

- ✅ **No-Delete Policy**: Filters out `delete_*` tools from registry before execution
- ✅ **Mode Enforcement**: `read_only` blocks all write operations, `propose_actions` returns actions without executing, `apply_allowed` executes writes
- ✅ **Tenant Isolation**: All operations scoped to validated tenant UUID
- ✅ **Error Handling**: Graceful degradation with detailed error responses

**Dependencies**:

- Uses existing [braidIntegration-v2.js](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) (no modifications needed)
- Uses existing `aiProvider.js` for OpenAI calls
- Uses existing `tenantCanonicalResolver.js` for tenant validation

---

### **BRAIN-003: Internal Test Endpoint** ([ai.js](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) modification)

**Purpose**: Add internal-only endpoint for testing AI Brain without UI changes.

**Implementation Plan**:

- **Route**: [POST /api/ai/brain-test](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) (added to existing [ai.js](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html))
- **Access Control**: Internal-only (no admin check yet, can be added later)
- **Request Body**:
    
```
{
  "tenant_id": "uuid-string",
  "user_id": "uuid-string-optional",
  "task_type": "summarize_leads | follow_up_suggestions | ...",
  "context": { "entity_id": "...", "filters": {...} },
  "mode": "read_only | propose_actions | apply_allowed"
}
```
        
- **Response**: Direct passthrough of `aiBrain.runTask()` output
- **Error Handling**: Standard 400/401/500 responses with error details

---

## 🧪 TESTING PLAN

### **Manual Testing** (Primary - as specified in PLAN.md)

**Test Case 1: Read-Only Mode - Summarize Leads**
```
curl -X POST http://localhost:4001/api/ai/brain-test \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
    "task_type": "summarize_leads",
    "context": { "status": "open" },
    "mode": "read_only"
  }'
```

**Expected**: Returns summary with insights, no proposed actions with writes, respects tenant boundary.

**Test Case 2: Propose Actions Mode - Follow-up Suggestions**
```
curl -X POST http://localhost:4001/api/ai/brain-test \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",
    "task_type": "suggest_followups",
    "context": { "account_id": "existing-account-uuid" },
    "mode": "propose_actions"
  }'
```

**Expected**: Returns proposed actions (e.g., create activity, send email) but does NOT execute them. Includes `requires_confirmation: true`.

**Test Case 3: No-Delete Policy Enforcement**
```
# Verify delete_account, delete_lead, etc. are NEVER exposed
# Check filtered tool list in debug logs
```

**Expected**: Tool schemas passed to OpenAI exclude all `delete_*` tools, regardless of mode.

**Test Case 4: Tenant Isolation**
```
# Try to access data from tenant A using tenant B's ID
curl -X POST http://localhost:4001/api/ai/brain-test \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "wrong-tenant-uuid",
    "task_type": "summarize_accounts",
    "mode": "read_only"
  }'
```

**Expected**: Returns 401/403 or empty results (tenant isolation via RLS).

---

### **Automated Testing** (Optional - Future Enhancement)

Would create `backend/test/aiBrain.test.js` with:

- Unit tests for input validation
- Mock tests for tool filtering logic
- Integration tests for mode enforcement
- Tenant isolation verification

**Note**: Not implementing automated tests in this phase per [CONVENTIONS.md](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) (bugfix-first, minimal scope). Manual testing via curl is sufficient for validation.

---

## 📁 FILES TO CREATE/MODIFY

### **New Files** (3):

1. ✅ [AI_BRAIN.md](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) - Documentation
2. ✅ `backend/lib/aiBrain.js` - Brain module wrapper
3. ❌ No new route file (modifying existing [ai.js](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html))

### **Modified Files** (1):

1. ✅ [ai.js](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) - Add [/api/ai/brain-test](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) endpoint (~50 lines)

### **Not Modified**:

- ❌ [braidIntegration-v2.js](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) - Already complete, reused as-is
- ❌ Any UI files ([src](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html))
- ❌ [server.js](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) - Routes already mounted

---

## 🎯 ACCEPTANCE CRITERIA

**BRAIN-001** ✅:

- [ ]  [AI_BRAIN.md](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) exists with complete schemas
- [ ]  Input/output contracts documented
- [ ]  No-delete policy explicitly stated
- [ ]  Usage examples included

**BRAIN-002** ✅:

- [ ]  `backend/lib/aiBrain.js` exports `runTask()` function
- [ ]  All MCP calls route through this module
- [ ]  Delete tools filtered out at module boundary
- [ ]  Returns structured output matching schema

**BRAIN-003** ✅:

- [ ]  [POST /api/ai/brain-test](vscode-file://vscode-app/c:/Users/andre/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html) endpoint accessible
- [ ]  Accepts all required parameters
- [ ]  Returns Brain output as JSON
- [ ]  Respects tenant isolation

**Overall** ✅:

- [ ]  No UI changes
- [ ]  No autonomous writes (only with `apply_allowed` mode)
- [ ]  All existing functionality preserved
- [ ]  Manual tests pass for 4 scenarios above

---

## ⚠️ CONSTRAINTS RESPECTED

✅ **Orchestra Rules**:

- Minimal, surgical changes only
- No refactoring of unrelated code
- Bugfix-first mentality (this is feature, but internal-only)

✅ **Security**:

- Tenant isolation enforced via existing resolver
- No-delete policy hardcoded
- Mode-based access control

✅ **Architecture**:

- Uses existing Braid integration (no duplication)
- Follows existing patterns (aiBrain.js mirrors aiProvider.js style)
- Backend-only (no frontend impact)