/**
 * setUserTenant
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
    if (!(me.role === 'admin' || me.role === 'superadmin')) {
      return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { user_id, user_email, tenant_id } = body || {};

    if (!tenant_id || typeof tenant_id !== 'string') {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }
    if (!user_id && !user_email) {
      return Response.json({ error: 'user_id or user_email is required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    let target = null;

    if (user_id) {
      try {
        target = await svc.entities.User.get(user_id);
      } catch {
        // ignore
      }
    }
    if (!target && user_email) {
      const found = await svc.entities.User.filter({ email: user_email }, undefined, 1);
      target = Array.isArray(found) && found.length ? found[0] : null;
    }
    if (!target) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    await svc.entities.User.update(target.id, { tenant_id });

    return Response.json({ success: true, user_id: target.id, tenant_id });
  } catch (error) {
    return Response.json({ error: error.message || 'Server error' }, { status: 500 });
  }
});

----------------------------

export default setUserTenant;
