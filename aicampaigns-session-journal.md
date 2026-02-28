# AICampaigns Multi-Channel Overhaul — Session Journal

## 2026-02-27 (Thursday) — Phase 6: AiSHA Identity Context (Team Visibility)

### What Was Done

Added team identity context to AiSHA's system prompt in `backend/routes/ai.js` so AiSHA can contextually respond to team-aware queries like "show my team's leads" or "what's Tom working on".

**New helper function: `fetchUserTeamContext(employeeId)`**

- Uses Supabase client (not pgPool) per project convention
- Three lightweight queries: user's team memberships → team names → all teammates
- Returns `{ teamLines, teamPronounRules }` for system prompt injection
- Fully non-blocking on failure — returns empty strings if team data unavailable
- Placed alongside other utility functions before `insertAssistantMessage`

**Identity block updates (both locations):**

1. `generateAssistantResponse` (~line 1143) — WhatsApp/agent path
2. `POST /api/ai/chat` handler (~line 3309) — main web chat path

Both now include:

- Team name(s) with user's role: `- Team: Sales Team A (manager)`
- Team members list: `Members: Tom RepA1, Amy RepA2, Mike ManagerA`
- Team ID: UUID for passing to `assigned_to_team` on Braid tools
- Updated pronoun resolution rules with team-specific `assigned_to_team` routing
- Multi-team users (like directors) get all teams listed + ambiguity prompt

**Bugfix:** Block 1 previously referenced `req.user?.id` inside `generateAssistantResponse` which doesn't have `req` in scope — corrected to use `userId` parameter.

**Token budget impact:** ~200 tokens for single-team, ~280 for dual-team. Well within the 2500 SYSTEM_PROMPT_CAP.

### Example Output (Mike ManagerA)

```
**CURRENT USER IDENTITY:**
- Name: Mike ManagerA
- Email: mike.managera@test.com
- User ID: aa000001-...-02
- Role: manager
- Team: Sales Team A (manager)
  Members: Sarah Director, Mike ManagerA, Tom RepA1, Amy RepA2
  Team ID: bb000001-...-01

**PRONOUN RESOLUTION RULES (MANDATORY):**
- "my leads" → list_leads with assigned_to="aa000001-...-02"
- "my team's leads" → list_leads with assigned_to_team="bb000001-...-01"
- "Sales Team A leads" → list_leads with assigned_to_team="bb000001-...-01"
- "[person name]'s leads" → find UUID, use assigned_to
- Same pattern for all 6 entities
```

### Files Modified

- `backend/routes/ai.js` — `fetchUserTeamContext` helper + both identity blocks updated

### Files NOT Modified (as required)

- `backend/middleware/authenticate.js`
- `backend/lib/braid/execution.js`
- `backend/lib/aiBudgetConfig.js`
- `backend/lib/entityLabelInjector.js`

### Implementation Status Update

| Phase                       | Status      |
| --------------------------- | ----------- |
| 6. AiSHA Identity Context   | ✅ Complete |
| 7. Production Data Backfill | 🔲 Next     |

---

## 2026-02-23 (Sunday evening)

---

### What Was Done

**Database (both main `ehjlenywplgyiahgxkfj` + dev `efzqxjpfewkrgpdootte`):**

- Added `campaign_type` column with CHECK constraint for 8 types: call, email, sms, linkedin, whatsapp, api_connector, social_post, sequence
- Added `assigned_to` (text), `is_test_data` (boolean) columns
- Backfilled `campaign_type` from legacy `type` column
- Performance indexes: `idx_ai_campaign_tenant_type`, `idx_ai_campaign_tenant_status`
- SendFox removed from CHECK constraint (won't work with their API)

**Backend (`backend/routes/aicampaigns.js`) — complete rewrite:**

- VALID_CAMPAIGN_TYPES constant (8 types)
- POST validates campaign_type, returns 400 for invalid
- Properly JSON-stringifies all JSONB columns
- GET excludes test data by default (`include_test_data=true` to override)
- Filters: status, campaign_type, search (ILIKE on name/description)
- PUT updates both `campaign_type` and legacy `type`
- Start/pause/resume validate integration ownership
- Lifecycle tracking in metadata
- Webhook emissions for CRUD events

**Frontend — AICampaignForm.jsx:**

- Fixed broken `/icons/calendar.svg` → Lucide `<Calendar>` component
- 8 campaign types in dropdown with emoji icons
- Channel-specific config panels:
  - **Call**: provider, objective, prompt template, preview
  - **Email**: sending profile, subject, body template
  - **SMS**: message body with segment counter (160 char segments)
  - **LinkedIn**: action type (connection/DM/InMail), message template
  - **WhatsApp**: template name + message body
  - **API Connector**: webhook URL, HTTP method, auth header, JSON payload template
  - **Social Post**: platform checkboxes (FB/IG/X/LinkedIn page), content + image URL
  - **Sequence**: description placeholder (full builder later)
- `handleSubmit` packs per-channel metadata correctly
- Contact filtering by channel type (email→email contacts, phone→phone contacts, etc.)

**Frontend — AICampaignsPage.jsx:**

- Dashboard top section: campaign cards by type with emoji icons + counts
- Bulk select: header checkbox (select all on page), row checkboxes
- Bulk actions bar: Change Status, Delete Selected
- Search bar: real-time filter (name, description)
- Filter by: Status dropdown, Type dropdown
- Table: columns for Name, Type, Status, Recipients, Progress, Dates, Actions
- Action icons: View Details, Edit, Pause/Resume, Delete (with confirm)
- Responsive column visibility
- Detail side panel: Campaign info, timeline, recipients
- Stats cards at top (Total, Active, Paused, Completed)
- Empty state messaging per filter combination

**API Integration:**

- `AICampaign` entity added to `entities.js` (path: `aicampaigns`)
- Full CRUD: filter, create, update, delete
- Lifecycle methods: start, pause, resume
- Bulk operations: bulk status change, bulk delete

### What's Left (In Priority Order)

1. **Wire up contact selection to actual campaign target list** — currently the form lets you pick contacts but doesn't store them as campaign recipients
2. **Campaign execution engine** — when you click "Start", it should actually begin processing the recipient list
3. **Progress tracking** — real-time updates on sent/delivered/failed per recipient
4. **Template variable substitution** — `{{first_name}}`, `{{company}}` etc. in message templates
5. **Implement actual delivery** per channel (Phase 2):
   - Email: use tenant's sending profile integration
   - SMS: Twilio/integration adapter
   - LinkedIn: LinkedIn API adapter
   - WhatsApp: WhatsApp Business API adapter
   - API Connector: generic webhook fire
   - Social Post: platform-specific API calls
   - Sequence: orchestrator that chains other campaign types with delays

### Known Issues

- `indeterminate` warning on Select All checkbox (cosmetic, Radix UI passes prop to DOM)
- SendFox removed — their API doesn't support the workflow we need
- Sequence type is placeholder only — needs full builder UI

### Git Status

Feature branch: `feature/aicampaigns-overhaul`
Multiple commits made during session. Ready for continued work.

---

## 2026-02-26/27 — Team Visibility & Assignment Management

---

### What Was Done

**Database (both main `ehjlenywplgyiahgxkfj` + dev `efzqxjpfewkrgpdootte`):**

- Created `teams`, `team_members` tables with hierarchy (parent_team_id)
- Created `assignment_history` table for tracking assignment changes
- Updated `leads_update_definer` RPC to handle `text[]` columns (tags fix)
- Test data: 3 teams (Sales A, Sales B, Marketing), 8 employees with roles (director/manager/member)
- Test auth users created for Tom, Mike, Sarah, Jane, Amy, Bob

**Backend — Team Visibility System:**

- `backend/lib/teamVisibility.js`: Core utility with `getVisibilityScope()` and `applyVisibilityFilter()`
  - Hierarchical mode: members see own + unassigned, managers see team, directors see multi-team
  - Shared mode: all team members see all team records
  - In-memory cache (60s scope, 5min settings)
  - Reads mode from `modulesettings` table (module: 'teams', key: 'visibility_mode')
- `backend/routes/leads.v2.js`:
  - GET list: pre-compute visibility scope async, apply filter synchronously in buildBaseQuery
  - GET /stats: visibility filter on all stat queries (raw SQL + fallback)
  - GET /team-scope: returns current user's visibility scope for frontend employee selector
  - GET /:id/assignment-history: returns chronological trail with resolved employee names
  - PUT /:id: records assignment changes to assignment_history (non-blocking)
- `backend/lib/cacheMiddleware.js`: **CRITICAL** — added userId to cache keys in both cacheList and cacheDetail to prevent data leaks between users with different visibility scopes

**Frontend — Lead Assignment UI:**

- `src/components/leads/LeadForm.jsx`:
  - Three UI states: managers get team-scoped dropdown, members get "Assign to me"/"Unassign" buttons
  - Fetches `/team-scope` to get allowed employee IDs for dropdown filtering
  - New leads by non-managers default to unassigned (not auto-assigned)
  - Submission normalizes empty/unassigned to null
- `src/components/shared/LazyEmployeeSelector.jsx`: added `allowedIds` prop for team filtering
- `src/components/leads/AssignmentHistory.jsx`: Timeline breadcrumb component showing assign/reassign/unassign trail with icons, relative timestamps, and actor names
- `src/components/leads/LeadDetailPanel.jsx`: Added AssignmentHistory to detail display
- `src/pages/Leads.jsx`:
  - isManager check expanded to include `user.role === 'manager'` and `employee_role === 'director'`
  - 150ms delay after cache clear before re-fetch (race condition mitigation)
- `src/utils/apiHealthMonitor.js`: Friendly error toasts for non-superadmins
- `src/components/shared/UserContext.jsx`: Superadmin check for technical error details

### Test User Matrix (Tenant: b62b764d-4f27-4e20-a8ad-8eb9b2e1055c)

| User                    | Auth Role | Team        | Team Role | Visibility                   |
| ----------------------- | --------- | ----------- | --------- | ---------------------------- |
| sarah.director@test.com | admin     | Sales A + B | director  | All assigned + unassigned    |
| mike.managera@test.com  | manager   | Sales A     | manager   | Tom + Amy + own + unassigned |
| jane.managerb@test.com  | manager   | Sales B     | manager   | Bob + own + unassigned       |
| tom.repa1@test.com      | employee  | Sales A     | member    | Own + unassigned             |
| amy.repa2@test.com      | employee  | Sales A     | member    | Own + unassigned             |
| bob.repb1@test.com      | employee  | Sales B     | member    | Own + unassigned             |

---

## 2026-02-27 — Team Visibility Rollout, Assignment UI, Cache Optimization

---

### What Was Done

**Phase 1 — Team Visibility Rollout to All v2 Routes:**

- Rolled `getVisibilityScope()` filtering to 5 routes: contacts.v2, accounts.v2, opportunities.v2, activities.v2, bizdevsources.js
- Removed `enforceEmployeeDataScope` middleware from all v2 routes (replaced by teamVisibility)
- Each route: pre-computes visibility scope async, applies filter synchronously in query builder
- Unified pattern across all entity list endpoints

**Phase 2 — Assignment History Tracking (5 routes):**

- Added assignment change tracking to PUT routes for contacts, accounts, opportunities, activities, bizdevsources
- Pre-fetch current record, compare assigned_to, non-blocking insert to `assignment_history`
- Added GET `/:id/assignment-history` endpoints to all 5 routes
- Employee name resolution via batch lookup for history trail display

**Phase 3 — Test Suite:**

- `teamVisibility.test.js`: 14 unit tests covering getVisibilityScope (member/manager/director/admin/shared modes)
- `teamVisibility.routes.test.js`: 25 integration tests covering all v2 route visibility filtering + assignment history endpoints
- Bug fix: entity_id column is UUID type (not text)

**Phase 4 — Frontend Assignment UI (All 5 Entity Forms):**

- `src/hooks/useTeamScope.js`: Custom hook fetching team scope from `/api/v2/leads/team-scope` with Supabase auth token
- `src/components/shared/AssignmentField.jsx`: Reusable component with manager dropdown / employee claim+unassign paths
- `src/components/leads/AssignmentHistory.jsx`: Updated with `routeMap` for all entity types
- Integrated AssignmentField into: ContactForm, AccountForm, OpportunityForm, ActivityForm, BizDevSourceForm
- All forms pass entityType/entityId for history display

**Phase 5 — Cache Optimization (Redis + Frontend):**

- **Root cause**: 3-minute Redis TTL + 5s frontend ApiManager cache caused stale Assigned To data after changes
- `backend/lib/cacheManager.js`: Reduced default TTLs — list: 180→30s, detail: 300→60s, count: 600→120s
- Updated hardcoded TTLs in all v2 routes:
  - contacts.v2.js, accounts.v2.js, activities.v2.js, leads.v2.js: list 180→30s, detail 300→60s
  - opportunities.v2.js: list 180→30s, detail 300→60s, stats 300→60s, count 600→120s
  - bizdevsources.js: list 180→30s
  - dashboard-funnel.js: list 120→30s
- `src/components/shared/ApiManager.jsx`: Frontend cache reduced from 2s/5s to 1s/2s
- Settings cache unchanged at 30 minutes (rarely mutated)

**Bug Fix — LazyEmployeeSelector z-index:**

- `src/components/shared/LazyEmployeeSelector.jsx`: Added `z-[2147483010]` to SelectContent
- SimpleModal uses zIndex 2147483000-2147483001; Radix Select portals rendered behind it
- Fixed Assigned To dropdown not opening in any form rendered inside SimpleModal

### Files Modified (Summary)

| Category             | Files                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Backend visibility   | contacts.v2.js, accounts.v2.js, opportunities.v2.js, activities.v2.js, bizdevsources.js       |
| Backend cache        | cacheManager.js, dashboard-funnel.js + all v2 routes (TTL updates)                            |
| Frontend components  | AssignmentField.jsx, LazyEmployeeSelector.jsx, AssignmentHistory.jsx                          |
| Frontend forms       | ContactForm.jsx, AccountForm.jsx, OpportunityForm.jsx, ActivityForm.jsx, BizDevSourceForm.jsx |
| Frontend hooks/utils | useTeamScope.js, ApiManager.jsx                                                               |
| Tests                | teamVisibility.test.js, teamVisibility.routes.test.js                                         |

### What's Left (Next Session Priority)

1. **Browser test full assignment workflow** — verify dropdown opens, assignment saves, list updates within 30s
2. **Multi-user testing** — test all 4 test users (Tom, Mike, Bob, Sarah) for correct visibility scoping
3. **Team Management UI** — admin page for creating/editing teams, adding/removing members, setting roles (director/manager/member). Currently all team data is seeded via SQL; no self-service UI exists.
4. **Performance monitoring** — ensure 30s Redis TTL doesn't cause excessive DB load
5. **Suppress ModuleSettings 403** for non-admins in frontend (cosmetic — only superadmins have access)

### Key Architecture Decisions

- Visibility scope cached per-user (60s TTL) to avoid repeated DB lookups
- Cache keys MUST include userId when visibility scoping is active
- Assignment history is non-blocking (fire-and-forget insert) to avoid slowing PUT responses
- Async Supabase query builders cannot be awaited — pre-compute async data, build queries synchronously
- Postgres RPC functions need special handling for array columns (jsonb_array_elements_text)
- Redis TTL reduced to 30s as app performance has improved; aggressive caching no longer needed
- LazyEmployeeSelector needs z-[2147483010] when used inside SimpleModal (zIndex: 2147483000+)

### Git Status

Branch: main (or current working branch)
Ready for commit + browser verification testing.

---

## 2026-02-27 — AiSHA Visibility Fix + assigned_to Filtering + Team Assignment Design

---

### What Was Done

**Phase 1 — AiSHA Security Gap Fixed (3-Layer Chain):**

Discovered that AiSHA bypassed team visibility entirely. Root cause: `execution.js` created internal JWT without `user_role` → `authenticate.js` hardcoded `role='superadmin'` → `getVisibilityScope` bypassed filtering. Every AiSHA user got admin-level data access.

Fix applied across 3 files:

- `backend/middleware/authenticate.js` — internal JWT handling now reads `user_role` from token payload
- `backend/lib/braid/execution.js` — internal JWT now embeds `user_role` and `email` from accessToken
- `backend/routes/ai.js` — `executeToolCall()` and `generateAssistantResponse()` signatures pass userId, userRole

Test suite: 38 tests across 3 files (authenticate.internal-jwt, execution.visibility, aisha-visibility-chain)

**Phase 2 — Token Budget & Identity Context:**

AiSHA couldn't resolve "my leads" because identity context was truncated by tight token budgets.

- `backend/lib/aiBudgetConfig.js` — HARD_CEILING: 4000→8000, SYSTEM_PROMPT_CAP: 1200→2500, TOOL_SCHEMA_CAP: 800→1200, TOOL_RESULT_CAP: 700→1200, OUTPUT_MAX_TOKENS: 350→600
- `backend/lib/entityLabelInjector.js` — truncation limits raised to match budget (1200→2500)
- `backend/routes/ai.js` — User identity block injected into system prompt (both chat handlers):
  ```
  CURRENT USER IDENTITY: Name, Email, User ID, Role
  PRONOUN RESOLUTION RULES: "my leads" → list_leads with assigned_to=UUID
  ```

**Phase 3 — assigned_to Query Param Across All Entities:**

Added `assigned_to` parameter support to all v2 routes and Braid tool signatures.

V2 routes updated with "unassigned"/"null" → IS NULL handling:

- leads.v2.js ✅
- accounts.v2.js ✅
- contacts.v2.js ✅
- opportunities.v2.js ✅ (already had it)
- activities.v2.js ✅

Braid tool signatures updated (added `assigned_to` param):

- leads.braid — listLeads, searchLeads
- accounts.braid — listAccounts, searchAccounts
- contacts.braid — listContactsForAccount, searchContacts, listAllContacts
- opportunities.braid — listOpportunitiesByStage, searchOpportunities
- activities.braid — listActivities, searchActivities

Tool descriptions updated in `registry.js` with pronoun routing guidance.

**Phase 4 — Tool Result Summary Fix:**

`summarizeToolResult` was getting `{ leads: [...], total: N }` (object) but only reporting field names, not actual data. AiSHA was hallucinating counts.

- Added nested array unwrapping in `registry.js` — detects `{ leads: [...] }` pattern and extracts items
- Preview includes: name, id, company, job_title, status/stage, assigned_to_name
- Increased preview limit from 8→25 items to avoid truncation on manager-level queries

**Phase 5 — Test Data:**

23 clean leads inserted into Dev Playground tenant with proper assignments:

- Tom RepA1: 5 leads
- Amy RepA2: 3 leads
- Mike ManagerA: 5 leads
- Bob RepB1: 5 leads
- Jane ManagerB: 2 leads
- Unassigned: 3 leads

### Validation Results

| User                   | Query                            | Expected                           | Actual                       | Status |
| ---------------------- | -------------------------------- | ---------------------------------- | ---------------------------- | ------ |
| Tom (employee, Team A) | "how many leads assigned to me?" | 5 leads                            | 5 leads                      | ✅     |
| Tom (employee, Team A) | "does Amy have any leads?"       | No access                          | "no results for Amy"         | ✅     |
| Mike (manager, Team A) | "list all leads"                 | 16 leads (Team A + unassigned)     | 16 leads                     | ✅     |
| Mike (manager, Team A) | "who has what?"                  | Tom 5, Amy 3, Mike 5, Unassigned 3 | Correct breakdown            | ✅     |
| Bob (employee, Team B) | Add note to Amy's lead           | No access                          | "couldn't find Carlos Reyes" | ✅     |

### Files Modified

| Category           | Files                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| Security fix       | authenticate.js, execution.js, ai.js                                                            |
| Token budget       | aiBudgetConfig.js, entityLabelInjector.js                                                       |
| Identity context   | ai.js (2 chat handlers)                                                                         |
| assigned_to routes | leads.v2.js, accounts.v2.js, contacts.v2.js, opportunities.v2.js, activities.v2.js              |
| Braid tools        | leads.braid, accounts.braid, contacts.braid, opportunities.braid, activities.braid              |
| Tool summaries     | registry.js (summarizeToolResult nested array unwrap + preview limit)                           |
| Tests              | authenticate.internal-jwt.test.js, execution.visibility.test.js, aisha-visibility-chain.test.js |

### Design Decision: Team-Level Assignment (Next Phase)

Current model is binary visibility — you see records or you don't. Agreed on a two-tier access model:

**Team scope** = full R/W on your team's records
**Org scope** = read + add notes only on other teams' records

**Proposed visibility matrix:**

| Login as                     | Team Clients           | Other Clients      | Lead count |
| ---------------------------- | ---------------------- | ------------------ | ---------- |
| Tom (member, Team A)         | R/W own leads only     | No access          | 5          |
| Bob (member, Team B)         | R/W own + Team B leads | R + Add Notes only | 5          |
| Mike (manager, Team A)       | R/W Team A leads       | R + Add Notes only | 13         |
| Sarah (director, both teams) | R/W all                | R/W all            | 20         |
| Admin                        | R/W all (bypass)       | R/W all            | all        |

**Proposed assignment model — Team first, then Person:**

```
Team: Unassigned  → Person: Unassigned     (new lead, nobody owns it)
Team: Unassigned  → Person: Anyone          (no team restriction, any employee)
Team: Sales Team A → Person: Unassigned     (team owns it, no individual yet — team queue)
Team: Sales Team A → Person: Amy RepA2      (fully assigned — team + person)
Team: Sales Team A → Person: Mike ManagerA  (manager took ownership)
```

**Assignment rules:**

- No team selected → any employee can be assigned (or nobody)
- Team selected → only members of that team appear in person dropdown
- Team assigned + person unassigned = team work queue
- Changing team clears the person assignment
- Directors/admins can assign to any team
- Assigning to a person auto-sets team if they're on exactly one team
- Multi-team employees (directors) require explicit team selection

**Schema change required:**

- `assigned_to_team` column (FK → teams.id) on leads, contacts, accounts, opportunities, activities
- `assigned_to_team` = NULL means "Unassigned" team (same as current behavior)
- Two-tier visibility filter in `teamVisibility.js`: team scope vs org scope
- UI cascade: team dropdown → person dropdown (filtered by team members)

**Director problem solved:**
Sarah is on both teams. When she takes a lead, the assigner picks which team context. The team lives on the record, not derived from the employee.

---

## 2026-02-27 — Two-Tier Team Access Model Implementation

### Phase 1: Schema Migration ✅

Added `assigned_to_team` (UUID, FK → teams.id, nullable, ON DELETE SET NULL) to **all 6 entity tables** on both databases:

- leads, contacts, accounts, opportunities, activities, bizdev_sources
- Partial indexes: `idx_{table}_assigned_to_team` (WHERE NOT NULL)
- Composite indexes: `idx_{table}_tenant_team` (tenant_id, assigned_to_team)
- Applied to dev (`efzqxjpfewkrgpdootte`) and prod (`ehjlenywplgyiahgxkfj`)

Backfilled dev test data:

- Team A leads (13): Mike 5, Tom 5, Amy 3
- Team B leads (7): Jane 2, Bob 5
- Unassigned (5): NULL team + NULL person

### Phase 2: teamVisibility.js Rewrite ✅

`getVisibilityScope()` now returns expanded shape:

```javascript
{
  bypass: boolean,
  teamIds: string[],           // All teams visible (for list filtering)
  fullAccessTeamIds: string[], // Teams with full R/W (subset of teamIds)
  employeeIds: string[],       // Kept for backward compat + dropdown scoping
  mode: string,
  highestRole: 'director' | 'manager' | 'member' | 'none' | 'admin'
}
```

`applyVisibilityFilter()` now implements org-wide read:

- Team members → **no filter** (see all tenant records)
- No-team users → own + unassigned only (backward compatible fallback)
- Write access enforced per-record at route level via `getAccessLevel()`

New exported functions:

- `getAccessLevel(scope, recordTeamId, recordAssignedTo, userId)` → `'full'` | `'read_notes'` | `'none'`
- `isNotesOnlyUpdate(payload, noteFields)` → boolean (checks if PUT body only touches note fields)

Access matrix:
| User | Own records | Team records | Other team records | Unassigned |
|------|-----------|-------------|-------------------|------------|
| Tom (member, A) | full | read_notes | read_notes | read_notes |
| Mike (manager, A) | full | full | read_notes | full |
| Sarah (director, both) | full | full | full | full |
| Admin | full (bypass) | full | full | full |

### Phase 3: Route Updates ✅

All 6 v2 routes updated:

**GET (list) endpoints** — Two-tier org-wide read:

- Team members see ALL tenant records (no visibility filter needed)
- No-team users see own + unassigned only
- `assigned_to` column and all existing filtering UNTOUCHED (additive only)

**FK join + team name** — Added to list responses:

- leads: `team:teams!leads_assigned_to_team_fkey(id, name)` → `assigned_to_team_name`
- contacts: `team:teams!contacts_assigned_to_team_fkey(id, name)` → `assigned_to_team_name`
- accounts: `team:teams!accounts_assigned_to_team_fkey(id, name)` → `assigned_to_team_name`
- opportunities: `team:teams!opportunities_assigned_to_team_fkey(id, name)` → `assigned_to_team_name`
- activities: `team:teams!activities_assigned_to_team_fkey(id, name)` → `assigned_to_team_name`
- bizdevsources: via `select('*')` (different pattern, column comes through automatically)

**PUT endpoints** — Write access check:

- Fetch current record's `assigned_to` + `assigned_to_team`
- Call `getAccessLevel()` to determine access tier
- `access === 'none'` → 403
- `access === 'read_notes'` + non-notes update → 403 "You can only add notes to records outside your team"
- `access === 'full'` → allow update

**DELETE endpoints** — Write access check:

- Fetch current record, check `getAccessLevel()`
- Only `access === 'full'` allows deletion

**`/team-scope` endpoint** — Now returns:

- `teamIds`, `fullAccessTeamIds`, `highestRole` (in addition to existing `bypass`, `employeeIds`, `mode`)

### Files Modified

| Category        | Files                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Schema          | Supabase migration on both dev + prod (6 tables, 12 indexes each)                                    |
| Core visibility | backend/lib/teamVisibility.js (rewritten for two-tier)                                               |
| Route updates   | leads.v2.js, contacts.v2.js, accounts.v2.js, opportunities.v2.js, activities.v2.js, bizdevsources.js |

### Critical Design Decisions

1. **`assigned_to` NOT removed** — both columns coexist per handoff spec. All AiSHA identity context, pronoun resolution, Braid tools, and existing `assigned_to` filtering remain untouched.
2. **Org-wide read for team members** — list endpoints show ALL tenant records to anyone with team membership. This is a deliberate shift from the old binary model where you couldn't see other teams' records at all.
3. **Write protection at route level** — `applyVisibilityFilter` no longer restricts which records you see (for team members). Instead, `getAccessLevel` + `isNotesOnlyUpdate` enforce write restrictions per-record in PUT/DELETE handlers.
4. **Unassigned records** — managers/directors get full R/W, members get read_notes only.

### What's Next

1. **Phase 4**: Frontend cascade UI — team dropdown → person dropdown (filtered by team members)
2. **Phase 5**: Braid tool updates — add `assigned_to_team` parameter to all list/search tools
3. **Phase 6**: AiSHA identity context — add team info to system prompt
4. **Phase 7**: Backfill production data — populate `assigned_to_team` on existing records
5. Re-test full visibility matrix with all 6 test users
