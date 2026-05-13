Pushed `5e5a9c31` addressing both rounds of review.

## Codex P1 — frontend gate was non-functional

> `user?.is_employee` is used as the UI gate here, but the app's canonical user object (from UserContext via normalizeUser) does not currently include an is_employee property, and the active User.me() flow (skipCookieAuth = true) does not add it either.

Correct — fixed in two places so the gate actually fires:

- **`src/utils/normalizeUser.js`** — `is_employee` derived from `raw.is_employee` (preferred, from `/api/auth/me` live lookup) with `!!employee_id` fallback. Now in the canonical shape returned to `UserContext`.
- **`src/api/entityOverrides/user.js` (Supabase path, currently active since `skipCookieAuth = true`)** — explicit `/api/employees?email=` lookup added before the return. Sets `is_employee` and `resolvedEmployeeId` independent of whether `userData` was hydrated from `/api/users` or `/api/employees`. Status-filtered (`!status || status === 'active'`) to mirror the middleware. `employee_id` now prefers `resolvedEmployeeId` over `userData.id` — closes the same class of bug as 4VD-44 where a users.id ended up where an employees.id was expected.
- **`src/api/entityOverrides/user.js` (cookie path)** — passes `is_employee` + `employee_id` through from `/api/auth/me` payload as the authoritative source for when cookie auth is re-enabled.

## My self-review findings (also in this commit)

- **`backend/middleware/requireEmployee.js`**:
  - Bypass for `role === 'superadmin'` / `is_superadmin === true` (mirrors `getVisibilityScope`). Admin role does NOT bypass — admins still act on behalf of their tenant.
  - `status='active'` filter so deactivated employees can't squeak through. Dedicated `employee_inactive` 403 code distinct from `employee_required`.
  - Email local-part redacted in error logs.
- **`backend/__tests__/middleware/requireEmployee.test.js`** — added subsuites for superadmin bypass (3 cases) + employee_inactive (3 cases). 17/17 pass.

## Test results

Pre-commit gates green: lint-staged + Braid 346/346 + CARE 12/12.

## Bonus: restored Vitest baseline (`ea3c19da`)

The initial pre-push run for `5e5a9c31` surfaced 104 failed / 636 passed / 6 skipped. I (incorrectly at first) called them pre-existing infrastructure noise. They were not — the baseline was 0 fails / ~11 skipped, and these had accumulated as agents added new vitest projects without copying the env config.

Two root causes — both in `vitest.config.ts`:

1. `aisha`, `reports`, `integrations` projects were missing `env.NODE_ENV='test'`. Without it React loads the production build → `act()` throws → ~82 failures.
2. No project set `VITE_AISHACRM_BACKEND_URL`. `getBackendUrl()` only falls back to localhost when `import.meta.env.DEV` is true (MODE='test' throws). ~22 failures, mostly suite-level loads.

Fix:
- Hoisted both into `sharedTestEnv` consumed via `sharedConfig.env` so every project (current and future) inherits consistent test env defaults. Dropped the duplicate per-project overrides.
- `SignPage.smoke.test.jsx` needed `// @vitest-environment node` because its `node:fs`/`node:url`/`node:path` imports can't resolve through jsdom's vmForks SSR runner.

After the fix:
| | Before | After |
|---|---|---|
| Total | 746 | 801 |
| Passed | 636 | 795 |
| Failed | 104 | **0** |
| Skipped | 6 | 6 |
| Failed suites | 47 | **0** |

55 extra tests are now collected (suites that previously crashed at load time).

Ready for re-review.
