# Developer AI User Guide

_Last updated: December 24, 2025_

Developer AI is a **superadmin-only** codebase assistant designed for system administrators and developers to perform code analysis, file operations, command execution, and system debugging directly within the CRM interface.

---

## 🔐 Access Requirements

**Developer AI is restricted to superadmin users only.**

- ✅ **Superadmin**: Full access to all Developer AI features
- ❌ **Admin**: No access
- ❌ **Manager**: No access
- ❌ **Employee**: No access

To access Developer AI, you must have the `superadmin` role assigned to your user account.

---

## 📍 Accessing Developer AI

1. Navigate to the **secondary navigation menu** (bottom-left)
2. Click the **Bot icon** labeled "Developer AI"
3. Alternatively, navigate directly to: `http://localhost:4000/DeveloperAI` (or your production URL)

The Developer AI page will display:
- **Header**: "Developer AI" with Code icon
- **Chat Interface**: Direct connection to the `/api/ai/developer` endpoint
- **Access Control**: Non-superadmins see an "Access Denied" message

---

## 🛠️ Capabilities

Developer AI provides the following codebase operation tools:

### 1. **File Operations**
- **Read Files**: Read source code, configuration files, logs
- **Write Files**: Create or modify files (requires approval for sensitive paths)
- **Search Code**: Semantic code search across the repository
- **List Files**: Browse directory structures
- **Apply Patches**: Apply unified diffs to codebase (requires approval)

### 2. **Command Execution**
Developer AI can execute shell commands with **automatic safety classification**:

**✅ Auto-Executed (Safe Commands)**:
- Docker diagnostics: `docker ps`, `docker logs --tail 50`, `docker compose ps`
- System status: `systemctl status <service>`, `ps aux`, `df -h`, `free -h`
- Network diagnostics: `curl -I http://localhost:4001/health`, `netstat -tlnp`
- File reads: `ls`, `cat <file>`, `head`, `tail`, `grep`, `find`
- Git operations: `git status`, `git log`, `git diff`, `git branch`

**⚠️ Requires Approval**:
- Unknown commands not on allowlist
- File modification operations
- System configuration changes

**🚫 Blocked (High-Risk)**:
- Destructive: `rm -rf`, `chmod`, `chown`
- Privilege escalation: `sudo`, `su`
- Remote operations: `ssh`, `scp`
- Environment access: `env`, `printenv`, `cat .env`
- Package management: `apt`, `npm install`
- System control: `systemctl start/stop`, `reboot`, `shutdown`

### 3. **Log Analysis**
- Read application logs
- Analyze error patterns
- Debug backend/frontend issues
- Monitor system health

### 4. **System Health Monitoring**
- Check Docker container status
- Monitor memory/CPU usage
- Verify service health endpoints
- Review database connections

---

## 🔒 Security Features

Developer AI implements **Phase 6 Security Controls**:

### Approval Workflow
All **high-risk operations** create a pending approval in the `devai_approvals` table:

1. **Request**: Developer AI proposes a change (e.g., "Apply this patch")
2. **Pending**: Approval stored in database with redacted secrets
3. **Review**: Superadmin reviews via `/api/devai/approvals`
4. **Approve/Reject**: Superadmin approves or rejects
5. **Execute**: If approved, action executes and captures diff/changed files
6. **Audit**: Complete audit trail in `devai_audit` table

### Secret Redaction
All tool arguments and responses are **automatically sanitized**:

- ✅ JWTs redacted: `eyJ... → [REDACTED_JWT]`
- ✅ Bearer tokens: `Bearer sk-... → [REDACTED_BEARER_TOKEN]`
- ✅ API keys: `sk-proj-abc123 → [REDACTED_API_KEY]`
- ✅ Supabase keys: `eyJhb... → [REDACTED_SUPABASE_KEY]`
- ✅ Passwords: `password=secret → password=[REDACTED]`

### Path Traversal Prevention
File operations are **validated for safety**:

- ❌ Blocked: `../../../etc/passwd` (path traversal)
- ❌ Blocked: `.env`, `.env.local`, `.env.production` (secrets)
- ❌ Blocked: `id_rsa`, `*.key`, `*.pem` (keys)
- ❌ Blocked: `secrets/`, `credentials/` (sensitive directories)
- ✅ Allowed: `backend/lib/aiEngine.js`, `src/components/Dashboard.jsx`

### Export Safety
When exporting executed changes:

- ✅ Includes: `manifest.json`, `patch.diff`, changed files
- ❌ Excludes: `node_modules/`, `build/`, `dist/`, `logs/`, `.env`, `*.key`

---

## 💬 Chat Interface

### Example Interactions

**File Reading**:
```
User: "Read the backend server configuration"
Developer AI: [Reads backend/server.js and displays contents]
```

**Code Search**:
```
User: "Find all files that import supabase-db.js"
Developer AI: [Searches codebase and lists matching files]
```

**Safe Command Execution**:
```
User: "Show me the running Docker containers"
Developer AI: [Executes 'docker ps' and shows output]
```

**Approval-Required Command**:
```
User: "Install the latest express package"
Developer AI: "This command requires approval: 'npm install express@latest'. 
               A pending approval has been created (ID: abc-123). 
               Please review and approve via /api/devai/approvals/abc-123/approve"
```

**Log Analysis**:
```
User: "Check the backend logs for errors in the last hour"
Developer AI: [Executes 'docker logs --tail 1000 aishacrm-backend' and analyzes errors]
```

---

## 🔍 Approval Management

### List Pending Approvals
```bash
GET /api/devai/approvals?status=pending
```

Response:
```json
[
  {
    "id": "abc-123",
    "tool_name": "run_command",
    "args_redacted": {"command": "npm install express@latest"},
    "preview": "Install express package",
    "status": "pending",
    "requested_by": "user@example.com",
    "requested_at": "2025-12-24T10:30:00Z"
  }
]
```

### Approve an Action
```bash
POST /api/devai/approvals/abc-123/approve
```

Response:
```json
{
  "id": "abc-123",
  "status": "executed",
  "execution_result": "Successfully installed express@4.18.2",
  "changed_files": ["package.json", "package-lock.json"],
  "diff": "--- package.json\n+++ package.json\n@@ -10,6 +10,7 @@...",
  "executed_at": "2025-12-24T10:35:00Z"
}
```

### Reject an Action
```bash
POST /api/devai/approvals/abc-123/reject
Body: { "reason": "Package version not approved" }
```

### Export Executed Changes
```bash
GET /api/devai/approvals/abc-123/export
```

Downloads a `.tar.gz` archive containing:
- `manifest.json` - Metadata (who, when, what)
- `patch.diff` - Unified diff of changes
- `files/` - After-state of changed files

---

## 🚨 Tenant Context

**IMPORTANT**: Developer AI operates **WITHOUT tenant context**.

- ✅ System-wide operations (codebase, Docker, logs)
- ❌ Cannot access tenant-specific CRM data
- ❌ Cannot create/modify accounts, leads, contacts
- ❌ Cannot execute workflows or make AI calls

For CRM operations, use **AiSHA Assistant** instead (tenant-scoped, all users).

---

## 📊 Audit Trail

All Developer AI actions are logged to `devai_audit`:

```sql
SELECT 
  tool_name,
  requested_by,
  status,
  execution_result,
  created_at
FROM devai_audit
WHERE tool_name = 'run_command'
ORDER BY created_at DESC
LIMIT 10;
```

Audit entries include:
- Tool name (run_command, write_file, apply_patch)
- Redacted arguments
- Execution result
- User who requested
- Approval status
- Timestamps

---

## 🛡️ Best Practices

1. **Review Before Approval**: Always inspect pending approvals before executing
2. **Use Safe Commands First**: Prefer allowlisted commands for diagnostics
3. **Export Important Changes**: Download archives of critical file modifications
4. **Check Audit Logs**: Regularly review `devai_audit` for compliance
5. **Avoid Secrets**: Never pass secrets directly in chat (they're redacted anyway)
6. **Test in Dev First**: Use Developer AI in development before production
7. **Document Changes**: Use meaningful commit messages when applying patches

---

## 🔗 Related Pages

- **AiSHA Assistant Guide**: [AI_ASSISTANT_GUIDE.md](./AI_ASSISTANT_GUIDE.md) - CRM operations
- **Phase 6 Closeout**: [orchestra/phases/phase6/CLOSEOUT.md](../orchestra/phases/phase6/CLOSEOUT.md) - Technical implementation
- **Security Guide**: [SECURITY_GUIDE.md](./SECURITY_GUIDE.md) - Access controls & RLS

---

## 📞 Support

For issues with Developer AI:
1. Check Docker container logs: `docker logs aishacrm-backend -f`
2. Verify superadmin role: Query `users` table for `role = 'superadmin'`
3. Review approval workflow: Check `devai_approvals` and `devai_audit` tables
4. Contact system administrator

---

**Version**: 3.3.0  
**Last Updated**: December 24, 2025  
**Status**: Production Ready
