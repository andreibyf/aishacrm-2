/**
 * getEmployeeUserData
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const emailRaw = body?.email || '';
    const email = String(emailRaw).toLowerCase().trim();
    if (!email) return Response.json({ error: 'Missing email' }, { status: 400 });

    // Authorization: admin/superadmin OR Tier3/4 (will still restrict target to employee)
    const isAdmin = me.role === 'admin' || me.role === 'superadmin';
    const isTierManager = me.tier === 'Tier3' || me.tier === 'Tier4';
    if (!isAdmin && !isTierManager) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const users = await base44.asServiceRole.entities.User.filter({ email });
    if (!Array.isArray(users) || users.length === 0) {
      return Response.json({ notFound: true, email });
    }
    const user = users[0];

    // If not admin, only allow Tier3/4 to read employee-level users (role 'user' or intended_role 'user') and same tenant
    if (!isAdmin) {
      const intended = user?.permissions?.intended_role || user?.role || 'user';
      if (intended !== 'user') {
        return Response.json({ error: 'Forbidden: not an employee user' }, { status: 403 });
      }
      if (me.tenant_id && user.tenant_id && me.tenant_id !== user.tenant_id) {
        return Response.json({ error: 'Forbidden: different tenant' }, { status: 403 });
      }
    }

    return Response.json({
      id: user.id,
      email: user.email,
      role: user.role,
      display_role: user.permissions?.intended_role || user.role,
      crm_access: user.crm_access !== false,
      access_level: user.access_level || 'read_write',
      tier: user.tier || 'Tier1',
      tenant_id: user.tenant_id || null,
      navigation_permissions: user.navigation_permissions || {}
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});

----------------------------

export default getEmployeeUserData;
