# Phase 6: Developer AI Safety & Approvals - Quick Start Guide

## 🎯 What Was Built

A **complete approval workflow system** for Developer AI that:
- ✅ Prevents unapproved code changes
- ✅ Logs every action for auditing
- ✅ Allows exporting changes as downloadable archives
- ✅ Classifies commands into safe/risky/blocked categories

## 🚀 Quick Start

### 1. Apply the Database Migration

```bash
# Navigate to backend
cd backend

# Apply migration with Doppler
doppler run -- node apply-supabase-migrations.js

# Or run manually in Supabase dashboard:
# supabase/migrations/20241224000000_devai_approvals_audit.sql
```

### 2. Verify Tests Pass

```bash
node --test __tests__/phase6/devai-safety.test.js
```

Expected output: **33 tests pass, 3 skipped**

### 3. Restart Backend

```bash
cd ..
docker compose up -d --build backend
```

### 4. Test the API (as Superadmin)

```bash
# Get your superadmin token from the app or via:
# 1. Login to the app
# 2. Open DevTools → Application → Cookies → aisha_access

# List approvals
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4001/api/devai/approvals

# Should return: {"approvals":[]}
```

## 🔧 How It Works

### Command Auto-Classification

When Developer AI tries to run a command, it's automatically classified:

**✅ SAFE (Auto-Execute)**
```bash
docker ps
docker logs --tail 50 backend
systemctl status nginx
curl -I http://localhost:4001/health
git status
cat package.json
```

**⚠️ REQUIRES APPROVAL**
```bash
chmod 755 script.sh
npm install lodash
some-custom-command
```

**🚫 BLOCKED**
```bash
rm -rf /app
sudo apt-get install vim
ssh user@host
cat .env
printenv
```

### File Operations

**Read Operations**: Auto-allowed (except .env, secrets, keys)  
**Write Operations**: Require approval  
**Delete Operations**: Blocked by default

### Approval Workflow

1. **Developer AI proposes change** → Creates pending approval in DB
2. **Superadmin reviews** → GET /api/devai/approvals?status=pending
3. **Approve or Reject** → POST /api/devai/approvals/:id/approve
4. **System executes** → Captures diff, changed files, snapshots
5. **Export bundle** → GET /api/devai/approvals/:id/export

## 📊 API Endpoints

All endpoints require **superadmin** authentication.

### List Approvals
```bash
GET /api/devai/approvals?status=pending
```

**Query Params:**
- `status` - Filter by status: `pending|approved|rejected|executed|failed`

**Response:**
```json
{
  "approvals": [
    {
      "id": "uuid",
      "status": "pending",
      "tool_name": "apply_patch",
      "requested_by": "user-uuid",
      "created_at": "2025-12-24T12:00:00Z",
      "preview": { "description": "...", "changed_files": [...] }
    }
  ]
}
```

### Get Single Approval
```bash
GET /api/devai/approvals/:id
```

### Approve (and Execute)
```bash
POST /api/devai/approvals/:id/approve
Content-Type: application/json

{
  "note": "Looks good, approved"
}
```

**What happens:**
1. Marks as approved
2. **Executes the action** (applies patch, writes file, runs command)
3. Captures changed files, diff, snapshots
4. Marks as executed or failed
5. Logs audit event

### Reject
```bash
POST /api/devai/approvals/:id/reject
Content-Type: application/json

{
  "reason": "Changes too broad, needs refinement"
}
```

### Export Bundle
```bash
GET /api/devai/approvals/:id/export
```

**Returns:** tar.gz archive containing:
- `manifest.json` - Metadata (who, when, what)
- `patch.diff` - Unified diff (if applicable)
- `files/` - Changed files (after state)

**Excluded from exports:**
- `.env` files
- `*.key`, `*.pem`, `id_rsa`
- `secrets/` directories
- `node_modules/`
- `build/`, `dist/`
- `*.log` files

## 🔒 Security Features

### 1. Secret Redaction
All sensitive data is automatically redacted before storage:
- JWT tokens → `[REDACTED_JWT]`
- Bearer tokens → `Bearer [REDACTED_TOKEN]`
- API keys → `[REDACTED_API_KEY]`
- Environment variables → `KEY=[REDACTED]`

### 2. Path Validation
File operations check for:
- Path traversal (`../`, `..\\`)
- Forbidden patterns (`.env`, `.key`, `.pem`, `secrets/`)
- Must be within `/app` directory

### 3. RLS Enforcement
- Tables have RLS enabled
- **NO policies** = deny all direct client access
- Must use service role via backend API

### 4. Audit Trail
Every action logged in `devai_audit`:
- `approval_created`
- `approved`
- `rejected`
- `executed`
- `failed`
- `exported`

## 🧪 Testing

### Run All Tests
```bash
cd backend
node --test __tests__/phase6/devai-safety.test.js
```

### Test Command Classification
```javascript
import { classifyCommand } from './lib/commandSafety.js';

const result = classifyCommand('docker ps');
console.log(result);
// { level: 'allowed', autoExecute: true, reason: '...' }
```

### Test Secret Redaction
```javascript
import { redactSecrets } from './lib/devaiSecurity.js';

const text = 'Token: eyJhbGc...';
console.log(redactSecrets(text));
// Token: [REDACTED_JWT]
```

## 📁 File Structure

```
backend/
├── supabase/migrations/
│   └── 20241224000000_devai_approvals_audit.sql  # DB schema
├── lib/
│   ├── devaiSecurity.js        # Secret redaction, path validation
│   ├── commandSafety.js        # Command classification
│   └── developerAI.js          # Updated with approval integration
├── routes/
│   └── devai.js                # Approval API endpoints
└── __tests__/phase6/
    └── devai-safety.test.js    # 33 passing tests
```

## 🎓 Usage Examples

### Example 1: Developer AI Proposes Patch
```javascript
// Developer AI calls apply_patch tool
{
  "tool": "apply_patch",
  "args": {
    "patch": "--- a/file.js\n+++ b/file.js\n@@ -1,3 +1,3 @@\n-old\n+new",
    "description": "Fix typo in error message"
  }
}
```

**Result:** Creates pending approval, returns approval ID

### Example 2: Superadmin Approves
```bash
# Review
GET /api/devai/approvals?status=pending

# Approve
POST /api/devai/approvals/abc-123/approve
{"note": "LGTM"}
```

**Result:** Patch applied, files changed, diff captured, status = executed

### Example 3: Export Changes
```bash
GET /api/devai/approvals/abc-123/export
```

**Result:** Downloads `devai-approval-abc-123.tar.gz` containing manifest, diff, and files

## 🔍 Troubleshooting

### "Access denied - superadmin role required"
→ Ensure you're authenticated as a superadmin user (role = 'superadmin')

### "Approval not found"
→ Check the approval ID is correct via `GET /api/devai/approvals`

### "Failed to create approval record"
→ Verify database migration was applied: check for `devai_approvals` table

### Tests fail with import errors
→ Ensure you're running from `backend/` directory

### Export downloads empty archive
→ Approval must have status = 'executed' to export

## 📚 Related Documentation

- **Implementation Summary**: `IMPLEMENTATION_SUMMARY.md`
- **Closeout Document**: `CLOSEOUT.md`
- **Test Coverage**: Run tests for live documentation
- **API Source**: `backend/routes/devai.js`
- **Security Utils**: `backend/lib/devaiSecurity.js`, `backend/lib/commandSafety.js`

---

**Ready to Use!** 🚀

Phase 6 is complete and ready for production. All Developer AI mutations now require approval, with complete audit trail and export capability.
