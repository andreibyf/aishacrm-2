# AICampaigns Multi-Channel Overhaul — Session Journal

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
