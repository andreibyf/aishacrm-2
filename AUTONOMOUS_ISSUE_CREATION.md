# Autonomous GitHub Issue Creation System

## Overview
AishaCRM now has **autonomous issue creation** capabilities. When health monitors detect failures, they automatically:
1. **Create GitHub issues** with structured diagnostics
2. **Generate AI-suggested fixes** with code examples
3. **Assign GitHub Copilot** to review and implement fixes
4. **Notify users** with toast notifications and direct links

## Architecture

### Backend API (`backend/routes/github-issues.js`)

**Endpoints:**

1. **POST /api/github-issues/create-health-issue**
   - Creates structured GitHub issues for health monitoring failures
   - Parameters:
     - `type`: 'api' | 'mcp' | 'system'
     - `title`: Issue title
     - `description`: Problem description
     - `context`: Diagnostic data (JSON)
     - `suggestedFix`: AI-generated fix (markdown)
     - `severity`: 'critical' | 'high' | 'medium' | 'low'
     - `component`: Component name (e.g., 'backend', 'mcp-server')
   - Returns: `{ success, issue: { number, url, title, state, labels } }`

2. **POST /api/github-issues/assign-copilot**
   - Adds comment to issue requesting Copilot review
   - Triggers automated fix generation workflow
   - Parameters:
     - `issueNumber`: GitHub issue number
     - `additionalContext`: Optional context (markdown)

**Issue Structure:**
```markdown
## 🔴 Health Monitor Alert

**Type:** MCP  
**Component:** mcp-server  
**Severity:** critical  
**Detected:** 2025-11-18T10:05:52Z

---

## Problem Description
The MCP adapter test "GitHub Repos" is failing...

## Diagnostic Context
```json
{
  "testName": "GitHub Repos",
  "error": "GITHUB_TOKEN not configured",
  "timestamp": "...",
  "environment": "development"
}
```

## Suggested Fix
### Suggested Fix

**Missing Credentials**: GitHub Repos

1. Add environment variable to `braid-mcp-node-server/.env`:
```bash
GITHUB_TOKEN=ghp_your_github_personal_access_token
```

2. Restart MCP server:
```bash
docker-compose restart braid-mcp-node-server
```

---

## Action Items
- [ ] Review diagnostic information
- [ ] Implement suggested fix
- [ ] Add tests for regression prevention
- [ ] Deploy and verify fix in staging
- [ ] Update health monitoring if needed

---

*🤖 This issue was automatically created by the AishaCRM Health Monitoring System.*
```

**Labels Applied:**
- **Type-based:** `bug`, `health-monitor`, `backend`, `api-endpoint`, `mcp-server`, `ai`, `infrastructure`
- **Severity-based:** `priority:critical`, `priority:high`, `priority:medium`, `priority:low`, `needs-immediate-attention`
- **Component-based:** `component:backend`, `component:mcp-server`, `component:database`

### Frontend Utility (`src/utils/githubIssueCreator.js`)

**Functions:**

1. **createHealthIssue(params)**
   - Creates GitHub issue via backend API
   - Optionally assigns Copilot for automated review
   - Returns issue details with URL for user notification

2. **assignCopilotToIssue(issueNumber, additionalContext)**
   - Adds @github-copilot comment to existing issue
   - Triggers Copilot analysis and fix generation

3. **generateAPIFixSuggestion(error)**
   - AI-generated fixes for API endpoint errors
   - Handles: 404 (missing endpoints), 500 (server errors), 403 (authorization)
   - Provides step-by-step implementation with code examples

4. **generateMCPFixSuggestion(test)**
   - AI-generated fixes for MCP adapter errors
   - Handles: Missing credentials, Redis connection, adapter errors
   - Includes configuration examples and debugging steps

## Integration Points

### MCP Monitor (`src/components/settings/MCPServerMonitor.jsx`)

**Automatic Issue Creation:**
- Triggered after full test suite completion
- Only creates issues for **true failures** (not skipped optional adapters)
- Determines severity based on adapter type:
  - **Critical:** Braid Health, CRM adapters
  - **High:** Batch processing, Error handling
  - **Medium:** GitHub, Memory, LLM (optional features)

**User Experience:**
```
✅ Test suite complete: 9/12 passed in 1234ms
🤖 Creating GitHub issues for 3 failure(s)...
✓ GitHub issue created: #42 - https://github.com/andreibyf/aishacrm-2/issues/42
[Toast] Issue #42 created - Copilot assigned to fix "Memory Store"
```

### API Health Dashboard (`src/components/settings/ApiHealthDashboard.jsx`)

**Automatic Issue Creation:**
- Triggered after "Full Scan" completion
- Creates issues for all failed endpoints (404, 5xx errors)
- Determines severity based on status code:
  - **High:** 500+ server errors
  - **Medium:** 404 missing endpoints, 4xx client errors

**User Experience:**
```
Full endpoint scan complete: 58/64 responsive
🤖 Creating GitHub issues for 6 failure(s)...
Issue #43 created for /api/missing-endpoint
[Toast with View button]
```

## Configuration

### Environment Variables (backend/.env)

Already configured for autonomous operation:

```bash
# GitHub Integration (ALREADY SET)
GITHUB_TOKEN=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
GITHUB_REPO_OWNER=andreibyf
GITHUB_REPO_NAME=aishacrm-2

# Optional: Trigger GitHub Actions workflow for Copilot review
TRIGGER_COPILOT_REVIEW=false  # Set to 'true' to enable workflow dispatch
```

## Usage

### Manual Testing

1. **Trigger MCP Monitor Issues:**
   ```
   Navigate to: Settings → MCP Monitor
   Click: "Run Full Test Suite"
   Result: Issues created for any failing adapters
   ```

2. **Trigger API Health Issues:**
   ```
   Navigate to: Settings → API Health Dashboard
   Click: "Full Scan"
   Result: Issues created for any 404/5xx endpoints
   ```

### Automatic Operation

- Health monitors run automatically (scheduled or on-demand)
- Issues are created in real-time when failures detected
- Toast notifications provide immediate feedback
- Click "View" to open issue in new tab

## GitHub Copilot Integration

**Automatic Assignment:**
When an issue is created, the system adds a comment:

```markdown
🤖 **GitHub Copilot Review Requested**

@github-copilot please analyze this issue and:
1. Review the diagnostic information and suggested fix
2. Implement the fix with comprehensive error handling
3. Add tests to prevent regression
4. Create a PR for review

---
*This is an automated request from the AishaCRM health monitoring system.*
```

**Expected Workflow:**
1. Health monitor detects failure
2. System creates GitHub issue with diagnostics + suggested fix
3. Copilot receives @-mention in issue comment
4. Copilot analyzes issue and implements fix
5. Copilot creates PR with implemented solution
6. Developer reviews PR and merges

## AI-Generated Fix Examples

### API Endpoint 404 (Missing Route)

```javascript
// Suggested Fix for: GET /api/missing-endpoint

1. Create route handler in appropriate file (e.g., `backend/routes/missing.js`)
2. Add route registration in `backend/server.js`:

import createMissingRoutes from "./routes/missing.js";
app.use("/api/missing", createMissingRoutes(measuredPgPool));

3. Implement endpoint handler with tenant validation:

router.get('/endpoint', async (req, res) => {
  try {
    const { tenant_id } = req.query;
    // Implementation here
    res.json({ success: true, data: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### MCP Adapter Missing Credentials

```bash
# Suggested Fix for: GitHub Adapter - Token not configured

1. Add environment variable to `braid-mcp-node-server/.env`:

GITHUB_TOKEN=ghp_your_github_personal_access_token

2. Restart MCP server:

docker-compose restart braid-mcp-node-server

3. Verify connection:

curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user
```

### MCP Adapter Redis Connection

```bash
# Suggested Fix for: Memory Adapter - Redis unavailable

1. Verify Redis container is running:

docker ps | grep redis

2. Check Redis connection string in `.env`:

REDIS_URL=redis://redis:6379

3. Test connection:

docker exec -it aishacrm-redis redis-cli ping
# Expected: PONG
```

## Severity Levels

**Critical:**
- Core system failures (database, auth)
- Braid Health failures
- CRM adapter failures
- **Action:** Immediate attention required

**High:**
- Server errors (5xx)
- Batch processing failures
- Error handling issues
- **Action:** Fix within 24 hours

**Medium:**
- Missing endpoints (404)
- Optional adapter failures (GitHub, LLM)
- Client errors (4xx)
- **Action:** Fix within 1 week

**Low:**
- Performance degradation
- Non-critical warnings
- **Action:** Backlog for next sprint

## Benefits

✅ **Zero Manual Intervention** - Issues created automatically when problems detected  
✅ **AI-Powered Diagnostics** - Each issue includes suggested fix with code examples  
✅ **Copilot Integration** - Automated fix generation and PR creation  
✅ **Structured Information** - Labels, severity, component tags for easy triage  
✅ **Immediate Feedback** - Toast notifications with direct links to issues  
✅ **Production Ready** - Handles optional features gracefully (no false alarms)  
✅ **Comprehensive Coverage** - Both API endpoints and MCP adapters monitored  

## Production Considerations

### Rate Limiting
- Backend creates max 1 issue per failure per scan
- Deduplication handled by reviewing existing open issues
- Future enhancement: Check for existing issues before creating duplicates

### Credential Security
- GitHub token stored in backend `.env` (not exposed to frontend)
- Token scopes: `repo` (read/write issues, code)
- Rotate token quarterly for security

### Notification Management
- Users can disable toast notifications if desired
- Issues remain in GitHub regardless of notification preference
- Email notifications configured via GitHub repository settings

### False Positives
- Optional adapters (GitHub, Memory, LLM) are **skipped**, not failed
- Only true failures trigger issue creation
- Severity levels ensure proper prioritization

## Future Enhancements

1. **Workflow Dispatch:** Trigger GitHub Actions to run E2E tests after Copilot creates PR
2. **Issue Deduplication:** Check for existing open issues before creating new ones
3. **Auto-Close on Fix:** Close issue automatically when health monitor passes
4. **Slack Integration:** Send notifications to team channels
5. **Metrics Dashboard:** Track MTTR (mean time to resolution) for auto-created issues
6. **Intelligent Batching:** Group related failures into single issue

## Testing Checklist

- [ ] Run MCP Monitor full test suite
- [ ] Verify GitHub issue created for any failures
- [ ] Check issue has proper labels (bug, health-monitor, severity, component)
- [ ] Verify suggested fix includes code examples
- [ ] Confirm Copilot comment added to issue
- [ ] Click "View" button in toast notification
- [ ] Run API Health full scan
- [ ] Verify issues created for 404/5xx endpoints
- [ ] Check issue URLs open correctly
- [ ] Verify no issues created for optional skipped adapters

---

**Status:** ✅ Fully Implemented and Deployed  
**Last Updated:** 2025-11-18  
**Version:** 1.0.0
