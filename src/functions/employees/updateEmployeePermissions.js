/**
 * updateEmployeePermissions
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ success: false, error: 'Method not allowed' }, { status: 405 });
    }
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const email = (body?.email || '').toLowerCase().trim();
    if (!email) return Response.json({ success: false, error: 'Missing email' }, { status: 400 });

    const isAdmin = me.role === 'admin' || me.role === 'superadmin';
    const isTierManager = me.tier === 'Tier3' || me.tier === 'Tier4';
    if (!isAdmin && !isTierManager) {
      return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const users = await base44.asServiceRole.entities.User.filter({ email });
    if (!Array.isArray(users) || users.length === 0) {
      return Response.json({ success: false, error: 'No user found by email' }, { status: 404 });
    }
    const user = users[0];

    // If not admin, Tier3/4 may only update employee-level users
    if (!isAdmin) {
      const intended = user?.permissions?.intended_role || user?.role || 'user';
      if (intended !== 'user') {
        return Response.json({ success: false, error: 'Forbidden: not an employee user' }, { status: 403 });
      }
    }

    const updatePayload = {
      crm_access: body?.crm_access !== false,
      access_level: (body?.access_level || 'read_write'),
      navigation_permissions: body?.navigation_permissions || {}
    };

    await base44.asServiceRole.entities.User.update(user.id, updatePayload);

    return Response.json({ success: true, user_id: user.id });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'Internal error' }, { status: 500 });
  }
});

----------------------------

export default updateEmployeePermissions;
