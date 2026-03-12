# Documentation Updates — March 2026

## Summary

Updated documentation to reflect the new user-centric permissions model with team-based access control.

---

## Documents Created

| Document                         | Location               | Description                                                                      |
| -------------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| **USER_PERMISSIONS_GUIDE.md**    | `docs/admin-guides/`   | Complete admin guide for user permissions, team assignments, navigation controls |
| **DATABASE_SCHEMA_REFERENCE.md** | `docs/developer-docs/` | Quick reference for all database tables with column details                      |

---

## Documents Updated

| Document                       | Location               | Key Changes                                       |
| ------------------------------ | ---------------------- | ------------------------------------------------- |
| **TEAM_VISIBILITY_SYSTEM.md**  | `docs/architecture/`   | Complete rewrite for v3.0 user-centric model      |
| **TEAM_ASSIGNMENT_HANDOFF.md** | `docs/architecture/`   | Updated implementation status, new schema details |
| **SYSTEM_OVERVIEW.md**         | `docs/architecture/`   | Added User Permissions section, updated doc index |
| **ADMIN_GUIDE.md**             | `docs/admin-guides/`   | Version bump to 3.0, March 2026                   |
| **USER_GUIDE.md**              | `docs/user-guides/`    | Version bump to 3.0, March 2026                   |
| **DATABASE_GUIDE.md**          | `docs/developer-docs/` | Version bump to 2.0, March 2026                   |

---

## Key Concepts Documented

### User-Centric Permissions Model

1. **Users own all permissions** — `perm_*` flags and `nav_permissions` on users table
2. **Team membership via User Management** — not Teams page
3. **Access levels per assignment** — view_own / view_team / manage_team
4. **Employee records are HR-only** — team assignments shown read-only

### New Database Columns

| Table          | Column                | Description                              |
| -------------- | --------------------- | ---------------------------------------- |
| `users`        | `perm_notes_anywhere` | Can add notes to any record              |
| `users`        | `perm_all_records`    | Full R/W on all tenant records           |
| `users`        | `perm_reports`        | Access Reports module                    |
| `users`        | `perm_employees`      | Access Employees module                  |
| `users`        | `perm_settings`       | Access Settings module                   |
| `users`        | `nav_permissions`     | JSONB controlling sidebar modules        |
| `users`        | `employee_role`       | director / manager / employee            |
| `team_members` | `user_id`             | Primary link to users table              |
| `team_members` | `access_level`        | view_own / view_team / manage_team       |
| `employees`    | `reports_to`          | FK to employees.id for manager hierarchy |

### UI Components

| Component                  | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| **UserFormWizard**         | 5-step create/edit wizard for users      |
| **EnhancedUserManagement** | User list with Add/Edit buttons          |
| **TeamManagement**         | Teams page with read-only member list    |
| **EmployeeForm**           | HR data only with Reports To dropdown    |
| **EmployeeDetailPanel**    | Team Assignment card, Reports To display |

---

## Project Files to Update

The following project knowledge files should be replaced with updated versions from the repo:

| Project File                       | Repo Source                                    |
| ---------------------------------- | ---------------------------------------------- |
| `team-visibility-system.md`        | `docs/architecture/TEAM_VISIBILITY_SYSTEM.md`  |
| `team-assignment-handoff.md`       | `docs/architecture/TEAM_ASSIGNMENT_HANDOFF.md` |
| `team-visibility-admin-guide.docx` | (needs regeneration from new content)          |

---

## Next Steps

1. **Rebuild containers**: `docker compose build frontend backend && docker compose up -d`
2. **Test wizard flows**: Create user, edit user, verify team assignments
3. **Update project knowledge**: Replace outdated project files with new versions
4. **Verify sidebar**: Confirm nav_permissions respected in Layout.jsx

---

_Document created: March 11, 2026_
