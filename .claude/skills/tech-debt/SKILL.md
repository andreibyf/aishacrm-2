---
name: tech-debt
description: Identify, categorize, and prioritize technical debt in AiSHA CRM. Trigger with "tech debt", "what should we refactor", "code health", or maintenance backlog questions. Seeded with the current known debt register.
---

# Tech Debt Management (AiSHA CRM)

> Stack, connectors, and non-negotiable rules: see [AISHA_CONTEXT.md](../AISHA_CONTEXT.md).

Identify, categorize, and prioritize debt. Validate against the codebase before scoring — grep for the actual call sites; don't trust this register blindly (it ages).

## Known debt register (verify, then update)

| Item | Type | Note |
|------|------|------|
| `POST /api/users` discards password | Code | All routes call `inviteUserByEmail()`; needs branch to `createUser({ password, email_confirm: true })` |
| Cal.com 500 — `password authentication failed for user "calcom"` | Infra/Code | Postgres connection attempt in `tenantintegrations` route |
| Employee↔User ID reconciliation | Architecture | Cosmetic, non-blocking; prerequisite migration `ALTER TABLE employees ADD COLUMN employee_user_id` for unified user form |
| Teams seeded via SQL only | Code/UX | No create/add-members/set-roles UI |
| Visibility mode toggle | Code/UX | Stored in `modulesettings`, no UI |
| Custom fields Phase 2 (caching) | Performance | Deferred after PR #527 |
| Stale `feature/whatsapp-aisha` branch | Repo hygiene | Safe to delete |
| Staging lane incomplete | Infra | `stg_stg` Doppler, `aishanet-staging`, staging DNS pending |
| Zed Braid extension blocked | Tooling | Node v25 Windows `EISDIR` bug; fix = Node 20 LTS + re-run `tree-sitter generate` |

## Categories
Code · Architecture · Test · Dependency · Documentation · Infrastructure (manual deploys, missing monitoring, IaC gaps).

## Prioritization
Score each: **Impact** (slows dev, 1-5) · **Risk** (cost of inaction — weight tenant-isolation/security/auth/billing risks highest, 1-5) · **Effort** (1-5, inverted).

`Priority = (Impact + Risk) × (6 − Effort)`

Tenant-isolation, auth, and billing-correctness debt is escalated regardless of score.

## Output
Prioritized list with score, business justification, exact files, and a phased remediation plan done alongside feature work — each remediation item paired with the test that proves it fixed (testing-strategy skill).

## Connectors
- **GitHub (`gh`):** grep call sites; check open PRs that may already touch the item.
- **Linear:** create/triage debt tickets with priority.
- **Supabase MCP `get_advisors`:** surface security/performance debt on both projects.

## Tips
1. Re-verify each register item against current code before reporting — the list drifts.
2. Pair every remediation with its regression test.
3. Escalate isolation/auth/billing debt above the raw priority score.
