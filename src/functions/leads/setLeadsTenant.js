/**
 * setLeadsTenant
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Safety: only admins/superadmins can reassign tenant on leads
    if (!(user.role === 'admin' || user.role === 'superadmin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const leadIds = Array.isArray(body.leadIds) ? body.leadIds : [];
    const tenantId = body.tenant_id;

    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }
    if (leadIds.length === 0) {
      return Response.json({ error: 'leadIds must be a non-empty array' }, { status: 400 });
    }

    // Service role for admin-level writes
    const svc = base44.asServiceRole;

    // Chunk updates to avoid timeouts
    const chunk = (arr, size) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    const chunks = chunk(leadIds, 100);

    let updated = 0;
    const failed = [];

    for (const ids of chunks) {
      const results = await Promise.allSettled(
        ids.map((id) => svc.entities.Lead.update(id, { tenant_id: tenantId }))
      );
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') updated += 1;
        else failed.push({ id: ids[idx], error: String(r.reason?.message || r.reason || 'Unknown error') });
      });
    }

    return Response.json({ updated, failed });
  } catch (error) {
    return Response.json({ error: error.message || 'Server error' }, { status: 500 });
  }
});

----------------------------

export default setLeadsTenant;
