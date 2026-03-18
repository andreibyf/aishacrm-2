# AishaCRM Database Schema Reference

**Version:** 1.0  
**Last Updated:** March 2026  
**Database:** PostgreSQL 15+ / Supabase

---

## Quick Reference

### Supabase Project IDs

| Environment | Project ID             |
| ----------- | ---------------------- |
| Production  | `ehjlenywplgyiahgxkfj` |
| Development | `efzqxjpfewkrgpdootte` |

**Rule:** All schema changes must be applied to BOTH projects.

---

## Core Tables

### users

Authentication and system access.

```sql
users
├── id UUID PRIMARY KEY
├── email TEXT NOT NULL UNIQUE
├── first_name TEXT
├── last_name TEXT
├── role TEXT (superadmin | admin | manager | employee)
├── employee_role TEXT (director | manager | employee)
├── tenant_id UUID REFERENCES tenant(id)
├── status TEXT (active | inactive)
├── nav_permissions JSONB -- sidebar module visibility
├── perm_notes_anywhere BOOLEAN DEFAULT false
├── perm_all_records BOOLEAN DEFAULT false
├── perm_reports BOOLEAN DEFAULT false
├── perm_employees BOOLEAN DEFAULT false
├── perm_settings BOOLEAN DEFAULT false
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

**Key columns added March 2026:**

- `employee_role` — organizational role (director/manager/employee)
- `nav_permissions` — JSONB controlling which sidebar modules user sees
- `perm_*` — organization-wide permission flags

---

### employees

HR data for staff members.

```sql
employees
├── id UUID PRIMARY KEY
├── tenant_id UUID REFERENCES tenant(id)
├── first_name TEXT
├── last_name TEXT
├── email TEXT
├── phone TEXT
├── mobile TEXT
├── department TEXT
├── job_title TEXT
├── reports_to UUID REFERENCES employees(id) -- manager/supervisor
├── employment_status TEXT (active | inactive | on_leave | terminated)
├── employment_type TEXT (full_time | part_time | contractor | intern)
├── hire_date DATE
├── hourly_rate NUMERIC
├── whatsapp_number TEXT
├── whatsapp_enabled BOOLEAN
├── status TEXT
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

**Key columns added March 2026:**

- `reports_to` — UUID FK to employees.id for organizational hierarchy

**Note:** Employees are linked to users via email address match.

---

### teams

Team groupings for visibility/access control.

```sql
teams
├── id UUID PRIMARY KEY
├── tenant_id UUID REFERENCES tenant(id)
├── name TEXT NOT NULL
├── parent_team_id UUID REFERENCES teams(id) -- hierarchy
├── is_active BOOLEAN DEFAULT true
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

---

### team_members

User-team assignments with access levels.

```sql
team_members
├── id UUID PRIMARY KEY
├── team_id UUID REFERENCES teams(id)
├── user_id UUID REFERENCES users(id) -- PRIMARY link
├── employee_id UUID REFERENCES employees(id) -- DEPRECATED, nullable
├── role TEXT (director | manager | member)
├── access_level TEXT (view_own | view_team | manage_team)
├── joined_at TIMESTAMPTZ DEFAULT now()
└── created_at TIMESTAMPTZ
```

**Key columns added March 2026:**

- `user_id` — direct link to users table (PRIMARY)
- `access_level` — granular access control per assignment
- `employee_id` made nullable (being phased out)

**Access levels:**
| Level | Description |
|-------|-------------|
| `view_own` | See/edit only records assigned directly to user |
| `view_team` | See all team records, edit only own |
| `manage_team` | Full R/W on all team records |

---

## Entity Tables

All entity tables share these common columns:

```sql
-- Common columns on all entity tables
├── id UUID PRIMARY KEY
├── tenant_id UUID REFERENCES tenant(id)
├── assigned_to UUID REFERENCES employees(id) -- individual owner
├── assigned_to_team UUID REFERENCES teams(id) -- team owner
├── created_at TIMESTAMPTZ
├── updated_at TIMESTAMPTZ
└── metadata JSONB
```

### leads

```sql
leads
├── [common columns]
├── first_name TEXT
├── last_name TEXT
├── email TEXT
├── phone TEXT
├── company TEXT
├── status TEXT
├── source TEXT
├── estimated_value NUMERIC
└── notes TEXT
```

### contacts

> **⚠️ Critical:** `contacts` has NO `company` column. Company is derived by joining the `accounts` table via `account_id`. In Supabase client: `accounts!contacts_account_id_fkey(name)`. Frontend sees this as `contact.account_name` (populated in `contacts.v2.js`).

```sql
contacts
├── [common columns]
├── first_name TEXT
├── last_name TEXT
├── email TEXT
├── phone TEXT
├── account_id UUID REFERENCES accounts(id) -- company name via join only
├── title TEXT
├── department TEXT
└── notes TEXT
```

**Getting company name in queries:**
```javascript
// Supabase query
.select('*, accounts!contacts_account_id_fkey(id, name)')
// Result: row.account = { id, name }  → flatten to row.account_name = row.account.name
```

### accounts

```sql
accounts
├── [common columns]
├── name TEXT
├── industry TEXT
├── website TEXT
├── phone TEXT
├── annual_revenue NUMERIC
├── employee_count INTEGER
└── notes TEXT
```

### opportunities

```sql
opportunities
├── [common columns]
├── name TEXT
├── account_id UUID REFERENCES accounts(id)
├── contact_id UUID REFERENCES contacts(id)
├── stage TEXT
├── amount NUMERIC
├── close_date DATE
├── probability INTEGER
└── notes TEXT
```

### activities

```sql
activities
├── [common columns]
├── type TEXT (call | email | meeting | task | note)
├── subject TEXT
├── description TEXT
├── status TEXT (pending | completed | cancelled | in_progress | overdue)
├── due_date TIMESTAMPTZ
├── due_time TEXT
├── completed_at TIMESTAMPTZ
├── related_to TEXT (lead | contact | account | opportunity | bizdev_source)
├── related_id UUID
├── related_name TEXT -- denormalized display name (populated by lookupRelatedEntity)
├── related_email TEXT
├── priority TEXT (low | medium | high)
├── is_ai_generated BOOLEAN DEFAULT false
├── ai_context JSONB -- AI enrichment context
└── draft_body TEXT -- AI email draft content
```

**Note on `related_name` population:** The `activities.v2.js` `lookupRelatedEntity` function resolves the display name at write time. For contacts, this joins `accounts!contacts_account_id_fkey(name)` to get the company name as fallback.

### bizdev_sources

Top-of-funnel potential leads.

```sql
bizdev_sources
├── [common columns]
├── name TEXT
├── company TEXT
├── email TEXT
├── phone TEXT
├── source TEXT
├── status TEXT
├── potential_value NUMERIC
└── notes TEXT
```

---

## System Tables

### tenant

Multi-tenant isolation.

```sql
tenant
├── id UUID PRIMARY KEY
├── name TEXT
├── slug TEXT UNIQUE
├── status TEXT (active | inactive | suspended)
├── settings JSONB
├── metadata JSONB
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

### module_settings

Per-tenant module configuration.

```sql
module_settings
├── id UUID PRIMARY KEY
├── tenant_id UUID REFERENCES tenant(id)
├── module_name TEXT
├── is_enabled BOOLEAN
├── settings JSONB
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

### entity_labels

Custom entity naming per tenant.

```sql
entity_labels
├── id UUID PRIMARY KEY
├── tenant_id UUID REFERENCES tenant(id)
├── entity_key TEXT (accounts | contacts | leads | etc.)
├── custom_label TEXT -- plural form
├── custom_label_singular TEXT
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

### ai_suggestions

AI-generated action suggestions pending human approval (used by the AI email draft and C.A.R.E. pipeline).

```sql
ai_suggestions
├── id UUID PRIMARY KEY
├── tenant_id UUID REFERENCES tenant(id)
├── trigger_id TEXT -- e.g. 'playbook_email', 'care_trigger'
├── record_type TEXT (lead | contact | account | opportunity | activity)
├── record_id UUID
├── status TEXT (pending | approved | rejected | executed)
├── action JSONB  -- { tool_name, tool_args, ... }
├── confidence NUMERIC
├── reasoning TEXT
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

**Flow:** C.A.R.E. or AI email routes insert with `status='pending'` → user reviews in UI → approval sets `status='approved'` → `emailWorker` or C.A.R.E. executor picks up and acts.

---

### tenant_integrations

Per-tenant third-party integration configuration and runtime state.

```sql
tenant_integrations
├── id UUID PRIMARY KEY
├── tenant_id UUID REFERENCES tenant(id)
├── integration_type TEXT (calcom | communications | stripe | ...)
├── config JSONB        -- normalized provider config (no plaintext secrets)
├── api_credentials JSONB -- secret references (e.g. COMM_INBOUND_PASS ref)
├── metadata JSONB      -- runtime state (e.g. sync cursor, last_synced_at)
├── is_active BOOLEAN DEFAULT true
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

**Communications sync cursor** is stored in `metadata.communications.sync.cursor` (see `COMMUNICATIONS_CONFIG_SCHEMA.md`).

---

## Audit & History Tables

### assignment_history

Tracks record assignment changes.

```sql
assignment_history
├── id UUID PRIMARY KEY
├── tenant_id UUID
├── entity_type TEXT (lead | contact | account | etc.)
├── entity_id UUID
├── assigned_from UUID
├── assigned_to UUID
├── assigned_by UUID
├── action TEXT (assign | unassign | reassign | escalate)
├── note TEXT
└── created_at TIMESTAMPTZ
```

### care_audit_log

C.A.R.E. autonomous action logging.

```sql
care_audit_log
├── id UUID PRIMARY KEY
├── tenant_id UUID
├── event_type TEXT
├── entity_type TEXT
├── entity_id UUID
├── action_origin TEXT (human | care_autonomous)
├── reason TEXT
├── metadata JSONB
└── created_at TIMESTAMPTZ
```

### care_states

C.A.R.E. behavioral state tracking.

```sql
care_states
├── id UUID PRIMARY KEY
├── tenant_id UUID
├── entity_type TEXT
├── entity_id UUID
├── current_state TEXT
├── previous_state TEXT
├── transitioned_at TIMESTAMPTZ
├── transition_reason TEXT
├── metadata JSONB
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

---

## C.A.R.E. Autonomy Tables

### care_playbook

Autonomy playbook definitions.

```sql
care_playbook
├── id UUID PRIMARY KEY
├── tenant_id UUID REFERENCES tenant(id)
├── name TEXT
├── description TEXT
├── trigger_event TEXT
├── target_entity_type TEXT
├── is_active BOOLEAN
├── steps JSONB -- array of step definitions
├── metadata JSONB
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ
```

### care_playbook_execution

Playbook execution history.

```sql
care_playbook_execution
├── id UUID PRIMARY KEY
├── tenant_id UUID
├── playbook_id UUID REFERENCES care_playbook(id)
├── entity_type TEXT
├── entity_id UUID
├── status TEXT (pending | running | completed | failed)
├── current_step INTEGER
├── started_at TIMESTAMPTZ
├── completed_at TIMESTAMPTZ
├── results JSONB
├── error TEXT
└── created_at TIMESTAMPTZ
```

---

## Indexes

### Team Visibility Indexes

```sql
-- Entity table indexes for team assignment
CREATE INDEX idx_leads_assigned_to_team ON leads(assigned_to_team) WHERE assigned_to_team IS NOT NULL;
CREATE INDEX idx_leads_tenant_team ON leads(tenant_id, assigned_to_team);

CREATE INDEX idx_contacts_assigned_to_team ON contacts(assigned_to_team) WHERE assigned_to_team IS NOT NULL;
CREATE INDEX idx_contacts_tenant_team ON contacts(tenant_id, assigned_to_team);

-- Similar indexes exist for accounts, opportunities, activities, bizdev_sources
```

### User/Employee Indexes

```sql
CREATE INDEX idx_employees_reports_to ON employees(reports_to);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
```

---

## Foreign Key Constraints

### Entity Tables

All entity tables have FK constraints to teams:

```sql
-- Example: leads
ALTER TABLE leads ADD CONSTRAINT leads_assigned_to_team_fkey
  FOREIGN KEY (assigned_to_team) REFERENCES teams(id) ON DELETE SET NULL;

-- Similar constraints for: contacts, accounts, opportunities, activities, bizdev_sources
```

### Employee Hierarchy

```sql
ALTER TABLE employees ADD CONSTRAINT employees_reports_to_fkey
  FOREIGN KEY (reports_to) REFERENCES employees(id) ON DELETE SET NULL;
```

### Team Members

```sql
ALTER TABLE team_members ADD CONSTRAINT team_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

---

## JSONB Column Patterns

### nav_permissions (users)

```json
{
  "Dashboard": true,
  "Contacts": true,
  "Accounts": true,
  "Leads": true,
  "Reports": false,
  "Employees": false,
  "Settings": false
}
```

### metadata (common pattern)

```json
{
  "source": "web_form",
  "campaign_id": "uuid",
  "custom_fields": {},
  "tags": ["high-value", "enterprise"],
  "last_activity_at": "2026-03-11T10:00:00Z"
}
```

### steps (care_playbook)

```json
[
  {
    "order": 1,
    "type": "wait",
    "config": { "duration_days": 1 }
  },
  {
    "order": 2,
    "type": "send_email",
    "config": { "template_id": "uuid" }
  },
  {
    "order": 3,
    "type": "create_activity",
    "config": { "type": "task", "subject": "Follow up" }
  }
]
```

---

## Migration Guidelines

### Always Apply to Both Projects

```bash
# Apply migration to production
supabase db push --project-ref ehjlenywplgyiahgxkfj

# Apply migration to development
supabase db push --project-ref efzqxjpfewkrgpdootte
```

### Or use Supabase MCP:

```javascript
// Apply to production
Supabase:apply_migration(project_id="ehjlenywplgyiahgxkfj", ...)

// Apply to development
Supabase:apply_migration(project_id="efzqxjpfewkrgpdootte", ...)
```

### Common Migration Patterns

**Add nullable column:**

```sql
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name TYPE;
```

**Add FK with ON DELETE SET NULL:**

```sql
ALTER TABLE table_name ADD COLUMN column_name UUID REFERENCES other_table(id) ON DELETE SET NULL;
```

**Add index:**

```sql
CREATE INDEX IF NOT EXISTS idx_name ON table_name(column_name);
```

---

_Document Version: 1.0_  
_Last Updated: March 2026_
