/**
 * checkUserRecord
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    
    if (!currentUser) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { email } = body;

    const targetEmail = email || currentUser.email;

    // Get user record
    const users = await base44.asServiceRole.entities.User.filter({ email: targetEmail });
    
    if (!users || users.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const user = users[0];

    // Get ALL leads for this tenant to see what user SHOULD see
    const allTenantLeads = await base44.asServiceRole.entities.Lead.filter({
      tenant_id: user.tenant_id
    });

    return Response.json({
      user_record: {
        email: user.email,
        full_name: user.full_name,
        role: user.role, // CRITICAL: Check exact value
        employee_role: user.employee_role,
        tenant_id: user.tenant_id,
        access_level: user.access_level,
        is_active: user.is_active
      },
      tenant_leads_count: allTenantLeads.length,
      tenant_leads: allTenantLeads.map(l => ({
        id: l.id,
        unique_id: l.unique_id,
        name: `${l.first_name} ${l.last_name}`,
        assigned_to: l.assigned_to,
        tenant_id: l.tenant_id
      })),
      rls_evaluation: {
        is_admin: user.role === 'admin' || user.role === 'superadmin',
        is_power_user: user.role === 'power-user', // Check if this matches
        is_manager: user.employee_role === 'manager',
        is_employee: user.employee_role === 'employee',
        tenant_matches: true
      },
      should_see_leads: (
        user.role === 'admin' || 
        user.role === 'superadmin' || 
        user.role === 'power-user' ||
        user.employee_role === 'manager'
      )
    });

  } catch (error) {
    console.error('Error checking user record:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

----------------------------

export default checkUserRecord;
