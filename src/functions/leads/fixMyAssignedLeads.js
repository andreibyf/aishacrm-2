/**
 * fixMyAssignedLeads
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
    // Tier4 users will run this to fix their own assigned leads; must have a tenant
    const tenantId = user.tenant_id || null;
    if (!tenantId) {
      return Response.json({ error: 'Your user has no client (tenant) assigned. Ask an admin to set it.' }, { status: 400 });
    }
    const email = user.email;
    if (!email) {
      return Response.json({ error: 'Your user has no email on file.' }, { status: 400 });
    }

    // Service role: find leads assigned to this user email regardless of tenant, then fix tenant_id
    const svc = base44.asServiceRole;

    // Fetch up to 5000 leads assigned to this email
    const assignedLeads = await svc.entities.Lead.filter({ assigned_to: email }, '-updated_date', 5000);

    let totalChecked = 0;
    let needUpdate = [];
    for (const lead of assignedLeads) {
      totalChecked += 1;
      // If tenant mismatches or is null/empty, fix it
      const t = (lead.tenant_id || '').trim();
      if (!t || t !== tenantId) {
        needUpdate.push(lead.id);
      }
    }

    // Chunk updates
    const chunk = (arr, size) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    let updated = 0;
    const failed = [];
    for (const ids of chunk(needUpdate, 100)) {
      const results = await Promise.allSettled(ids.map(id => svc.entities.Lead.update(id, { tenant_id: tenantId })));
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') updated += 1;
        else failed.push({ id: ids[idx], error: String(r.reason?.message || r.reason || 'Unknown error') });
      });
    }

    return Response.json({ success: true, totalChecked, updated, failedCount: failed.length, failed });
  } catch (error) {
    return Response.json({ error: error.message || 'Server error' }, { status: 500 });
  }
});

----------------------------

export default fixMyAssignedLeads;
