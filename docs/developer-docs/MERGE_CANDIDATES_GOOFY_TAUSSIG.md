# Merge candidates: inline stats + 400 tenant_id fix (from goofy-taussig)

**Last reviewed:** March 18, 2026  
**Status:** ⏳ Still pending — NOT yet merged to `main`

**Context:** Inline stats (stats returned with list data) and the AiSHA 400 fix (tenant_id in body/header + selected tenant for superadmin) were implemented in a prior session. Those changes live on **`claude/goofy-taussig`** and were either never merged to `main` or were overwritten by a merge. The test file `v2-inline-stats.test.js` on main expects `data.stats` on all five entities, but only Opportunities and Contacts currently return it; Leads, Activities, and Accounts do not.

> **Note (March 2026):** `activities.v2.js` on `fix/prod-bugs-mar18` has had a separate bugfix applied (contacts company FK join — commit `8933579f`). When merging from `goofy-taussig`, apply that branch's `activities.v2.js` inline-stats changes **on top of** the bugfix, not as a replacement. The bugfix changes are:
> - Contact `select` in `lookupRelatedEntity` uses `accounts!contacts_account_id_fkey(name)` (not `company`)
> - Name-building uses `data.accounts?.name` (not `data.company`)

---

## Branch with the correct state

- **Branch:** `claude/goofy-taussig` (local) / `origin/claude/goofy-taussig` (remote)
- **Relevant commit:** `813e1285 feat: stat cards respect active filters across all entity pages`

---

## Files that differ (main vs goofy-taussig) and should be merged

These 21 files differ between `main` and `claude/goofy-taussig`:

| #   | File                                           | What was changed (transcript)                                                                                                                                                                                       |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `backend/routes/leads.v2.js`                   | **Inline stats:** GET / returns `data: { leads, total, stats }` (stats aggregated with same filters, no pagination). On main: returns only `{ leads, total }`.                                                      |
| 2   | `backend/routes/opportunities.v2.js`           | Inline stats in GET / (main may already have this from PR #365; verify).                                                                                                                                            |
| 3   | `backend/routes/contacts.v2.js`                | Inline stats in GET /.                                                                                                                                                                                              |
| 4   | `backend/routes/activities.v2.js`              | Inline stats always in GET / (not opt-in `include_stats`); return `data.stats` not `data.counts`.                                                                                                                   |
| 5   | `backend/routes/accounts.v2.js`                | Inline stats in GET /.                                                                                                                                                                                              |
| 6   | `backend/routes/ai.js`                         | **400 fix:** `getTenantId(req)` must include `req.body?.tenant_id` so POST /api/ai/chat and conversations can resolve tenant. On main: getTenantId does not read body.                                              |
| 7   | `backend/server.js`                            | (Check diff; may be unrelated.)                                                                                                                                                                                     |
| 8   | `backend/package-lock.json`                    | (Lockfile.)                                                                                                                                                                                                         |
| 9   | `braid-llm-kit/examples/assistant/leads.braid` | Return type/docs for listLeads to include stats for AI.                                                                                                                                                             |
| 10  | `src/api/core/httpClient.js`                   | Pass-through of `result.data.stats` as `arr._stats` (main already has this).                                                                                                                                        |
| 11  | `src/api/functions.js`                         | **400 fix:** Include `tenant_id: tenantId \|\| undefined` in the chat request body so backend can resolve tenant. On main: body does not include tenant_id.                                                         |
| 12  | `src/api/conversations.js`                     | **400 fix:** Include `tenant_id` in createConversation, updateConversation, addMessage, submitFeedback bodies. On main: createConversation sends only `{ agent_name, metadata }`.                                   |
| 13  | `src/components/ai/ChatInterface.jsx`          | **400 fix:** Use `useTenant()` and pass `tenantId: selectedTenantId \|\| user?.tenant_id \|\| user?.tenant?.id` so superadmin uses dropdown-selected tenant. On main: only `user?.tenant_id \|\| user?.tenant?.id`. |
| 14  | `src/api/entityOverrides/user.js`              | (Check diff.)                                                                                                                                                                                                       |
| 15  | `src/hooks/useLeadsData.js`                    | Consume `response._stats` from filter response; remove separate loadTotalStats call/effect.                                                                                                                         |
| 16  | `src/hooks/useOpportunitiesData.js`            | Consume \_stats from filter response; remove separate loadTotalStats effect.                                                                                                                                        |
| 17  | `src/hooks/useContactsData.js`                 | Consume \_stats from filter response; remove separate stats effect.                                                                                                                                                 |
| 18  | `src/hooks/useAccountsData.js`                 | Consume \_stats from filter response; remove separate stats effect.                                                                                                                                                 |
| 19  | `src/hooks/useActivitiesData.js`               | Consume stats from filter response (activities return object); remove loadStats call.                                                                                                                               |

---

## 400 error (AiSHA chat / conversations)

**Symptom:** `400 Bad Request` — e.g. "Superadmin write operations require a tenant_id to be specified" or "Valid tenant_id required".

**Cause:**

1. Backend `getTenantId(req)` does not check `req.body?.tenant_id`, so POST body tenant is ignored.
2. Frontend does not send `tenant_id` in the chat or conversation request bodies.
3. For superadmin, ChatInterface uses `user?.tenant_id` (system tenant) instead of the dropdown-selected tenant (`selectedTenantId`).

**Fixes (from transcript):**

1. **backend/routes/ai.js** — In `getTenantId(req)` add `req.body?.tenant_id` (e.g. after `req.query?.tenantId`, before `req.user?.tenant_id`).
2. **src/api/functions.js** — In the body passed to `fetch('/api/ai/chat', ...)`, add `tenant_id: tenantId || undefined`.
3. **src/api/conversations.js** — In createConversation, updateConversation, addMessage, submitFeedback: include `tenant_id` in the JSON body (e.g. from `resolveTenantId()`).
4. **src/components/ai/ChatInterface.jsx** — Import `useTenant`, get `selectedTenantId`, and pass `tenantId: selectedTenantId || user?.tenant_id || user?.tenant?.id` into the chat/conversation call.

---

## Inline stats (stats with list data)

**Symptom:** `v2-inline-stats.test.js` fails with "Response should contain stats object" for Activities, Contacts, Accounts, Leads. Stat cards don’t update with filters.

**Cause:**

- Leads: GET /api/v2/leads returns `data: { leads, total }` only (no `stats`).
- Activities: GET / returns stats only when `include_stats=true` and uses `data.counts` instead of `data.stats`.
- Accounts: GET / returns no stats.
- Opportunities/Contacts: Main may already return `data.stats` (verify).

**Fix:** Merge or re-apply the GET / handler changes from `claude/goofy-taussig` for:

- `backend/routes/leads.v2.js` (add stats aggregation and `data: { leads, total, stats }`),
- `backend/routes/activities.v2.js` (always return `data.stats`, same filter scope),
- `backend/routes/accounts.v2.js` (add stats aggregation and include in response).

Frontend hooks already expect `_stats` (httpClient passes it through); ensure each hook uses `response._stats` and does not rely on a separate stats request.

---

## How to restore

**Option A – Merge the branch (recommended if you want all fixes at once)**

```bash
git fetch origin
git checkout main
git merge origin/claude/goofy-taussig -m "Merge goofy-taussig: inline stats (leads/activities/accounts) + AiSHA 400 tenant_id fix"
# Resolve conflicts if any, then run tests and fix any regressions.
```

**Option B – Cherry-pick or re-apply only the 400 fix**

Apply the four 400-fix changes above (ai.js getTenantId, functions.js body, conversations.js bodies, ChatInterface tenantId). Then run AiSHA and create/list conversations to confirm 400 is gone.

**Option C – Re-apply only inline stats**

For each of leads.v2.js, activities.v2.js, accounts.v2.js, re-apply the GET / stats aggregation and response shape from `claude/goofy-taussig`, then run `docker exec aishacrm-backend npm test` and fix any remaining test or frontend issues.

---

_Generated from transcript and repo diff (main vs claude/goofy-taussig)._
