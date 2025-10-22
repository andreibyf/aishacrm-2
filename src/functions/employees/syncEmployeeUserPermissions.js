/**
 * syncEmployeeUserPermissions
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return Response.json({ error: 'Unauthorized - Admin access required' }, { status: 401 });
    }

    const body = await req.json();
    const { employee_id } = body;

    if (!employee_id) {
      return Response.json({ error: 'employee_id is required' }, { status: 400 });
    }

    // Get the employee
    const employee = await base44.asServiceRole.entities.Employee.get(employee_id);
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 404 });
    }

    if (!employee.user_email) {
      return Response.json({ error: 'Employee is not linked to a CRM user' }, { status: 400 });
    }

    // Get the linked user
    const users = await base44.asServiceRole.entities.User.filter({ email: employee.user_email });
    if (!users || users.length === 0) {
      return Response.json({ error: 'Linked CRM user not found' }, { status: 404 });
    }

    const linkedUser = users[0];

    // UPDATED LOGIC: Sync FROM User TO Employee (User is the source of truth)
    // The User record has the correct employee_role set via Manage Permissions dialog
    const correctEmployeeRole = linkedUser.employee_role || 'employee';
    const correctAccessLevel = linkedUser.access_level || 'read_write';
    const correctTenantId = linkedUser.tenant_id || employee.tenant_id;

    console.log('Syncing FROM User TO Employee:');
    console.log('  User employee_role:', correctEmployeeRole);
    console.log('  Employee crm_user_employee_role (before):', employee.crm_user_employee_role);

    // Update the Employee entity to match the User entity
    await base44.asServiceRole.entities.Employee.update(employee_id, {
      crm_user_access_level: correctAccessLevel,
      crm_user_employee_role: correctEmployeeRole,
      tenant_id: correctTenantId
    });

    console.log('  Employee crm_user_employee_role (after):', correctEmployeeRole);

    return Response.json({
      success: true,
      message: 'Employee record synced from User record successfully',
      applied_updates: {
        user_email: linkedUser.email,
        employee_role: correctEmployeeRole,
        access_level: correctAccessLevel,
        tenant_id: correctTenantId,
        sync_direction: 'User → Employee'
      }
    });

  } catch (error) {
    console.error('[syncEmployeeUserPermissions] Error:', error);
    return Response.json({
      error: error.message || 'Failed to sync employee permissions'
    }, { status: 500 });
  }
});

----------------------------

export default syncEmployeeUserPermissions;
