# Team Visibility & Assignment Management System

## Overview

AishaCRM implements a **two-tier team-based access model** that controls both visibility AND write permissions based on team membership and role hierarchy.

**Two tiers:**

- **Team scope** = full R/W on records assigned to your team(s)
- **Org scope** = read + add notes ONLY on records from other teams in same tenant

The system uses **two assignment columns** on every entity table:

- `assigned_to` (UUID → employees.id) — which **person** owns the record
- `assigned_to_team` (UUID → teams.id) — which **team** owns the record

Both coexist. The `assigned_to` column and all existing AiSHA identity context, pronoun resolution, and Braid tool parameters remain untouched. The `assigned_to_team` column is additive.

Visibility modes (**hierarchical** and **shared**) are still configured per-tenant via modulesettings.

---

## Architecture

### Data Model

```
Entity tables (leads, contacts, accounts, opportunities, activities, bizdev_sources)
├── assigned_to (UUID, FK → employees.id) — individual person
├── assigned_to_team (UUID, FK → teams.id, ON DELETE SET NULL) — team ownership
└── ... other entity fields

teams
├── id (UUID, PK)
├── tenant_id (UUID, FK)
├── name (text)
├── parent_team_id (UUID, nullable — self-referential for hierarchy)
└── created_at

team_members
├── id (UUID, PK)
├── team_id (UUID, FK → teams)
├── employee_id (UUID, FK → employees)
├── role (text: 'director' | 'manager' | 'member')
└── joined_at

assignment_history
├── id (UUID, PK)
├── tenant_id (UUID)
├── entity_type (text: 'lead', 'contact', 'opportunity', etc.)
├── entity_id (UUID)
├── assigned_from (UUID, nullable)
├── assigned_to (UUID, nullable)
├── assigned_by (UUID)
├── action (text: 'assign', 'unassign', 'reassign', 'escalate')
├── note (text, optional)
└── created_at
```

### Visibility Modes

**Hierarchical (default):**

- List endpoints: team members see ALL tenant records (org-wide read)
- Write access determined per-record by `getAccessLevel()`

**Shared:**

- All team members see everything, all have full R/W

### Core Functions (`backend/lib/teamVisibility.js`)

`getVisibilityScope(user, supabase)`:

- Returns `{ bypass, teamIds, fullAccessTeamIds, employeeIds, mode, highestRole }`
- Determines what the user can see and write based on team membership

`getAccessLevel(scope, recordTeamId, recordAssignedTo, userId)`:

- Returns `'full'` | `'read_notes'` | `'none'`
- Used by PUT/DELETE route handlers to check per-record write access

`isNotesOnlyUpdate(payload, noteFields)`:

- Returns boolean — checks if PUT body only touches note fields
- Enforces read_notes tier restrictions

### Access Matrix

| User                   | Own records   | Team records | Other team records | Unassigned |
| ---------------------- | ------------- | ------------ | ------------------ | ---------- |
| Tom (member, A)        | full          | read_notes   | read_notes         | read_notes |
| Mike (manager, A)      | full          | full         | read_notes         | full       |
| Sarah (director, both) | full          | full         | full               | full       |
| Admin                  | full (bypass) | full         | full               | full       |

---

## Backend Implementation

### V2 Routes (All 6 Entities)

All 6 v2 routes handle:

- **GET**: org-wide read for team members, team FK join for `assigned_to_team_name`, `?assigned_to_team=UUID` filter
- **PUT**: write access check via `getAccessLevel()`, notes-only enforcement for `read_notes` tier
- **DELETE**: `full` access required
- `?assigned_to=UUID` and `?assigned_to=unassigned` query params still work

### Teams V2 API (`backend/routes/teams.v2.js`)

- `GET /api/v2/teams` — list teams for tenant
- `POST /api/v2/teams` — create team
- `PUT /api/v2/teams/:id` — update team (with empty-name validation)
- `DELETE /api/v2/teams/:id` — deactivate team (soft delete)
- `GET /api/v2/teams/:id/members` — list members with employee details
- `POST /api/v2/teams/:id/members` — add member
- `PUT /api/v2/teams/:id/members/:memberId` — change role (tenant-bound verification)
- `DELETE /api/v2/teams/:id/members/:memberId` — remove member (tenant-bound verification)
- `GET /api/v2/teams/visibility-mode` — get tenant visibility mode + labels
- `PUT /api/v2/teams/visibility-mode` — set visibility mode + role/tier labels
- `GET /api/v2/teams/settings` — non-admin label lookups
- `GET /api/v2/teams/scope` — generic team-scope for current user

### Braid / AiSHA Integration

#### Braid Tool Files (all 6 entities)

All list/search functions accept `assigned_to_team` parameter alongside `assigned_to`:

- `leads.braid` — `listLeads`, `searchLeads`
- `accounts.braid` — `listAccounts`, `searchAccounts`
- `contacts.braid` — `listContactsForAccount`, `searchContacts`, `listAllContacts`
- `opportunities.braid` — `listOpportunitiesByStage`, `searchOpportunities`
- `activities.braid` — `listActivities`, `searchActivities`
- `bizdev-sources.braid` — `listBizDevSources`, `searchBizDevSources`

#### `backend/lib/braid/registry.js`

- Tool descriptions include team filtering guidance
- `summarizeToolResult` includes `assigned_to_team_name` as `team: <n>` in all result preview sections

#### AiSHA Identity Context (`backend/lib/aiTeamContext.js`)

`fetchUserTeamContext(getSupabaseClient, userEmail, logger)`:

- Standalone, testable function
- Queries team_members → teams → employees to build team context
- Returns `{ teamLines, teamPronounRules }`

Identity block in `backend/routes/ai.js` (both web chat + WhatsApp):

- Single-team user: shows team name, role, member list, team_id
- Multi-team user: shows all teams with ambiguity hint
- Team-aware pronoun rules: "my team leads" → `assigned_to_team=<team_id>`
- Fallback: generic pronoun rules if no teams

---

## Frontend Implementation

### Assignment Cascade (`src/components/shared/AssignmentField.jsx`)

Team→Person cascade:

- Team dropdown → Person dropdown with automatic filtering
- Changing team clears person if not on new team
- Assigning person auto-sets team if single-team employee
- Multi-team employees require explicit team selection

Role-based rendering:

- **Admin/Director**: see all teams, full dropdowns
- **Manager**: sees own teams, full dropdowns within scope
- **Member**: read-only team display, "Assign to me" / "Unassign" buttons

All 6 entity forms pass `teamValue` and `onTeamChange` props.

### Supporting Hooks

- `src/hooks/useTeamScope.js` — Returns allowedIds, teamIds, fullAccessTeamIds, highestRole, bypass
- `src/hooks/useTeams.js` — Fetches teams + member mapping from `/api/v2/leads/teams-with-members?tenant_id=`

### Team Management UI (`src/components/settings/TeamManagement.jsx`)

Admin settings page with:

- Visibility mode toggle (shared vs hierarchical)
- Terminology card — customizable role labels (Director/Manager/Member) and tier labels (Division/Department/Team)
- Team CRUD — create, edit name/parent, activate/deactivate
- Member management — add employees, change roles, remove members

---

## Test Coverage

### Backend Tests

- `backend/__tests__/ai/aiTeamContext.test.js` — 58 tests covering all scenarios, errors, edge cases, token budget, query columns, concurrency, return type contract
- `backend/__tests__/routes/teams.v2.route.test.js` — route integration tests
- `backend/__tests__/schema/field-parity.test.js` — `assigned_to_team` on 5 entities

### Frontend Tests

- `src/components/shared/__tests__/AssignmentField.test.jsx` — 21 tests covering cascade, scoping, claim/unassign
- `src/components/settings/__tests__/TeamManagement.test.jsx` — 12 tests covering UI flows

---

## Test User Matrix

Tenant: `b62b764d-4f27-4e20-a8ad-8eb9b2e1055c` (dev)

| User                      | Auth Role | Team        | Team Role | Sees (two-tier) | Full R/W on         |
| ------------------------- | --------- | ----------- | --------- | --------------- | ------------------- |
| `sarah.director@test.com` | admin     | Sales A + B | director  | All records     | All records         |
| `mike.managera@test.com`  | manager   | Sales A     | manager   | All records     | Team A + unassigned |
| `jane.managerb@test.com`  | manager   | Sales B     | manager   | All records     | Team B + unassigned |
| `tom.repa1@test.com`      | employee  | Sales A     | member    | All records     | Own records only    |
| `amy.repa2@test.com`      | employee  | Sales A     | member    | All records     | Own records only    |
| `bob.repb1@test.com`      | employee  | Sales B     | member    | All records     | Own records only    |

All passwords: `TestPass123!`

Dev test leads (25 total):

- Team A (13): Mike 5, Tom 5, Amy 3 — `assigned_to_team = bb000001-...-01`
- Team B (7): Jane 2, Bob 5 — `assigned_to_team = bb000001-...-02`
- Unassigned (5): `assigned_to_team = NULL`

---

## Database Details

### Schema (both dev + prod)

All 6 entity tables have:

- `assigned_to` UUID — FK to employees.id (the individual person) ← UNCHANGED
- `assigned_to_team` UUID — FK to teams.id ON DELETE SET NULL ← NEW

FK Constraint Names (verified):

- `accounts_assigned_to_team_fkey`
- `activities_assigned_to_team_fkey`
- `bizdev_sources_assigned_to_team_fkey`
- `contacts_assigned_to_team_fkey`
- `leads_assigned_to_team_fkey`
- `opportunities_assigned_to_team_fkey`

Indexes per table:

- `idx_{table}_assigned_to_team` — partial index WHERE NOT NULL
- `idx_{table}_tenant_team` — composite (tenant_id, assigned_to_team)

### Databases

- Dev: `efzqxjpfewkrgpdootte`
- Prod: `ehjlenywplgyiahgxkfj`

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

## Remaining Work

### Phase 7: Production Data Backfill

- Populate `assigned_to_team` on existing records
- Lookup each employee's team membership
- Handle multi-team employees (use primary team or leave null)

---

## Known Issues & Considerations

1. **Cache TTL**: Visibility scope cached 60s. If a user is added to a team, they won't see the change for up to 60 seconds. Acceptable for now; could add cache invalidation on team membership changes.

2. **Supabase query builder thenable**: Never `await` a query builder mid-chain. Pre-compute all async data, then build queries synchronously.

3. **FK constraint names**: Team FK joins use auto-generated constraint names like `leads_assigned_to_team_fkey`. If these don't exist, the FK join will fail gracefully and fall back to simple `*` select.

4. **Org-wide read performance**: Team members now see all tenant records. For large tenants this could mean larger result sets. Pagination (limit/offset) already handles this, but monitor query performance.

5. **`assigned_to` backward compatibility**: All existing code that filters on `assigned_to` continues to work unchanged. The `?assigned_to=UUID` query param, AiSHA pronoun resolution, and Braid tool parameters are untouched.

6. **BizDevSources team name enrichment**: Uses batch lookup pattern (not FK join) since the route uses `select('*')` instead of named FK joins. Both list and single-record GET now include `assigned_to_team_name`.

7. **`/teams-with-members` endpoint location**: Currently on the leads v2 route. Could be moved to a shared `/teams` route in the future.

8. **`enforceEmployeeDataScope` removed from v2 routes**: The new two-tier system handles visibility controls more comprehensively.
