/**
 * userExistsByEmail
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
    if (!me) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow admins/superadmins and Tier3/Tier4 to check existence
    const allowed =
      me.role === 'admin' ||
      me.role === 'superadmin' ||
      me.tier === 'Tier3' ||
      me.tier === 'Tier4';

    if (!allowed) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      // keep body empty
    }

    const emailRaw = body?.email || '';
    const email = String(emailRaw).trim().toLowerCase();
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }

    // Try exact filter first
    let exists = false;
    try {
      const users = await base44.asServiceRole.entities.User.filter({ email }, undefined, 1);
      exists = Array.isArray(users) && users.length > 0;
    } catch (_e) {
      // Fallback to list + client-side match
      try {
        const all = await base44.asServiceRole.entities.User.list();
        const lower = email.toLowerCase();
        exists = Array.isArray(all) && all.some(u => (u.email || '').toLowerCase() === lower);
      } catch (e2) {
        return Response.json({ error: e2?.message || 'Lookup failed' }, { status: 500 });
      }
    }

    return Response.json({ exists }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});

----------------------------

export default userExistsByEmail;
