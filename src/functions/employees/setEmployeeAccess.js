/**
 * setEmployeeAccess
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const editor = await base44.auth.me();
    if (!editor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { email, user_id, tier, access_level } = body || {};

    if ((!email && !user_id) || !tier || !access_level) {
      return Response.json({ error: 'Missing required fields: email|user_id, tier, access_level' }, { status: 400 });
    }

    // Resolve user
    let target;
    if (user_id) {
      target = await base44.asServiceRole.entities.User.get(user_id);
    } else {
      const users = await base44.asServiceRole.entities.User.filter({
        email: String(email).toLowerCase().trim()
      });
      target = Array.isArray(users) && users.length > 0 ? users[0] : null;
    }
    if (!target) return Response.json({ error: 'User not found' }, { status: 404 });

    const isAdmin = editor.role === 'admin' || editor.role === 'superadmin';
    const isTierMgr = editor.tier === 'Tier3' || editor.tier === 'Tier4';

    // Allow Admins; Tier3/4 only for employee-level users in same tenant
    if (!isAdmin) {
      const intended = target?.permissions?.intended_role || target?.role || 'user';
      if (!(isTierMgr && intended === 'user')) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (editor.tenant_id && target.tenant_id && editor.tenant_id !== target.tenant_id) {
        return Response.json({ error: 'Forbidden: different tenant' }, { status: 403 });
      }
    }

    const dashboard_scope = (tier === 'Tier3' || tier === 'Tier4') ? 'aggregated' : 'own';
    const newPermissions = { ...(target.permissions || {}), dashboard_scope };

    await base44.asServiceRole.entities.User.update(target.id, {
      tier,
      access_level,
      permissions: newPermissions
    });

    return Response.json({ status: 'success', user_id: target.id, tier, access_level, dashboard_scope }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});

----------------------------

export default setEmployeeAccess;
