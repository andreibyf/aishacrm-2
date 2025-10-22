/**
 * linkEmployeeToCRMUser
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canManage = user.role === 'admin' || user.role === 'superadmin' || user.employee_role === 'manager';
    if (!canManage) {
      return Response.json({ error: 'Forbidden: Only admins and managers can link employees' }, { status: 403 });
    }

    const body = await req.json();
    const { employee_id, employee_email } = body;

    if (!employee_id || !employee_email) {
      return Response.json({ 
        error: 'Missing required fields: employee_id and employee_email'
      }, { status: 400 });
    }

    const users = await base44.asServiceRole.entities.User.filter({ email: employee_email });
    
    if (!users || users.length === 0) {
      return Response.json({ 
        error: `No CRM user found with email ${employee_email}. Please invite them first from Dashboard → Users.`
      }, { status: 404 });
    }

    const matchedUser = users[0];

    await base44.asServiceRole.entities.Employee.update(employee_id, {
      user_email: matchedUser.email,
      has_crm_access: true,
      crm_user_access_level: matchedUser.access_level || 'read_write',
      crm_user_employee_role: matchedUser.employee_role || 'employee'
    });

    return Response.json({ 
      success: true,
      message: `Successfully linked to CRM user: ${matchedUser.email}`,
      linked_user: {
        email: matchedUser.email,
        employee_role: matchedUser.employee_role,
        access_level: matchedUser.access_level
      }
    });

  } catch (error) {
    console.error('[linkEmployeeToCRMUser] Error:', error);
    return Response.json({ 
      error: error.message || 'Failed to link employee to CRM user'
    }, { status: 500 });
  }
});

----------------------------

export default linkEmployeeToCRMUser;
