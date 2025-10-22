/**
 * fixMyAccess
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tenantId = user.tenant_id || null;
    if (!tenantId) {
      return Response.json({ error: 'Your user has no client (tenant) assigned. Ask an admin to set it in Users → User Management.' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const email = user.email;

    // Ensure employee(s) for this user (best-effort)
    let employees = [];
    try {
      employees = await svc.entities.Employee.filter({ tenant_id: tenantId, user_email: email });
      if (!employees || employees.length === 0) {
        const full = (user.full_name || '').trim();
        const [first = 'User', ...rest] = full.split(/\s+/);
        const last = rest.join(' ') || 'Account';
        const emp = await svc.entities.Employee.create({
          tenant_id: tenantId,
          user_email: email,
          first_name: first,
          last_name: last,
          department: 'other',
          job_title: 'Member',
          is_active: true
        }).catch(() => null);
        if (emp) employees = [emp];
      }
    } catch {
      // ignore employee ensure failures
    }

    const employeeIds = new Set((employees || []).map(e => e.id));

    const toFixTenant = [];
    const toFixAssigneeToEmail = [];

    // 1) Leads assigned to current user's email (ensure tenant correct)
    const assignedToMe = await svc.entities.Lead.filter({ assigned_to: email }, '-updated_date', 5000);
    for (const lead of assignedToMe || []) {
      const t = (lead.tenant_id || '').trim();
      if (!t || t !== String(tenantId)) toFixTenant.push(lead.id);
    }

    // 2) Leads assigned to current user's Employee ID(s) -> map assigned_to to user.email
    for (const empId of employeeIds) {
      const assignedToEmpId = await svc.entities.Lead.filter({ assigned_to: empId }, '-updated_date', 5000);
      for (const lead of assignedToEmpId || []) {
        toFixAssigneeToEmail.push(lead.id);
        const t = (lead.tenant_id || '').trim();
        if (!t || t !== String(tenantId)) toFixTenant.push(lead.id);
      }
    }

    // 3) Leads created by me (ensure tenant)
    try {
      const createdByMe = await svc.entities.Lead.filter({ created_by: email }, '-updated_date', 5000);
      for (const lead of createdByMe || []) {
        const t = (lead.tenant_id || '').trim();
        if (!t || t !== String(tenantId)) toFixTenant.push(lead.id);
      }
    } catch {
      // ignore if backend restricts filtering by created_by
    }

    // Deduplicate
    const uniqTenantFix = Array.from(new Set(toFixTenant));
    const uniqAssigneeFix = Array.from(new Set(toFixAssigneeToEmail));

    // Chunk helper (FIXED: no HTML entities)
    const chunk = (arr, size) => {
      const out = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    let tenantUpdated = 0;
    let assigneeUpdated = 0;

    for (const batch of chunk(uniqTenantFix, 100)) {
      const results = await Promise.allSettled(batch.map(id => svc.entities.Lead.update(id, { tenant_id: tenantId })));
      results.forEach(r => { if (r.status === 'fulfilled') tenantUpdated += 1; });
    }

    for (const batch of chunk(uniqAssigneeFix, 100)) {
      const results = await Promise.allSettled(batch.map(id => svc.entities.Lead.update(id, { assigned_to: email })));
      results.forEach(r => { if (r.status === 'fulfilled') assigneeUpdated += 1; });
    }

    return Response.json({
      success: true,
      tenantId,
      ensuredEmployees: employees?.length || 0,
      tenantUpdated,
      assigneeUpdated
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Server error' }, { status: 500 });
  }
});

----------------------------

export default fixMyAccess;
