/**
 * listTenantUsers
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();

    if (!me) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow admins or Tier3/Tier4 to fetch tenant-scoped users
    const isAdmin = me.role === 'admin' || me.role === 'superadmin';
    const isElevatedTier = me.tier === 'Tier3' || me.tier === 'Tier4';
    if (!isAdmin && !isElevatedTier) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tenantId = me.tenant_id;
    if (!tenantId) {
      return Response.json({ error: 'No tenant assigned' }, { status: 400 });
    }

    // Service role: list tenant-scoped users (limited fields)
    const users = await base44.asServiceRole.entities.User.filter({ tenant_id: tenantId });
    const safeUsers = (users || []).map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      tier: u.tier,
      tenant_id: u.tenant_id
    }));

    return Response.json({ users: safeUsers });
  } catch (error) {
    return Response.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
});

----------------------------

export default listTenantUsers;
