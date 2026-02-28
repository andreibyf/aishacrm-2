# Team Assignment & Two-Tier Visibility — Implementation Spec

## CRITICAL: Do NOT Remove Existing Functionality

This feature **ADDS** `assigned_to_team` alongside the existing `assigned_to` (employee). Both columns coexist. The `assigned_to` column, all existing visibility filtering, AiSHA identity context, pronoun resolution, and Braid tool `assigned_to` parameters must remain untouched. This is additive only.

---

## Implementation Status

| Phase                     | Description                                               | Status         |
| ------------------------- | --------------------------------------------------------- | -------------- |
| 1. Schema Migration       | `assigned_to_team` column on all 6 tables, both databases | ✅ Complete    |
| 2. teamVisibility.js      | Two-tier access model, getAccessLevel, isNotesOnlyUpdate  | ✅ Complete    |
| 3. Route Updates          | Org-wide read, team FK join, PUT/DELETE write checks      | ✅ Complete    |
| 4. Frontend Cascade UI    | Team→Person dropdown, auto-set team, cascade clear        | ✅ Complete    |
| 5. Braid Tool Updates     | assigned_to_team param, registry descriptions, summarize  | ✅ Complete    |
| 6. AiSHA Identity Context | Team info in system prompt, testable extraction           | ✅ Complete    |
| 7. Production Backfill    | Populate assigned_to_team on existing records             | 🔲 Not started |
| 8. Test Data Update       | Dev leads backfilled with assigned_to_team                | ✅ Complete    |

---

## Current State (What Already Works — Do Not Break)

### Database Schema (Dev: efzqxjpfewkrgpdootte, Prod: ehjlenywplgyiahgxkfj)

Entity tables (leads, contacts, accounts, opportunities, activities, bizdev_sources) all have:

- `assigned_to` UUID column → FK to `employees.id` (the individual person) ← UNCHANGED
- `assigned_to_team` UUID column → FK to `teams.id` ON DELETE SET NULL ← NEW (Phase 1)

FK Constraint Names (verified):

- `accounts_assigned_to_team_fkey`, `activities_assigned_to_team_fkey`, `bizdev_sources_assigned_to_team_fkey`
- `contacts_assigned_to_team_fkey`, `leads_assigned_to_team_fkey`, `opportunities_assigned_to_team_fkey`

Supporting tables:

- `teams` (id, tenant_id, name, description, parent_team_id)
- `team_members` (id, team_id, employee_id, role: 'director'|'manager'|'member')
- `assignment_history` (id, tenant_id, entity_type, entity_id, assigned_from, assigned_to, assigned_by, action, note, created_at)

### Test Data (Tenant: b62b764d-4f27-4e20-a8ad-8eb9b2e1055c)

**Teams:**

- Sales Team A (bb000001-...-01) — Denver metro territory
  - Sarah Director (director), Mike ManagerA (manager), Tom RepA1 (member), Amy RepA2 (member)
- Sales Team B (bb000001-...-02) — Colorado Springs territory
  - Sarah Director (director), Jane ManagerB (manager), Bob RepB1 (member)

**25 test leads assigned (with assigned_to_team backfilled):**

- Tom RepA1 (aa000001-...-04): 5 leads → Team A
- Amy RepA2 (aa000001-...-05): 3 leads → Team A
- Mike ManagerA (aa000001-...-02): 5 leads → Team A
- Bob RepB1 (aa000001-...-06): 5 leads → Team B
- Jane ManagerB (aa000001-...-03): 2 leads → Team B
- Unassigned: 5 leads → NULL team

**User logins:** tom.repa1@test.com, mike.managera@test.com, bob.repb1@test.com, jane.managerb@test.com, sarah.director@test.com (all: TestPass123!)

### Visibility Scoping (Two-Tier: R/W vs Read+Notes)

`backend/lib/teamVisibility.js` — `getVisibilityScope(user, supabase)`:

- Returns `{ bypass, teamIds, fullAccessTeamIds, employeeIds, mode, highestRole }`
- List endpoints: team members see ALL tenant records (org-wide read, no filter)
- Write endpoints: `getAccessLevel()` checks per-record before allowing update/delete
- `isNotesOnlyUpdate()` enforces read_notes tier on PUT requests

### Frontend Cascade UI (Phase 4 — Complete)

`src/components/shared/AssignmentField.jsx` — Team→Person cascade:

- Team dropdown → Person dropdown with automatic filtering
- Changing team clears person if not on new team; assigning person auto-sets team
- Role-based: Admin/Director see all teams, Manager sees own teams, Member sees team read-only
- All 6 entity forms pass `teamValue` and `onTeamChange` props

Supporting hooks:

- `src/hooks/useTeamScope.js` — Returns allowedIds, teamIds, fullAccessTeamIds, highestRole, bypass
- `src/hooks/useTeams.js` — Fetches teams + member mapping from `/api/v2/leads/teams-with-members?tenant_id=`

### AiSHA / Braid Integration (Phase 5 — Complete)

All 6 entity .braid files accept `assigned_to_team` parameter on list/search functions.
Tool descriptions in registry.js include team filtering guidance.
`summarizeToolResult` includes `assigned_to_team_name` in result previews.

All 6 v2 routes accept `?assigned_to_team=UUID` query parameter with sanitized UUID filtering.
BizDevSources additionally has `assigned_to` query param support and team name batch enrichment.

### AiSHA Identity Context (Phase 6 — Complete)

`backend/lib/aiTeamContext.js` — `fetchUserTeamContext(getSupabaseClient, userEmail, logger)`:

- Standalone, testable function extracted from ai.js
- Queries team_members → teams → employees to build team context
- Returns `{ teamLines, teamPronounRules }` for injection into system prompt

Identity block in `backend/routes/ai.js` (both web chat + WhatsApp):

- Single-team: shows team name, role, member list, team_id
- Multi-team: shows all teams with ambiguity hint ("user is on multiple teams, ask which team")
- Team-aware pronoun rules: "my team leads" → `assigned_to_team=<team_id>`
- Fallback: if no teams, uses generic pronoun rules

### V2 Routes (Two-Tier + Team Filtering)

All 6 v2 routes handle:

- GET: org-wide read for team members, team FK join for `assigned_to_team_name`, `?assigned_to_team=UUID` filter
- PUT: write access check via `getAccessLevel()`, notes-only enforcement
- DELETE: `full` access required
- `?assigned_to=UUID` and `?assigned_to=unassigned` query params still work

### Teams V2 API (backend/routes/teams.v2.js)

- Team CRUD (create, update, soft-delete, list with member counts)
- Member management (add, remove, change role) with tenant-bound verification
- Visibility mode toggle (shared vs hierarchical)
- Generic `/scope` endpoint for frontend useTeamScope hook
- Customizable role labels and tier labels
- Admin-only access for all management endpoints

---

## What Still Needs To Be Added

### 7. Production Data Backfill

Populate `assigned_to_team` on existing production records:

- Lookup each `assigned_to` employee's team membership
- Single-team employees: auto-set their team
- Multi-team employees: leave NULL or use primary team
- Unassigned records: leave NULL

---

## Files Changed (All Phases)

| Category            | Files                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend core        | `backend/lib/teamVisibility.js`, `backend/lib/aiTeamContext.js` (NEW)                                                                                                                                    |
| Backend routes      | `leads.v2.js`, `contacts.v2.js`, `accounts.v2.js`, `opportunities.v2.js`, `activities.v2.js`, `bizdevsources.js`, `teams.v2.js` (NEW)                                                                    |
| Backend AI          | `backend/routes/ai.js` (identity block in both web chat + WhatsApp)                                                                                                                                      |
| Backend registry    | `backend/lib/braid/registry.js`                                                                                                                                                                          |
| Braid tools         | `leads.braid`, `accounts.braid`, `contacts.braid`, `opportunities.braid`, `activities.braid`, `bizdev-sources.braid`                                                                                     |
| Frontend assignment | `src/components/shared/AssignmentField.jsx`                                                                                                                                                              |
| Frontend hooks      | `src/hooks/useTeamScope.js`, `src/hooks/useTeams.js` (NEW)                                                                                                                                               |
| Frontend forms      | `LeadForm.jsx`, `AccountForm.jsx`, `ContactForm.jsx`, `OpportunityForm.jsx`, `ActivityForm.jsx`, `BizDevSourceForm.jsx`                                                                                  |
| Frontend settings   | `src/components/settings/TeamManagement.jsx` (NEW), `src/pages/Settings.jsx`                                                                                                                             |
| Tests               | `backend/__tests__/ai/aiTeamContext.test.js` (58 tests), `src/components/shared/__tests__/AssignmentField.test.jsx` (21 tests), `backend/__tests__/schema/field-parity.test.js` (assigned_to_team added) |

## Files That Must NOT Change (Already Working)

| File                               | Why                                    |
| ---------------------------------- | -------------------------------------- |
| backend/middleware/authenticate.js | Internal JWT user_role chain — working |
| backend/lib/braid/execution.js     | JWT embedding — working                |
| backend/lib/aiBudgetConfig.js      | Token budgets tuned — working          |
| backend/lib/entityLabelInjector.js | Truncation limits — working            |

---

## Session Journal Location

Full history at: `aicampaigns-session-journal.md` (repo root)
Architecture doc at: `docs/architecture/TEAM_VISIBILITY_SYSTEM.md`
