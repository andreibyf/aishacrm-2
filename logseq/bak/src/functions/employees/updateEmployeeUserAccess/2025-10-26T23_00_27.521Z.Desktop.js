/**
 * updateEmployeeUserAccess
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

    // Only admins, superadmins, and managers can update user access
    const canManage = user.role === 'admin' || user.role === 'superadmin' || user.employee_role === 'manager';
    if (!canManage) {
      return Response.json({ error: 'Forbidden: Only admins and managers can update user access' }, { status: 403 });
    }

    const body = await req.json();
    const { user_email, access_level, employee_role, tier } = body;

    // Validate required fields (accept either employee_role or tier)
    if (!user_email || !access_level) {
      return Response.json({ 
        error: 'Missing required fields: user_email and access_level are required',
        received: { user_email, access_level, employee_role, tier }
      }, { status: 400 });
    }

    // Map employee_role to tier for backward compatibility
    const getTierFromRole = (empRole) => {
      if (empRole === 'manager') return 'Tier3';
      if (empRole === 'employee') return 'Tier1';
      return 'Tier2'; // Default
    };

    const effectiveTier = tier || getTierFromRole(employee_role);

    console.log('[updateEmployeeUserAccess] Processing update:', {
      user_email,
      access_level,
      employee_role,
      effectiveTier,
      editor: user.email
    });

    // Find the target user
    const targetUsers = await base44.asServiceRole.entities.User.filter({ email: user_email });
    if (!targetUsers || targetUsers.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const targetUser = targetUsers[0];

    // Permission check: Tier3 cannot modify Tier4 users
    if (user.tier === 'Tier3') {
      if (targetUser.tier === 'Tier4' || effectiveTier === 'Tier4') {
        return Response.json({ 
          error: 'Forbidden: Tier3 users cannot manage Tier4 users' 
        }, { status: 403 });
      }
    }

    // Prepare update payload with both new and legacy fields
    const updatePayload = {
      access_level,
      employee_role: employee_role || (effectiveTier === 'Tier3' ? 'manager' : 'employee'),
      tier: effectiveTier, // Keep for backward compatibility
    };

    console.log('[updateEmployeeUserAccess] Updating user with payload:', updatePayload);

    // Update the user
    await base44.asServiceRole.entities.User.update(targetUser.id, updatePayload);

    // Also update the corresponding Employee record if it exists
    try {
      const employees = await base44.asServiceRole.entities.Employee.filter({ 
        user_email: user_email,
        tenant_id: user.tenant_id || targetUser.tenant_id
      });

      if (employees && employees.length > 0) {
        const employee = employees[0];
        await base44.asServiceRole.entities.Employee.update(employee.id, {
          crm_user_access_level: access_level,
          crm_user_employee_role: employee_role || (effectiveTier === 'Tier3' ? 'manager' : 'employee')
        });
        console.log('[updateEmployeeUserAccess] Updated corresponding Employee record');
      }
    } catch (empError) {
      console.warn('[updateEmployeeUserAccess] Could not update Employee record:', empError);
      // Don't fail the request if employee update fails
    }

    return Response.json({ 
      success: true,
      message: 'User access updated successfully',
      updated: {
        user_email,
        access_level,
        employee_role: updatePayload.employee_role,
        tier: effectiveTier
      }
    });

  } catch (error) {
    console.error('[updateEmployeeUserAccess] Error:', error);
    return Response.json({ 
      error: error.message || 'Failed to update user access',
      details: error.toString()
    }, { status: 500 });
  }
});

----------------------------

export default updateEmployeeUserAccess;
