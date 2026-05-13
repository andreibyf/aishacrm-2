Closes [4VD-54](https://linear.app/4vdataconsulting/issue/4VD-54). First doc from [4VD-55](https://linear.app/4vdataconsulting/issue/4VD-55) (`IDENTITY_MODEL.md`).

## Why

Non-employee tenant users (clients, customer-portal logins, external collaborators) could send documents for signature on behalf of the tenant. Today the implicit contract — `activities.assigned_to` FKs to `employees.id` — fails silently: the row gets created with `assigned_to = NULL` instead of a clear 403. This PR makes the contract explicit.

Surfaced during the 2026-05-12 staging signing test where a manager couldn't see assigned activities until adding himself as an employee. See cancelled [4VD-53](https://linear.app/4vdataconsulting/issue/4VD-53) for the investigation that led here.

## Changes

### Backend gate
- `backend/middleware/requireEmployee.js` (new) — verifies a matching `employees` row on `req.tenant.id`, stashes `req.user.employee_id`, 403 with `code: 'employee_required'` on miss. DI seam via `createRequireEmployee({ getSupabaseAdmin })`.
- `backend/routes/submissions.js` — applies the middleware to `POST /api/submissions`. Adds `deps.requireEmployee` to the factory for test injection.
- `backend/routes/auth.js` — `GET /api/auth/me` now lookups + returns `is_employee` (boolean) and `employee_id` (UUID|null). Live lookup (not baked into JWT) so admin-added employees see the flip on next /me call without waiting on token refresh.

### Frontend gate
- `LeadDetailPanel`, `ContactDetailPanel`, `AccountDetailPanel` — Send Document customAction pushed only when `user?.is_employee`.
- `OpportunityDetailPanel` — inline `<Button>` wrapped in `{user?.is_employee && (...)}`; pulls `user` via the `useUser` hook (panel didn't take user as a prop previously).

Defense in depth: if a non-employee bypasses the UI gate and hits the API directly, they still get 403 from the middleware.

### Tests
- `backend/__tests__/middleware/requireEmployee.test.js` (new) — 11 cases: happy path with multiple tenant resolution paths, `ilike` email matching, 403/401/400/500 branches, local-dev bypass.
- `backend/__tests__/routes/submissions.test.js` — existing role-gate tests now inject a passthrough `requireEmployee` so they test roles, not the gate. New "Employee gate" block: 2 cases (403 when middleware rejects, non-403 when allowed).

### Documentation
`docs/architecture/IDENTITY_MODEL.md` (new) — companion to the existing `TEAM_VISIBILITY_SYSTEM.md`. States the six rules of the identity contract in one place:

1. `users` and `employees` are NOT the same row.
2. `users.id ≠ employees.id` ever — always resolve.
3. `team_members` joins by `user_id`.
4. Multiple employees per person is possible (and bit us on staging).
5. Non-admin visibility requires team membership — by design.
6. Acting on behalf of the tenant requires an `employees` row — what this PR enforces.

Plus a "gotchas" table mapping recent regressions back to which rule should have caught them. Acts as the worked example for 4VD-55's broader doc rollout.

## Out of scope

- Other docs in 4VD-55 (auth-flow, visibility-model, deploy-topology, eSign-engine, parallel-agents) — separate effort.
- Auto-creating an `employees` row on signup — would defeat the restriction.
- Same gate on lead/contact/account/opportunity create paths — separate audit (4VD-54 is eSign-specific).
- AiSHA/Braid path for signing — if/when it exists, route-level middleware enforces the gate by default.

## Test results

Pre-commit hooks passed: lint-staged + Braid 346/346 + CARE 82/82. New tests cover the gate's happy + sad paths.

## Branch links

- Gitea: https://gitea.aishacrm.com/aishacrm/aishacrm-2/compare/main...abyfield/4vd-54-restrict-esign-to-employees
- GitHub: https://github.com/andreibyf/aishacrm-2/pull/new/abyfield/4vd-54-restrict-esign-to-employees

Co-Authored-By: Claude Sonnet 4.6 &lt;noreply@anthropic.com&gt;
