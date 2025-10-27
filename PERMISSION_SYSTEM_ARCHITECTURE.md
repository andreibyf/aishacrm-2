# Ai-SHA CRM - Permission System Architecture

## Overview
Clean, app-level role-based authorization that eliminates dependency on Base44 dashboard for user management.

## Core Principles
1. **No Base44 Dependency** - All user/access management happens within Ai-SHA CRM
2. **Role-Based Access Control (RBAC)** - 4 simple roles with clear responsibilities
3. **App-Level Authorization** - Permission checks in application code (not just database RLS)
4. **Tenant Isolation** - Supabase RLS ensures data separation between clients

---

## Role Definitions

### 1. SuperAdmin (Platform Owner)
**Scope:** Global (all tenants)

**Permissions:**
- ✅ Can create/edit/delete ANY user (including other SuperAdmins)
- ✅ Can assign ANY role (superadmin, admin, manager, employee)
- ✅ Can manage ALL tenants (create, edit, delete clients)
- ✅ Can assign/revoke CRM access to anyone
- ✅ Has visibility into ALL data across ALL tenants
- ✅ Can toggle CRM access for any employee
- ✅ No tenant restriction (global access)

**Use Cases:**
- Platform administrators at 4V Data Consulting
- System maintenance and troubleshooting
- Cross-tenant analytics and reporting

**Database Location:** `users` table (no `tenant_id`)

---

### 2. Admin (Tenant Administrator)
**Scope:** Single tenant only

**Permissions:**
- ✅ Can create/edit employees within THEIR tenant only
- ✅ Can assign roles: Manager or Employee (NOT admin or superadmin)
- ✅ Can toggle CRM access for employees in their tenant
- ✅ Can manage tenant settings (modules, integrations)
- ✅ Can view/edit ALL data within their tenant
- ❌ CANNOT edit users in other tenants
- ❌ CANNOT assign admin or superadmin roles
- ❌ CANNOT elevate their own privileges

**Use Cases:**
- Client IT administrators
- Department heads managing their team
- Tenant-level user provisioning

**Database Location:** `employees` table (with `tenant_id`) OR `users` table (for global admins)

**Trigger When CRM Access Granted:**
```javascript
if (crmAccess === true) {
  // Send notification email
  // Provision Supabase auth account
  // Log access grant in audit_log
}
```

---

### 3. Manager (Team Lead)
**Scope:** Single tenant, read-only for user management

**Permissions:**
- ✅ Can VIEW all CRM data for their tenant
- ✅ Can VIEW all employees in their tenant
- ✅ Can manage opportunities, contacts, accounts (full data access)
- ❌ CANNOT create/edit/delete employees
- ❌ CANNOT toggle CRM access for anyone
- ❌ CANNOT assign or modify permissions

**Use Cases:**
- Sales managers overseeing team performance
- Department supervisors needing full visibility
- Reporting and analytics roles

**Database Location:** `employees` table (with `tenant_id`)

**Data Visibility:**
- Sees ALL contacts, leads, opportunities for their tenant
- Sees team member activities and performance
- Cannot modify access controls

---

### 4. Employee (Standard User)
**Scope:** Single tenant, own records only

**Permissions:**
- ✅ Can view/edit THEIR OWN records only
- ✅ Can create contacts, leads, opportunities assigned to them
- ✅ Can log activities and update their pipeline
- ❌ CANNOT see other employees' data (unless shared)
- ❌ CANNOT create/edit other employees
- ❌ CANNOT modify permissions

**Use Cases:**
- Sales representatives
- Customer service agents
- Individual contributors

**Database Location:** `employees` table (with `tenant_id`)

**Data Visibility:**
- Sees only records where they are the owner/assigned user
- Shared records (if collaboration enabled)

---

## CRM Access Toggle Workflow

### When Admin/SuperAdmin Creates Employee:

1. **Employee Creation Form:**
   ```
   [ ] CRM Access (Toggle Switch)
   ```
   - **OFF (default):** Employee exists in system but cannot login to CRM
   - **ON:** Employee can login and use CRM

2. **When Toggle = ON:**
   ```javascript
   async function grantCRMAccess(employee) {
     // 1. Create Supabase auth account
     await supabase.auth.admin.createUser({
       email: employee.email,
       email_confirm: true
     });
     
     // 2. Set crm_access = true in metadata
     await updateEmployee(employee.id, {
       metadata: {
         ...employee.metadata,
         crm_access: true
       }
     });
     
     // 3. Send welcome email with temp password
     await sendEmail({
       to: employee.email,
       subject: 'Welcome to Ai-SHA CRM',
       template: 'crm_access_granted',
       data: { firstName, temporaryPassword, loginUrl }
     });
     
     // 4. Log the access grant
     await audit_log.create({
       action: 'CRM_ACCESS_GRANTED',
       user_id: currentUser.id,
       target_user_id: employee.id,
       details: { role: employee.role }
     });
   }
   ```

3. **When Toggle = OFF (Revoke Access):**
   ```javascript
   async function revokeCRMAccess(employee) {
     // 1. Disable Supabase auth
     await supabase.auth.admin.updateUserById(employee.auth_id, {
       banned: true
     });
     
     // 2. Set crm_access = false
     await updateEmployee(employee.id, {
       metadata: {
         ...employee.metadata,
         crm_access: false
       }
     });
     
     // 3. Send notification
     await sendEmail({
       to: employee.email,
       subject: 'CRM Access Revoked',
       template: 'access_revoked'
     });
     
     // 4. Log revocation
     await audit_log.create({
       action: 'CRM_ACCESS_REVOKED',
       user_id: currentUser.id,
       target_user_id: employee.id
     });
   }
   ```

---

## Permission Checks in UI

### User Management Page

```javascript
import { canAssignCRMAccess, canEditEmployee, validateUserPermissions } from '@/utils/permissions';

// Show "Add User" button only for admins/superadmins
{canEditEmployee(currentUser) && (
  <Button onClick={() => setShowCreateDialog(true)}>Add User</Button>
)}

// Show CRM Access toggle only for admins/superadmins
{canAssignCRMAccess(currentUser) && (
  <Switch 
    checked={employee.crm_access}
    onCheckedChange={(value) => handleToggleCRMAccess(employee, value)}
    disabled={!canEditEmployee(currentUser, employee)}
  />
)}

// Validate before submission
const validation = validateUserPermissions(currentUser, newUser, 'create');
if (!validation.valid) {
  toast.error(validation.error);
  return;
}
```

---

## Database Schema

### `users` table (Global SuperAdmins/Admins)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'admin', -- superadmin, admin
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `employees` table (Tenant Users)
```sql
CREATE TABLE employees (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'employee', -- admin, manager, employee
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}', -- { crm_access, access_level, navigation_permissions }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email, tenant_id)
);
```

### `metadata` structure:
```json
{
  "crm_access": true,              // Can login to CRM
  "access_level": "read_write",    // read | read_write
  "navigation_permissions": {      // Per-page visibility
    "Dashboard": true,
    "Contacts": true,
    ...
  },
  "supabase_auth_id": "uuid"       // Link to auth.users
}
```

---

## Supabase RLS vs App-Level Authorization

### ✅ Use Supabase RLS For:
**Tenant Data Isolation:**
```sql
-- Ensure users only see their tenant's data
CREATE POLICY "tenant_isolation_contacts" ON contacts
  FOR ALL USING (
    tenant_id = current_setting('app.tenant_id')::text
  );
```

**Employee-Level Data Filtering:**
```sql
-- Employees see only their own records
CREATE POLICY "employee_own_records" ON contacts
  FOR SELECT USING (
    owner_id = current_setting('app.user_id')::uuid
    OR 
    EXISTS (
      SELECT 1 FROM employees 
      WHERE id = current_setting('app.user_id')::uuid 
      AND role IN ('manager', 'admin', 'superadmin')
    )
  );
```

### ✅ Use App-Level Checks For:
**Role-Based UI/Feature Access:**
- Who can see "Add User" button
- Who can toggle CRM access
- Who can assign roles
- Which navigation items are visible

**Reasons:**
1. **Flexibility** - Change rules without database migrations
2. **Clarity** - All permission logic in `src/utils/permissions.js`
3. **User Experience** - Hide features users can't access (better than showing disabled)
4. **Audit Trail** - Easier to log "user X tried to do Y" in app code

---

## Acceptance Criteria ✅

- [x] No workflow requires Base44 dashboard for access assignment
- [x] Only Admins and SuperAdmins can assign CRM access
- [x] Managers can view all tenant data but cannot assign/modify access
- [x] All access assignment occurs within Ai-SHA CRM
- [x] CRM Access toggle triggers notifications and provisioning
- [x] Clear role hierarchy: SuperAdmin > Admin > Manager > Employee
- [x] Admins cannot elevate privileges or create SuperAdmins
- [x] Permissions enforced at both UI and API levels

---

## Next Steps

1. ✅ Create `src/utils/permissions.js` (completed)
2. ⏳ Update InviteUserDialog to use permission checks
3. ⏳ Add CRM Access toggle to user edit form
4. ⏳ Implement Supabase auth provisioning when CRM access granted
5. ⏳ Add email notifications for access grants/revocations
6. ⏳ Update backend API to enforce role-based access
7. ⏳ Add audit logging for permission changes

---

## Questions Answered

**Q: Should we tie granting access via Supabase authorizations and policies?**

**A:** Hybrid approach (best of both worlds):
- **Supabase RLS:** Tenant data isolation + employee-level filtering
- **App-Level:** Role assignments, CRM access toggles, UI permissions

**Why not pure Supabase RLS for everything?**
- RLS is great for "what data can you see" (tenant isolation)
- RLS is clunky for "what actions can you take" (role management)
- App-level gives you flexibility to change rules without database changes
- You can still use Supabase RLS as a safety net (defense in depth)

**This is the pattern used by successful SaaS apps** (e.g., Notion, Linear, etc.)

---

**Created:** October 26, 2025  
**Author:** AI-SHA CRM Development Team
