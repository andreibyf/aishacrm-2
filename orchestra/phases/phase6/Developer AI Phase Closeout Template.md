

### Phase Summary

**Phase name:** Developer AI Safety + Approvals + Export Bundles  
**Goal:** Superadmin-only Developer AI can propose and execute changes safely via approvals, with audit logging and exportable change bundles.

---

## Preconditions

- [x] Backend is running locally and/or on VPS
    
- [x] Supabase migrations applied
    
- [x] You can authenticate as a superadmin user in the app
    

---

## Verification Checklist

### 1) Database / RLS

- [x]  Migration applied successfully (no errors).
    
- [x]  Tables exist:
    
    - [x]  `public.devai_approvals`
        
    - [x]  `public.devai_audit`
        
- [x]  RLS enabled on both tables.
    
- [x]  No policies exist on both tables (deny direct client access).
    
- [ ]  `updated_at` trigger updates correctly on `devai_approvals` updates.
    

### 2) API Routes (Superadmin-only)

- [ ]  `GET /api/devai/approvals?status=pending` returns list for superadmin.
    
- [ ]  Non-superadmin receives 401/403 for all `/api/devai/*` routes.
    
- [ ]  `POST /api/devai/approvals/:id/reject` updates status and stores reason.
    
- [ ]  `POST /api/devai/approvals/:id/approve`:
    
    - [ ]  sets `approved_by`, `approved_at`
        
    - [ ]  executes action server-side
        
    - [ ]  sets `executed_at`
        
    - [ ]  sets status to `executed` or `failed` with `error`
        

### 3) Developer AI Tool Behavior (Approval gating)

- [ ]  Mutating operations do **not** execute immediately:
    
    - [ ]  file changes (`apply_patch`, `write_file`, `create_file`) create `pending` approvals
        
    - [ ]  risky commands create `pending` approvals
        
- [ ]  Read-only tools auto-execute (optional) and are audited.
    
- [ ]  Developer AI outputs an approval reference (approval id) for pending actions.
    

### 4) Command Safety

- [ ]  Allowlisted read-only commands auto-execute:
    
    - [ ]  `docker ps`
        
    - [ ]  `docker logs --tail 50 <svc>`
        
    - [ ]  `docker compose ps`
        
    - [ ]  `systemctl status <svc>`
        
    - [ ]  `journalctl -u <svc> --since "1 hour ago"`
        
    - [ ]  `curl -I http://localhost:<port>/health`
        
- [ ]  Blocklisted commands are denied or forced into high-risk approval (your chosen behavior is consistent):
    
    - [ ]  `rm -rf ...`
        
    - [ ]  `chmod/chown ...`
        
    - [ ]  `sudo ...`
        
    - [ ]  `ssh/scp ...`
        
    - [ ]  `cat .env`
        
    - [ ]  `printenv` / `env`
        
    - [ ]  remote `curl/wget` (non-localhost)
        

### 5) Redaction + Audit

- [ ]  Tool args stored in `devai_approvals.tool_args` are redacted (no keys/tokens).
    
- [ ]  Command outputs stored/logged are redacted.
    
- [ ]  `devai_audit` has entries for:
    
    - [ ]  approval_created
        
    - [ ]  approved / rejected
        
    - [ ]  executed / failed
        
    - [ ]  exported (when export is downloaded)
        

### 6) File Changes: Diff + Snapshots

- [ ]  Approved patch execution records:
    
    - [ ]  `changed_files` populated
        
    - [ ]  `diff` populated (unified diff)
        
    - [ ]  `before_snapshot` populated (changed files only)
        
    - [ ]  `after_snapshot` populated (changed files only)
        
- [ ]  Secret paths are excluded from snapshots (or skipped with a note).
    

### 7) Export Bundle

- [ ]  `GET /api/devai/approvals/:id/export` works for executed approvals.
    
- [ ]  Exported archive contains:
    
    - [ ]  `manifest.json`
        
    - [ ]  `patch.diff`
        
    - [ ]  `files/<changed paths>` (after)
        
    - [ ]  `files_before/<changed paths>` (if enabled)
        
- [ ]  Export sanitizes file paths (no `../` traversal).
    
- [ ]  Export omits `.env`, key files, `secrets/`, etc., and notes omissions in `manifest.json`.
    

### 8) Tests

- [ ]  Tests pass locally/CI.
    
- [ ]  At minimum, tests cover:
    
    - [ ]  allowlist auto-exec path
        
    - [ ]  risky/blocklisted command requires approval or is denied
        
    - [ ]  export returns archive with manifest + patch
        

---

## Smoke Test Script (manual)

Use these to validate end-to-end quickly:

1. **Create pending approval via Developer AI**
    

- Ask DevAI to “change a harmless comment in a file” (should produce a pending approval with a diff preview).
    
- Confirm approval row created.
    

2. **Approve and execute**
    

- Call approve endpoint.
    
- Confirm status executed and artifacts recorded.
    

3. **Export**
    

- Download export bundle.
    
- Verify contents include diff and modified file.
    

4. **Safety**
    

- Ask DevAI to run `cat .env`.
    
- Confirm it is blocked or forced into high-risk approval and does not execute.
    

---

## Rollback Plan

If something goes wrong:

### Code rollback

-  Revert commits touching:
    
    - `backend/lib/developerAI.js`
        
    - `backend/routes/devai.js`
        
    - any helper files (redaction/audit)
        
-  Restart backend service
    

### DB rollback

If you need to remove the tables (not usually necessary):

-  Create a new migration that drops:
    
    - `public.devai_audit`
        
    - `public.devai_approvals`
        
-  Re-apply migrations
    

---

## Post-Phase Notes

Record:

-  What allowlist/blocklist rules were chosen
    
-  Which services/containers are supported by sysadmin tools
    
-  Any files excluded from export by default
    
-  Any known limitations (e.g., export only after execution)
    

---

## Phase Closeout Statement (paste into your tracker)

“Developer AI phase complete: approvals gating implemented, command safety enforced, audit logging enabled, and executed changes can be exported as an archive containing manifest + diff + modified files. All endpoints are superadmin-only and tables are app-wide with RLS deny-all for direct client access. Tests and smoke checks passed.”