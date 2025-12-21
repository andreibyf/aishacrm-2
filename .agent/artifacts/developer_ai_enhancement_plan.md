# Developer AI Enhancement Plan

## Objective
Enhance the in-app Developer AI with file write and command execution capabilities, with an approval workflow for safety.

## Current State (developerAI.js)
- ✅ read_file - Reads file contents
- ✅ list_directory - Browse codebase structure
- ✅ search_code - Grep pattern matching
- ✅ read_logs - Docker container logs
- ✅ get_file_outline - Function/class extraction
- ✅ propose_change - Proposes but doesn't write

## New Tools to Add

### 1. `write_file` (with approval)
- Writes content to an existing file
- Requires user approval before execution
- Security: ALLOWED_PATHS + FORBIDDEN_PATTERNS enforced

### 2. `create_file` (with approval)
- Creates a new file with content
- Requires user approval before execution
- Fails if file already exists

### 3. `delete_file` (with approval)
- Deletes a file
- Requires explicit user approval
- Blocked for critical files (.env, server.js, etc.)

### 4. `run_command` (with approval)
- Executes shell commands in the container
- Whitelist of safe commands auto-approved
- All others require explicit approval
- Timeout: 30 seconds

## Approval Workflow

### Flow:
1. Developer AI calls a write/execute tool
2. Backend generates a "pending action" with UUID
3. Response includes approval prompt with details
4. User clicks "Approve" or "Reject" in UI
5. Approved actions are executed and result returned

### Backend Storage:
```javascript
// In-memory pending actions (could move to Redis for persistence)
const pendingActions = new Map();
// { actionId: { type, params, createdAt, status } }
```

### Frontend UI:
- Special message type: "approval_required"
- Shows file path, change preview, buttons
- Approve sends POST to /api/ai/developer/approve/{actionId}
- Reject dismisses the request

## Security Boundaries

### Always Blocked:
- Writing to .env, secrets, credentials
- Deleting server.js, package.json, migrations
- Commands: rm -rf, format, dd, shutdown

### Auto-Approved Commands (whitelist):
- npm run lint
- npm test (specific files)
- docker logs
- cat, head, tail, grep

### Requires Approval:
- Any file write/create/delete
- npm install
- docker compose commands
- git operations

## Implementation Steps

### Phase 1: Write Tools (2-3 hours)
1. Add write_file tool definition
2. Add create_file tool definition
3. Implement tool handlers with approval gate

### Phase 2: Command Execution (2-3 hours)
1. Add run_command tool definition
2. Implement with whitelist + approval logic
3. Add timeout handling

### Phase 3: Approval UI (2-3 hours)
1. Create approval message component
2. Add approve/reject API endpoints
3. Wire up frontend buttons

### Phase 4: Testing
1. Test file write with approval
2. Test command execution
3. Test security boundaries

## Files to Modify
- `backend/lib/developerAI.js` - Add new tools
- `backend/routes/ai.js` - Add approval endpoints
- `src/components/ai/ApprovalCard.jsx` - New UI component
- `src/components/ai/AiSidebar.jsx` - Render approval cards

## Timeline
- Total estimate: 1-2 days
- Priority: Phase 1 + 2 first, then Phase 3

---
Created: 2025-12-20
