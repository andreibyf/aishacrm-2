# User Permissions & Team Management Guide

**Version 1.1** | **Updated: April 2026** (Reflects permission hardening Waves 1–8)

This guide covers the user permissions system, team assignments, and navigation controls in AishaCRM. All access controls are strictly enforced at the backend level with per-record team visibility checks.

---

## Table of Contents

1. [Overview](#overview)
2. [User Management Wizard](#user-management-wizard)
3. [Team Assignments](#team-assignments)
4. [Org-Wide Permissions](#org-wide-permissions)
5. [Navigation Permissions](#navigation-permissions)
6. [Employee Management](#employee-management)
7. [Teams Page](#teams-page)
8. [Access Control Matrix](#access-control-matrix)

---

## Overview

AishaCRM uses a **user-centric permissions model** where all access controls are managed through User Management:

| Component            | Purpose                                                         |
| -------------------- | --------------------------------------------------------------- |
| **User Management**  | Create users, assign teams, set permissions, control navigation |
| **Teams Page**       | Create/edit teams, set visibility mode (read-only member list)  |
| **Employee Records** | HR data only (name, phone, department, reports_to)              |

### Key Principles

1. **Users own permissions** — all access settings are on the user record
2. **Teams are groupings** — teams have no inherent permissions
3. **Access levels are per-assignment** — each user-team link has its own access level
4. **Navigation is controllable** — admins can show/hide sidebar modules per user

---

## User Management Wizard

### Accessing User Management

1. Navigate to **Settings → User Management**
2. Click **Add User** to create new users
3. Click **Edit** (pencil icon) on any user row to modify

### 5-Step Wizard

#### Step 1: Identity

| Field         | Description                              |
| ------------- | ---------------------------------------- |
| Email\*       | Login email (editable only on create)    |
| Full Name\*   | Display name                             |
| Password      | Required for create, optional for edit   |
| Tenant        | Superadmin only — which client to assign |
| Employee Role | director / manager / employee            |
| Status        | active / inactive                        |

#### Step 2: Teams

Assign the user to one or more teams with specific access levels:

| Access Level    | Description                                           |
| --------------- | ----------------------------------------------------- |
| **View Own**    | Can only see/edit records assigned directly to them   |
| **View Team**   | Can see all team records, edit only their own         |
| **Manage Team** | Can see/edit all team records, assign work to members |

**How it works:**

- Check the box next to each team to assign
- Select the access level for each assignment
- Users can belong to multiple teams with different access levels

#### Step 3: Permissions

Toggle organization-wide permissions. Without specific permissions, users enter **read_only access mode** (can view records within their scope but cannot edit non-note fields):

| Permission             | Effect                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| **Notes Anywhere**     | Can add notes to any record in the tenant; still cannot edit other fields on out-of-scope records |
| **All Records Access** | Bypasses all team/scope restrictions; full R/W access to all tenant records                       |
| **Reports Access**     | Can access Reports module                                                                         |
| **Employees Access**   | Can access Employees module                                                                       |
| **Settings Access**    | Can access Settings module                                                                        |

#### Step 4: Navigation

Control which sidebar modules the user sees. 25 modules available:

**Default ON:**

- Dashboard, Contacts, Accounts, Leads, Opportunities, Activities
- Calendar, BizDevSources, ConstructionProjects, Workers
- CashFlow, DocumentProcessing, DocumentManagement, AICampaigns
- PaymentPortal, Documentation

**Default OFF:**

- Employees, Reports, Integrations, Workflows, Utilities
- ClientOnboarding, DeveloperAI, ClientRequirements, Settings

**Auto-enabled:** When you enable perm_reports, perm_employees, or perm_settings, the corresponding nav module is automatically enabled.

#### Step 5: Review

Summary of all settings with:

- Plain English description
- Derived role badge (Admin / Leadership / User)
- Team assignments with access levels
- Enabled navigation modules

---

## Team Assignments

### Understanding Access Levels

Each team assignment has an access level that determines what the user can do on that team's records. All restrictions are enforced at the backend route level.

```
┌─────────────────────────────────────────────────┐
│  Access Level: view_own                         │
│  - See only records assigned directly to me     │
│  - Edit only my own records                     │
│  - Can add notes (if not blocked by rules)      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Access Level: view_team                        │
│  - See all team records (including unassigned)  │
│  - Edit only records assigned directly to me    │
│  - Add notes to any team record                 │
│  - Cannot edit other fields on teammates'       │
│    records (read_only enforcement)              │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Access Level: manage_team                      │
│  - See all team records                         │
│  - Edit and reassign any team record            │
│  - Assign/reassign work to team members         │
│  - Full write access on all team records        │
└─────────────────────────────────────────────────┘
```

### Multi-Team Users

Users can belong to multiple teams. Their effective access is the **union** of all team permissions:

**Example:** Sarah is a director on Sales A (manage_team) and Sales B (manage_team)

- She can manage records on both teams
- She sees all records from both teams in list views
- Her "highest role" is director

### Users Without Teams

Users who aren't assigned to any team:

- Only see records assigned directly to them
- Cannot see team-owned records
- Can still create new records (assigned to themselves)

---

## Org-Wide Permissions

### Admin/Superadmin Precedence

Users with **admin** or **superadmin** role automatically bypass all team restrictions:

- Full access to all records regardless of team assignment
- Access to all modules and settings
- No need to explicitly set perm_all_records (though it may be set)

### User-Level Org Permissions

These permissions override or extend team-based restrictions:

### perm_all_records

- Full read/write access to ALL tenant records
- Useful for admins who need unrestricted access
- Overrides team-based restrictions

### perm_notes_anywhere

- Can add notes to any record
- Cannot edit other fields on records outside their scope
- Useful for support roles that need to document interactions

### perm_reports

- Access to Reports module
- Automatically enables Reports in navigation
- Typically for managers and above

### perm_employees

- Access to Employees module
- Automatically enables Employees in navigation
- Typically for HR and admins

### perm_settings

- Access to Settings module
- Automatically enables Settings in navigation
- Typically for admins only

---

## Navigation Permissions

### How Navigation Works

For a module to appear in the sidebar:

1. **Tenant level**: Module must be enabled in `modulesettings`
2. **User level**: Module must be true in user's `nav_permissions`

Both conditions must be met.

### Available Modules (25)

| Module              | Key                  | Default |
| ------------------- | -------------------- | ------- |
| Dashboard           | Dashboard            | ON      |
| Contacts            | Contacts             | ON      |
| Accounts            | Accounts             | ON      |
| Leads               | Leads                | ON      |
| Opportunities       | Opportunities        | ON      |
| Activities          | Activities           | ON      |
| Calendar            | Calendar             | ON      |
| Project Management  | ConstructionProjects | ON      |
| Workers             | Workers              | ON      |
| Potential Leads     | BizDevSources        | ON      |
| Cash Flow           | CashFlow             | ON      |
| Document Processing | DocumentProcessing   | ON      |
| Document Management | DocumentManagement   | ON      |
| AI Campaigns        | AICampaigns          | ON      |
| Payment Portal      | PaymentPortal        | ON      |
| Documentation       | Documentation        | ON      |
| Employees           | Employees            | OFF     |
| Reports             | Reports              | OFF     |
| Integrations        | Integrations         | OFF     |
| Workflows           | Workflows            | OFF     |
| Utilities           | Utilities            | OFF     |
| Client Onboarding   | ClientOnboarding     | OFF     |
| Developer AI        | DeveloperAI          | OFF     |
| Client Requirements | ClientRequirements   | OFF     |
| Settings            | Settings             | OFF     |

---

## Employee Management

### Purpose

The Employee record contains **HR data only**:

- Name, phone, mobile, email
- Department, job title
- Hire date, employment status/type
- **Reports To** (direct supervisor)
- Address, emergency contact

### Reports To Field

New field for organizational hierarchy:

- Select the employee's direct manager/supervisor
- Displays on Employee Detail Panel
- Used for org chart visualization

### CRM Access

Employee records show **read-only** CRM access info:

- Linked user email (if any)
- Team assignments as badges
- Link to "Manage in User Settings" for permission changes

**Important:** Syncing Employee data no longer overwrites User permissions. If you modify user permissions in User Management, those settings are preserved independently from Employee record changes.

### Separation of Concerns

| In Employee Form            | In User Management               |
| --------------------------- | -------------------------------- |
| HR data (name, phone, dept) | Authentication (email, password) |
| Job title, hire date        | Team assignments                 |
| Reports To (manager)        | Permissions (perm\_\*)           |
| Employment status           | Navigation modules               |

---

## Teams Page

### What Teams Page Does

- Create, edit, delete teams
- Set team visibility mode (shared vs hierarchical)
- Customize terminology (role labels, tier labels)

### What Teams Page Does NOT Do

- Assign members (use User Management)
- Set access levels (use User Management)
- Manage individual permissions (use User Management)

### Member List

The Teams page shows a **read-only** member list:

- Badges for each team member
- Access level shown per member
- Link to "Manage members in User Settings"

### Visibility Modes

| Mode             | Description                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Hierarchical** | Users with view_team/manage_team see team records; write access is determined by their access level (per-record backend enforcement) |
| **Shared**       | All team members have full R/W on all team records, including unassigned records (regardless of access level)                        |

**Unassigned Records:**

- In **hierarchical** mode: Visible only to users with manage_team or perm_all_records
- In **shared** mode: Visible and editable by all team members

---

## Access Control Matrix

### Record-Level Access (Hierarchical Team Mode)

| User Type          | Own Records | Team Records  | Other Teams   | Unassigned                | Notes                                  |
| ------------------ | ----------- | ------------- | ------------- | ------------------------- | -------------------------------------- |
| view_own           | R/W         | Read + Notes  | Read + Notes  | Read + Notes              | Cannot edit teammates' records         |
| view_team          | R/W         | Read + Notes  | Read + Notes  | Read-only (if applicable) | Can view but not edit team records     |
| manage_team        | R/W         | R/W           | Read + Notes  | R/W                       | Can reassign and edit team records     |
| Multi-team (mixed) | R/W         | R/W (or Read) | R/W (or Read) | R/W (or Read)             | Effective access is union of all roles |
| perm_all_records   | R/W         | R/W           | R/W           | R/W                       | Overrides all team restrictions        |
| Admin/Superadmin   | R/W         | R/W           | R/W           | R/W                       | Automatic admin bypass (all routes)    |

### Record-Level Access (Shared Team Mode)

| User Type        | Team Records | Unassigned Records |
| ---------------- | ------------ | ------------------ |
| Any access level | R/W          | R/W                |
| perm_all_records | R/W          | R/W                |
| Admin/Superadmin | R/W          | R/W                |

### Module Access

| User Type      | Standard Modules | Employees | Reports | Settings |
| -------------- | ---------------- | --------- | ------- | -------- |
| Basic User     | As configured    | ❌        | ❌      | ❌       |
| perm_employees | As configured    | ✅        | ❌      | ❌       |
| perm_reports   | As configured    | ❌        | ✅      | ❌       |
| perm_settings  | As configured    | ❌        | ❌      | ✅       |
| Admin          | All              | ✅        | ✅      | ✅       |

---

## Quick Reference

### Creating a New User

1. Settings → User Management → Add User
2. Enter email, name, password
3. Assign to team(s) with access level
4. Toggle needed permissions
5. Configure navigation modules
6. Review and save

### Changing User Permissions

1. Settings → User Management → Edit (pencil icon)
2. Navigate to relevant step
3. Toggle permissions as needed
4. Review and save

### Viewing Employee's Team

1. Employees page → Click employee
2. See "Team Assignment" card in detail panel
3. Click "Manage Access" to edit in User Management

### Setting Manager Hierarchy

1. Employees page → Edit employee
2. Select "Reports To" dropdown
3. Choose direct supervisor
4. Save

---

_Document Version: 1.1_  
_Last Updated: April 2026_  
_Reflects permission hardening Waves 1–8 (PR #487–#493): team visibility normalization, bulk-operation hardening, admin precedence, and backend route enforcement._
