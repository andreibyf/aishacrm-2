# Identity Model — Users, Employees, Teams

> **Read first**: [`TEAM_VISIBILITY_SYSTEM.md`](./TEAM_VISIBILITY_SYSTEM.md) for the full access-control model and ER diagram. This document is the **contract checklist** — what every contributor (human or AI) needs to know to avoid the failure modes that have actually bitten us.

## Why this doc exists

We've shipped three bugs (4VD-44, the canceled 4VD-53, and 4VD-54) and one false-positive investigation because the user-vs-employee distinction wasn't obvious. The data model is documented; the **contract** wasn't.

This doc states the contract in one place.

---

## The four tables

| Table                 | Purpose                                                                                                                        | Primary key              | Join key                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------- |
| `public.users`        | Auth identity. One row per Supabase Auth user. Has `role` (`user`/`admin`/`superadmin`), `tenant_id`, `perm_*` flags.          | `users.id` (UUID)        | `users.email`                               |
| `public.employees`    | CRM identity. "Person who works for this tenant." Has HR fields (`first_name`, `last_name`, `department`, `reports_to`, etc.). | `employees.id` (UUID)    | `employees.user_email`                      |
| `public.teams`        | Tenant-scoped grouping. Self-referential `parent_team_id` for hierarchy.                                                       | `teams.id` (UUID)        | —                                           |
| `public.team_members` | Join. Users belong to teams with an `access_level`.                                                                            | `team_members.id` (UUID) | `user_id` (primary), `employee_id` (legacy) |

**The link between `users` and `employees` is the email address (case-insensitive, RFC 5321).** There is no FK column joining them directly.

---

## The contract (read this every time you touch user identity)

### 1. `users` and `employees` are NOT the same row

A row in `users` does not imply a row in `employees` and vice versa.

- A **user without an employee** is valid: clients, customer-portal logins, external collaborators who need to log in but aren't on staff.
- An **employee without a user** is valid: staff who are in the org chart but don't need CRM login access.

### 2. `users.id` ≠ `employees.id` ever

Every FK that points at "an assigned person" on an entity table (`leads.assigned_to`, `contacts.assigned_to`, `accounts.assigned_to`, `opportunities.assigned_to`, `activities.assigned_to`, `bizdev_sources.assigned_to`) FKs to **`employees.id`** — never `users.id`.

If you have a `users.id` and need an `employees.id`, look it up:

```sql
SELECT id FROM public.employees
WHERE tenant_id = $1
  AND email ILIKE $2   -- ILIKE because RFC 5321 says email local-part is case-insensitive
LIMIT 1;
```

Helper: `backend/lib/resolveAssignedTo.js` (see 4VD-44 for the regression that motivated it).

### 3. `team_members` joins by `user_id`, not `employee_id`

`team_members.user_id` is the **PRIMARY** FK link. `team_members.employee_id` is **legacy and being phased out** (see `TEAM_VISIBILITY_SYSTEM.md` line 53). When checking team membership, query by `user_id`.

### 4. Multiple employees per person is possible (and happens)

A single physical person can have multiple `employees` rows on the same tenant if they have multiple email addresses configured. Example from staging:

| `users.email`                                | `users.id`  | `employees.id` |
| -------------------------------------------- | ----------- | -------------- |
| `abyfield@4vdataconsulting.com` (superadmin) | `214086c9…` | `83344ce7…`    |
| `andrei.byfield@gmail.com` (user)            | `15e53d3e…` | `eb85fb7c…`    |

The CRM has no concept of "same person, two emails." Activities created while logged in as one email are assigned to that email's `employees.id` and will be invisible (under non-admin visibility) when logged in as the other email — because team_members.user_id only matches one of them.

**If you need a single canonical employee identity across multiple auth identities, you have to model it explicitly** (e.g. a `person_id` linking employees, or an alias table). The current system does not do this.

### 5. Non-admin visibility requires team membership

The visibility scope at `backend/lib/teamVisibility.js getVisibilityScope()`:

- **Superadmin or admin** → `bypass: true` → see everything on the tenant.
- **Anyone else, with a `team_members` row** → see records assigned to anyone in your team + records with `assigned_to=NULL`.
- **Anyone else, WITHOUT a `team_members` row** → see only records with `assigned_to=NULL`.

**This is the contract, not a bug.** A non-admin user who's not in any team will see a nearly-empty list view even for records they themselves created. The fix is to add them to a team via `team_members`, not to "fix" the visibility filter.

If you're investigating "why don't I see X?" as a non-admin, **check `team_members` first.**

### 6. Acting on behalf of the tenant requires an `employees` row

If a route writes data that gets assigned to a person — sending eSign documents, creating leads with `assigned_to`, etc. — the actor needs to be an employee. The pattern, per 4VD-54:

```js
// backend/middleware/requireEmployee.js
export async function requireEmployee(req, res, next) {
  /* ... */
}
```

Apply this middleware to any route that creates records owned by the tenant. Non-employee users (clients, external collaborators) should get a 403 with `code: employee_required` and a UX hint to contact an admin.

---

## Gotchas we've actually hit

| Date       | Symptom                                                                 | Root cause                                                                                                                                          | Where it should have been caught        |
| ---------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 2026-05-10 | Calendar empty for non-admin users                                      | `resolveAssignedTo` had a `users`-table fallback that stamped `users.id` into `activities.assigned_to` (FK to `employees.id`) — silent FK violation | This doc's rule #2                      |
| 2026-05-12 | Manager sees only `assigned_to=NULL` activities                         | No `team_members` row → visibility scope sees zero employees → only the NULL clause matches                                                         | This doc's rule #5                      |
| 2026-05-12 | Send Document works for non-employee users                              | Route has no employee gate                                                                                                                          | This doc's rule #6, addressed in 4VD-54 |
| 2026-05-12 | Activities visible under personal email aren't visible under work email | Same person has two `employees` rows; only one is in any given session's `team_members` scope                                                       | This doc's rule #4                      |

---

## Onboarding sequence (when does each row get created?)

| Action                              | Creates row in                                 |
| ----------------------------------- | ---------------------------------------------- |
| Supabase Auth user signs up         | `users` (via auth trigger or first-login sync) |
| Admin adds person to Employees page | `employees`                                    |
| Admin adds person to a team         | `team_members`                                 |

There is **no auto-creation chain.** A user signing up does not auto-create an employees row, and adding an employee does not auto-create a team_members row. Each step is explicit.

**If you're invited as a user, you can log in but you'll see almost nothing** until an admin makes you an employee and puts you on a team. This is the source of the "empty CRM after signup" UX papercut. Filing a separate ticket to soften this onboarding gap is a reasonable follow-up — but the contract itself is correct.

---

## API patterns

When auth middleware runs, it loads `req.user` from `users`. The middleware **should also load** `req.user.employee_id` (the matching `employees.id`, if any) and `req.user.is_employee` (boolean). 4VD-54 is the work to make this universal — until then, individual routes that need the employees.id do the lookup themselves via `resolveAssignedTo` or `requireEmployee`.

When in doubt, **never trust `req.user.id` as if it were an `employees.id`.** Always resolve.

---

## Related docs

- [`TEAM_VISIBILITY_SYSTEM.md`](./TEAM_VISIBILITY_SYSTEM.md) — full access-control model
- [`TEAM_ASSIGNMENT_HANDOFF.md`](./TEAM_ASSIGNMENT_HANDOFF.md) — how records get assigned/reassigned
- [`../reference/DATABASE_REFERENCE.md`](../reference/DATABASE_REFERENCE.md) — canonical table + column reference
- 4VD-43 — eSign engine (signing-tracker stamps `assigned_to = employees.id`)
- 4VD-44 — `resolveAssignedTo` fix
- 4VD-54 — Send Document → employees-only restriction
- 4VD-55 — parent doc-rollout ticket
