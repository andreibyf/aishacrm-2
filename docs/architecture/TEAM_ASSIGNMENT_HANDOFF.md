# Team Assignment & User Permissions — Implementation Status

## Current Architecture (v3.0 — March 2026)

The system uses a **user-centric permissions model** where:

1. **Users** own all permission settings (`perm_*`, `nav_permissions`)
2. **Team membership** is managed through User Management, not Teams page
3. **Access levels** are per-assignment (view_own / view_team / manage_team)
4. **Employee records** are HR-only; team assignments shown read-only

---

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1. Schema Migration | `assigned_to_team` on all 6 entity tables | ✅ Complete |
| 2. teamVisibility.js | Two-tier access model | ✅ Complete |
| 3. Route Updates | Org-wide read, team FK join, write checks | ✅ Complete |
| 4. Frontend Cascade UI | Team→Person dropdown | ✅ Complete |
| 5. Braid Tool Updates | assigned_to_team param | ✅ Complete |
| 6. AiSHA Identity Context | Team info in system prompt | ✅ Complete |
| 7. User Permission Columns | perm_*, nav_permissions on users | ✅ Complete |
| 8. UserFormWizard | 5-step create/edit wizard | ✅ Complete |
| 9. Team Management Refactor | Read-only member list | ✅ Complete |
| 10. Employee Form Refactor | HR-only, reports_to added | ✅ Complete |
| 11. Employee Detail Panel | Team assignment card, reports_to | ✅ Complete |
| 12. Production Backfill | Populate assigned_to_team on existing | 🔲 Not started |

---

## Database Schema

### Supabase Projects

| Environment | Project ID |
|-------------|------------|
| Production | `ehjlenywplgyiahgxkfj` |
| Development | `efzqxjpfewkrgpdootte` |

### Key Tables

**users** (permissions owner):
```sql
users
├── perm_notes_anywhere BOOLEAN
├── perm_all_records BOOLEAN
├── perm_reports BOOLEAN
├── perm_employees BOOLEAN
├── perm_settings BOOLEAN
├── nav_permissions JSONB
├── employee_role TEXT (director | manager | employee)
└── ...
```

**team_members** (user-team assignments):
```sql
team_members
├── user_id UUID FK → users(id) -- PRIMARY link
├── employee_id UUID FK → employees(id) -- DEPRECATED, nullable
├── access_level TEXT (view_own | view_team | manage_team)
├── role TEXT (director | manager | member)
└── ...
```

**employees** (HR data):
```sql
employees
├── reports_to UUID FK → employees(id) -- manager hierarchy
└── ... HR fields (name, phone, dept, hire_date, etc.)
```

**Entity tables** (all 6):
```sql
├── assigned_to UUID FK → employees(id) -- individual owner
├── assigned_to_team UUID FK → teams(id) -- team owner
└── ...
```

---

## UI Components

### User Management (`Settings → User Management`)

- **UserFormWizard** — 5-step create/edit wizard
  1. Identity (email, name, password, employee_role)
  2. Teams (team assignments with access levels)
  3. Permissions (perm_* toggles)
  4. Navigation (25 module toggles)
  5. Review (summary)

### Teams Page (`Settings → Teams`)

- Create/edit/delete teams
- Set visibility mode (shared vs hierarchical)
- **Read-only member list** — badges showing who's on team
- Links to User Management for actual member assignment

### Employee Detail Panel

- HR info display
- **Team Assignment card** — read-only team badges with access levels
- **Reports To** — shows direct manager/supervisor
- "Manage Access" button → links to User Management

### Employee Form

- HR fields only (name, phone, department, job_title, etc.)
- **Reports To dropdown** — select direct supervisor
- CRM Access card (read-only) showing linked user + teams

---

## Access Control

### Access Levels

| Level | Meaning |
|-------|---------|
| `view_own` | See/edit only records assigned directly to user |
| `view_team` | See all team records, edit only own |
| `manage_team` | Full R/W on all team records |

### Org-Wide Permissions

| Permission | Effect |
|------------|--------|
| `perm_notes_anywhere` | Can add notes to any record |
| `perm_all_records` | Full R/W on all tenant records |
| `perm_reports` | Access Reports module (auto-enables nav) |
| `perm_employees` | Access Employees module (auto-enables nav) |
| `perm_settings` | Access Settings module (auto-enables nav) |

### Navigation Permissions

For a module to appear in sidebar:
1. Tenant `modulesettings` must enable it
2. User's `nav_permissions[module]` must be true

---

## API Endpoints

### Teams V2 (`/api/v2/teams`)

- `GET /api/v2/teams` — list teams
- `POST /api/v2/teams` — create team
- `PUT /api/v2/teams/:id` — update team
- `DELETE /api/v2/teams/:id` — soft delete
- `GET /api/v2/teams/user-memberships?user_id=...` — get user's teams
- `GET /api/v2/teams/employee-memberships?employee_id=...` — get employee's teams
- `POST /api/v2/teams/sync-user-memberships` — sync team memberships for user

### Users (`/api/users`)

- GET/PUT endpoints return all `perm_*` fields, `nav_permissions`, `employee_role`
- `POST /api/users/invite` — create new user with invitation

---

## Test Users (Dev Tenant)

Tenant: `b62b764d-4f27-4e20-a8ad-8eb9b2e1055c`

| User | Role | Team | Access | Password |
|------|------|------|--------|----------|
| sarah.director@test.com | admin | Sales A + B | manage_team | TestPass123! |
| mike.managera@test.com | manager | Sales A | manage_team | TestPass123! |
| tom.repa1@test.com | employee | Sales A | view_own | TestPass123! |

---

## Documentation

| Document | Location |
|----------|----------|
| User Permissions System | `docs/architecture/TEAM_VISIBILITY_SYSTEM.md` |
| Admin Guide | `docs/admin-guides/USER_PERMISSIONS_GUIDE.md` |
| Schema Reference | `docs/developer-docs/DATABASE_SCHEMA_REFERENCE.md` |
| System Overview | `docs/architecture/SYSTEM_OVERVIEW.md` |

---

## Remaining Work

### Phase 12: Production Data Backfill

Populate `assigned_to_team` on existing production records:
- Lookup each employee's team membership
- Single-team employees: auto-set their team
- Multi-team employees: leave NULL or use primary
- Unassigned records: leave NULL

---

_Document Version: 3.0_  
_Last Updated: March 2026_
