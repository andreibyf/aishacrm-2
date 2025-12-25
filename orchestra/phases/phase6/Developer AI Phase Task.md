## Approvals, Safety Rails, Export Bundles

### Objective

Implement a **Superadmin-only Developer AI** workflow that:

- prevents unapproved destructive actions,
    
- logs/audits all actions,
    
- supports exporting modified files (bundle) for review/backup,
    
- is **app-wide** (not tenant-scoped).
    

### Scope

Applies to the Developer AI / Sysadmin assistant used by superadmins. No tenant logic required. No GPU. No heavy infra.

---

## Deliverables

1. **DB migration**: `devai_approvals` + `devai_audit` tables (RLS enabled, no policies).
    
2. **API routes**: `/api/devai/*` approvals + export endpoints (superadmin-only).
    
3. **Developer AI tool gating**:
    
    - mutating tools create approvals, do not execute
        
    - read-only tools can auto-execute
        
4. **Export bundle**:
    
    - archive containing manifest + diff + changed files
        
5. **Safety rails**:
    
    - command allowlist/blocklist
        
    - redaction of secrets
        
    - path traversal prevention
        
    - export exclusions for sensitive files
        
6. **Tests**: minimal coverage for allowlist/approval and export bundle.
    

---

## Task Breakdown

### Task 1 — Database (App-wide approvals + audit)

**Files**

- `backend/supabase/migrations/*_devai_approvals_audit.sql`
    

**Requirements**

- Create `public.devai_approvals` with:
    
    - `status` enum-like check: `pending|approved|rejected|executed|failed`
        
    - fields to store: `tool_name`, `tool_args` (redacted), `preview`, `changed_files`, `diff`, `before_snapshot`, `after_snapshot`, timestamps, `requested_by`, `approved_by`, `error`, `note`, `rejected_reason`
        
- Create `public.devai_audit` with:
    
    - `actor`, `action`, `approval_id`, `details` (redacted), `created_at`
        
- Enable RLS on both tables and ensure **no policies exist** (deny all direct client access).
    
- Add `updated_at` trigger for `devai_approvals`.
    

**Acceptance**

- Migration applies cleanly.
    
- Tables exist.
    
- RLS is enabled and no policies remain on these tables.
    

---

### Task 2 — Superadmin-only API routes (approvals + export)

**Files**

- `backend/routes/devai.js` (new)
    
- mount in backend entry (`backend/index.js` or existing router file)
    

**Endpoints**

- `GET /api/devai/approvals?status=pending|approved|rejected|executed|failed`
    
- `POST /api/devai/approvals/:id/approve`
    
    - marks approved, executes server-side, records artifacts, marks executed/failed
        
- `POST /api/devai/approvals/:id/reject`
    
    - records reason, sets rejected
        
- `GET /api/devai/approvals/:id/export`
    
    - returns archive with:
        
        - `manifest.json`
            
        - `patch.diff`
            
        - `files/...` (after)
            
        - optional `files_before/...` (before)
            

**Requirements**

- Use existing superadmin middleware; if none exists, implement in the same style as other admin routes.
    
- Backend accesses tables using **service role** (server-side).
    
- Redact data before storing/returning.
    
- Export must sanitize file paths and omit sensitive paths.
    

**Acceptance**

- All routes require superadmin auth.
    
- Approve executes action and persists diff/snapshots.
    
- Export returns a valid archive containing expected files.
    

---

### Task 3 — Developer AI tool gating + safer file changes

**Files**

- `backend/lib/developerAI.js`
    

**Changes**

- Mutating tools must create approvals instead of executing:
    
    - `write_file`, `create_file`, `run_command` (unless allowlisted read-only), and any file-modifying actions
        
- Add/standardize:
    
    - `apply_patch` tool (unified diff) → approval required → executed by approve route
        
    - “diff preview” generation in `preview` field
        

**Rules**

- Prefer: `propose_change` → (diff) → `apply_patch`
    
- Restrict `write_file`:
    
    - approval always, or new-files-only (preferred)
        
- Block reading sensitive files via tools (e.g., `.env`, keys).
    

**Acceptance**

- No direct execution of mutating tools without an approval record.
    
- Patch-based edits are supported and captured as diffs.
    

---

### Task 4 — Command safety (allowlist + blocklist)

**Files**

- `backend/lib/developerAI.js` (or helper module)
    

**Implement**

- `classifyCommand(cmd)` returning `{ risk, allowAuto, reason }`
    
- Allowlist: safe read-only commands (examples)
    
    - `docker ps`, `docker logs --tail N`, `docker compose ps`
        
    - `systemctl status <svc>`, `journalctl -u <svc> --since ...`
        
    - `curl -I http://localhost:<port>/health`
        
    - `ls`, `cat` only for safe paths (no `.env`, no secrets)
        
- Blocklist (deny or always require approval):
    
    - `rm`, `chmod`, `chown`, `sudo`, `ssh`, `scp`, `iptables`, `ufw`
        
    - `printenv`, `env`, `cat .env`, key files, secrets directories
        
    - remote `curl/wget` (non-localhost)
        

**Acceptance**

- Allowlisted commands run without approval (optional: still audit).
    
- Non-allowlisted commands create approvals.
    
- Blocklisted commands are rejected (or forced into approval with “high risk” + explicit message).
    

---

### Task 5 — Redaction + audit logging

**Files**

- `backend/lib/devaiAudit.js` (new) or similar
    
- `backend/lib/developerAI.js` (integration)
    

**Implement**

- `redactSecrets(text)` masks:
    
    - JWT-like strings
        
    - API keys (OpenAI/Anthropic/etc patterns)
        
    - Bearer tokens
        
    - common secret env names
        
- Audit records for:
    
    - approval created/approved/rejected/executed/exported
        
    - command execution results (redacted)
        

**Acceptance**

- Stored args/outputs do not leak secrets.
    
- Audit trail exists for every action.
    

---

### Task 6 — Export bundle (no new deps)

**Files**

- route handler in `backend/routes/devai.js`
    

**Approach**

- Create temp dir
    
- Write manifest/diff/files
    
- Create archive using system `tar` (tar.gz)
    
- Stream it, cleanup
    
- Path sanitization and sensitive file omission required
    

**Acceptance**

- Export works on VPS with standard tar installed.
    
- Archive content matches approval artifacts.
    

---

### Task 7 — Tests

**Files**

- `backend/__tests__/...` (new or extend existing)
    

**Minimum tests**

- Dangerous command is blocked or requires approval
    
- Allowlisted command auto-executes
    
- Export returns archive containing `manifest.json` and `patch.diff` (and at least one file when snapshots exist)
    

**Acceptance**

- Tests pass in CI/local.
    

---

## Definition of Done

- Developer AI can propose changes safely.
    
- Any mutation is approval-gated and auditable.
    
- Sysadmin can export exactly what changed (diff + files) for review/backup.
    
- No tenant coupling.
    

---

## Notes / Guardrails for Copilot

- Do not add new npm dependencies unless already present.
    
- Prefer patch-based modifications over whole-file replacement.
    
- Never store/export `.env`, keys, secrets, or tokens.
    
- Keep changes localized: `developerAI.js`, new route file, migration, and small helpers.