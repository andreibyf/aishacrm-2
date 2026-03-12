# Team Visibility & User Permissions System

## Overview

AishaCRM implements a comprehensive **user-centric permissions system** with team-based access control. This system manages both visibility (what users can see) and write permissions (what users can modify) based on user permissions, team membership, and role hierarchy.

**Key concepts:**

- **User Permissions** — Org-wide permissions stored on the `users` table (perm_*, nav_permissions)
- **Team Membership** — Users are assigned to teams with specific access levels (view_own/view_team/manage_team)
- **Two-tier access** — Full R/W on team records, read + notes on other teams' records
- **Navigation permissions** — Control which sidebar modules each user can access

---

## Architecture

### Data Model

```
users
├── id (UUID, PK)
├── email, first_name, last_name
├── role (text: 'superadmin' | 'admin' | 'manager' | 'employee')
├── employee_role (text: 'director' | 'manager' | 'employee')
├── tenant_id (UUID, FK → tenant.id)
├── perm_notes_anywhere (boolean) — can add notes to any record
├── perm_all_records (boolean) — full access to all tenant records
├── perm_reports (boolean) — access to Reports module
├── perm_employees (boolean) — access to Employees module  
├── perm_settings (boolean) — access to Settings module
├── nav_permissions (JSONB) — which sidebar modules to show
└── status (text)

employees
├── id (UUID, PK)
├── user_email (text) — links to users.email
├── reports_to (UUID, FK → employees.id) — manager/supervisor
├── tenant_id, first_name, last_name, department, job_title
└── other HR fields

teams
├── id (UUID, PK)
├── tenant_id (UUID, FK)
├── name (text)
├── parent_team_id (UUID, nullable — self-referential for hierarchy)
└── created_at

team_members
├── id (UUID, PK)
├── team_id (UUID, FK → teams)
├── user_id (UUID, FK → users) — PRIMARY link
├── employee_id (UUID, FK → employees, nullable) — DEPRECATED, for legacy
├── role (text: 'director' | 'manager' | 'member')
├── access_level (text: 'view_own' | 'view_team' | 'manage_team')
└── joined_at

Entity tables (leads, contacts, accounts, opportunities, activities, bizdev_sources)
├── assigned_to (UUID, FK → employees.id) — individual person
├── assigned_to_team (UUID, FK → teams.id, ON DELETE SET NULL) — team ownership
└── ... other entity fields
```

### User vs Employee

| Concept | Table | Purpose |
|---------|-------|---------|
| **User** | `users` | Authentication, permissions, system access |
| **Employee** | `employees` | HR data, organizational structure |

Users and employees are linked via **email address match**. A user may exist without an employee record (system users), and an employee may exist without a user record (non-CRM staff).

### Access Levels

| Access Level | Meaning |
|--------------|---------|
| `view_own` | Can only see/edit records assigned directly to them |
| `view_team` | Can see all team records, edit only their own |
| `manage_team` | Can see and edit all team records, assign work to members |

### Visibility Modes

**Hierarchical (default):**
- List endpoints: team members see ALL tenant records (org-wide read)
- Write access determined per-record by `getAccessLevel()`

**Shared:**
- All team members see everything, all have full R/W

---

## User Management

### User Creation Flow

Users are created via the **UserFormWizard** (5-step wizard):

1. **Identity** — email, name, password, tenant, employee_role, status
2. **Teams** — assign to teams with access levels
3. **Permissions** — perm_* toggles (reports, employees, settings, etc.)
4. **Navigation** — which sidebar modules to show (25 modules available)
5. **Review** — summary and confirmation

### Team Assignment

Team membership is managed through User Management, not the Teams page:
- Teams page shows read-only member list
- User Management wizard Step 2 controls team assignments
- Each team assignment includes an access level (view_own/view_team/manage_team)

### Permission Inheritance

| Permission | Auto-enables |
|------------|--------------|
| `perm_reports` | Reports nav module |
| `perm_employees` | Employees nav module |
| `perm_settings` | Settings nav module |

---

## Navigation Permissions

### Module List (25 modules)

**Primary Navigation (21):**
- Dashboard, Contacts, Accounts, Leads, Opportunities, Activities, Calendar
- ConstructionProjects, Workers, BizDevSources, CashFlow
- DocumentProcessing, DocumentManagement, AICampaigns
- Employees, Reports, Integrations, Workflows, PaymentPortal, Utilities, ClientOnboarding

**Secondary Navigation (4):**
- Documentation, DeveloperAI, ClientRequirements, Settings

### Default Settings

**ON by default:** Dashboard, Contacts, Accounts, Leads, Opportunities, Activities, Calendar, BizDevSources, ConstructionProjects, Workers, CashFlow, DocumentProcessing, DocumentManagement, AICampaigns, PaymentPortal, Documentation

**OFF by default:** Employees, Reports, Integrations, Workflows, Utilities, ClientOnboarding, DeveloperAI, ClientRequirements, Settings

### Visibility Logic

For a module to appear in the sidebar:
1. Tenant `modulesettings` must enable the module
2. User's `nav_permissions[module]` must be true

---

## Backend Implementation

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

### Teams V2 API (`backend/routes/teams.v2.js`)

**Team Management:**
- `GET /api/v2/teams` — list teams for tenant
- `POST /api/v2/teams` — create team
- `PUT /api/v2/teams/:id` — update team
- `DELETE /api/v2/teams/:id` — deactivate team (soft delete)

**Member Queries:**
- `GET /api/v2/teams/:id/members` — list members with employee details
- `GET /api/v2/teams/user-memberships?user_id=...` — get user's team memberships
- `GET /api/v2/teams/employee-memberships?employee_id=...` — get employee's team memberships
- `POST /api/v2/teams/sync-user-memberships` — sync all team memberships for a user

**Settings:**
- `GET /api/v2/teams/settings` — get visibility mode + labels
- `PUT /api/v2/teams/visibility-mode` — set visibility mode
- `GET /api/v2/teams/scope` — get current user's visibility scope

### Users API (`backend/routes/users.js`)

User endpoints return and accept all permission fields:
- `perm_notes_anywhere`, `perm_all_records`, `perm_reports`, `perm_employees`, `perm_settings`
- `nav_permissions` (JSONB)
- `employee_role`

### Access Matrix

| User | Own records | Team records | Other team records | Unassigned |
|------|-------------|--------------|-------------------|------------|
| Tom (member, A) | full | read_notes | read_notes | read_notes |
| Mike (manager, A) | full | full | read_notes | full |
| Sarah (director, both) | full | full | full | full |
| Admin | full (bypass) | full | full | full |

---

## Frontend Implementation

### User Management (`src/components/settings/EnhancedUserManagement.jsx`)

- Lists all users for tenant
- "Add User" button opens UserFormWizard in create mode
- "Edit" button opens UserFormWizard in edit mode for that user
- No more InviteUserDialog — wizard handles both create and edit

### UserFormWizard (`src/components/settings/UserFormWizard.jsx`)

5-step wizard for create/edit:
1. **Identity** — basic info + password
2. **Teams** — team assignments with access levels
3. **Permissions** — perm_* toggles
4. **Navigation** — module visibility toggles
5. **Review** — summary view

Props: `open, user, mode ('create'|'edit'), tenants, currentUser, onSave, onCancel, availableTeams, existingTeamMemberships`

### Team Management (`src/components/settings/TeamManagement.jsx`)

- Create/edit/delete teams
- Visibility mode toggle
- **Read-only member list** — shows who's on the team with badges
- Links to User Management for actual member assignment

### Employee Detail Panel (`src/components/employees/EmployeeDetailPanel.jsx`)

- Shows employee HR info
- **Team Assignment card** — read-only display of teams + access levels
- **Reports To field** — shows direct manager/supervisor
- "Manage Access" button → links to User Management

### Employee Form (`src/components/employees/EmployeeForm.jsx`)

- HR data only (name, phone, department, job title, hire date, etc.)
- **Reports To dropdown** — select direct supervisor
- CRM Access card (read-only) — shows linked user + team badges
- Links to User Management for permission changes

### Assignment Cascade (`src/components/shared/AssignmentField.jsx`)

Team→Person cascade:
- Team dropdown → Person dropdown with automatic filtering
- Changing team clears person if not on new team
- Assigning person auto-sets team if single-team employee
- Multi-team employees require explicit team selection

---

## Database Schema

### Key Tables

**users** — Authentication and permissions
- All perm_* columns (boolean)
- nav_permissions (JSONB)
- employee_role (text)

**team_members** — User-team assignments
- user_id (UUID, FK → users) — PRIMARY link
- employee_id (UUID, nullable) — legacy, being phased out
- access_level ('view_own' | 'view_team' | 'manage_team')

**employees** — HR data
- reports_to (UUID, FK → employees) — manager hierarchy

### Supabase Projects

- **Production**: `ehjlenywplgyiahgxkfj`
- **Development**: `efzqxjpfewkrgpdootte`

**Rule**: All schema changes must be applied to BOTH projects.

---

## Test Coverage

### Backend Tests

- `backend/__tests__/integration/userPermissions.integration.test.js` — 13 tests
- `backend/__tests__/lib/teamVisibility.test.js` — visibility scope tests
- `backend/__tests__/ai/aiTeamContext.test.js` — 58 tests

### Test Users (dev tenant)

Tenant: `b62b764d-4f27-4e20-a8ad-8eb9b2e1055c`

| User | Auth Role | Team | Team Role | Password |
|------|-----------|------|-----------|----------|
| sarah.director@test.com | admin | Sales A + B | director | TestPass123! |
| mike.managera@test.com | manager | Sales A | manager | TestPass123! |
| tom.repa1@test.com | employee | Sales A | member | TestPass123! |

---

## Implementation Status

| Component | Status |
|-----------|--------|
| User perm_* columns on users table | ✅ Complete |
| team_members.access_level column | ✅ Complete |
| team_members.user_id column | ✅ Complete |
| employees.reports_to column | ✅ Complete |
| UserFormWizard (5-step) | ✅ Complete |
| EnhancedUserManagement integration | ✅ Complete |
| Employee Form (HR-only) | ✅ Complete |
| Employee Detail Panel (team display) | ✅ Complete |
| TeamManagement (read-only members) | ✅ Complete |
| Navigation permissions (25 modules) | ✅ Complete |
| Backend permission checks | ✅ Complete |
| Integration tests | ✅ Complete |

---

## Separation of Concerns

| Component | Purpose |
|-----------|---------|
| **User Management** (Settings) | Create/edit users, assign teams + access levels, set permissions |
| **Teams & Visibility** (Settings) | Create/delete teams, set visibility mode, read-only member list |
| **Employee Form** | HR data only (dept, job title, phone, reports_to) |
| **Employee Detail** | View employee + team assignments (read-only) |

---

## Known Considerations

1. **Team membership is OPTIONAL** — users without team assignments see only records assigned directly to them.

2. **No team-level permissions** — teams are just groupings. Access level is set per-user-per-team.

3. **Cache TTL**: Visibility scope cached 60s. Team membership changes may take up to 60 seconds to reflect.

4. **Module visibility**: Both tenant modulesettings AND user nav_permissions must be true for a module to appear.

5. **reports_to hierarchy**: Used for display only; doesn't affect data access (that's controlled by team membership).

---

_Document Version: 3.0_  
_Last Updated: March 2026_
