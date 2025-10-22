/**
 * fixTenantDataForTenant
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Body:
 * {
 *   tenant_id: string (required),
 *   uploader_email?: string,
 *   ensure_employees?: boolean = true,
 *   fix_leads?: boolean = true
 * }
 *
 * Returns JSON summary with counts and details.
 */

Deno.serve(async (req) => {
  const started = Date.now();

  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(me.role === 'admin' || me.role === 'superadmin')) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || '').trim();
    const uploaderEmail = String(body?.uploader_email || '').trim() || null;
    const ensureEmployees = body?.ensure_employees !== false;
    const fixLeads = body?.fix_leads !== false;

    if (!tenantId) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    // Helpers
    const svc = base44.asServiceRole;

    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const jitter = (min = 25, max = 150) => Math.floor(Math.random() * (max - min + 1)) + min;

    const isRateLimited = (err) => {
      const status = err?.status || err?.response?.status;
      const msg = (err?.message || '').toLowerCase();
      return status === 429 || status === 503 || msg.includes('rate limit');
    };

    const withBackoff = async (fn, { maxAttempts = 5, baseMs = 400 } = {}) => {
      let attempt = 0;
      while (true) {
        try {
          return await fn();
        } catch (err) {
          attempt += 1;
          if (!isRateLimited(err) || attempt >= maxAttempts) throw err;
          const wait = Math.min(baseMs * Math.pow(2, attempt - 1), 5000) + jitter();
          await sleep(wait);
        }
      }
    };

    const pagedFilter = async (entity, filter, sort, limit = 200) => {
      const all = [];
      let offset = 0;
      while (true) {
        const page = await withBackoff(() =>
          svc.entities[entity].filter(filter, sort, limit, offset)
        );
        const list = Array.isArray(page) ? page : [];
        all.push(...list);
        offset += limit;
        if (list.length < limit) break;
        await sleep(150 + jitter()); // small gap between pages
      }
      return all;
    };

    const safeUpdate = async (entity, id, data) => {
      return await withBackoff(() => svc.entities[entity].update(id, data));
    };

    // Summary
    const summary = {
      tenantId,
      employeesEnsured: 0,
      leadsChecked: 0,
      leadsFixed: 0,
      reassignedToEmail: 0,
      tenantPatched: 0,
      elapsed_ms: 0,
      notes: []
    };

    // 1) Ensure an Employee exists for uploader (optional, best-effort)
    let employees = [];
    try {
      employees = await pagedFilter('Employee', { tenant_id: tenantId }, undefined, 200);
    } catch (err) {
      // If we fail to read employees, continue; lead fixes may still be possible
      summary.notes.push('Could not list employees (continuing). ' + (err?.message || ''));
      employees = [];
    }

    const existingByUserEmail = new Map(
      employees
        .filter(e => e.user_email)
        .map(e => [String(e.user_email).toLowerCase(), e])
    );

    // Ensure for uploader
    if (ensureEmployees && uploaderEmail) {
      const key = uploaderEmail.toLowerCase();
      if (!existingByUserEmail.has(key)) {
        try {
          const names = (me.full_name || 'User Account').trim().split(/\s+/);
          const first = names[0] || 'User';
          const last = names.slice(1).join(' ') || 'Account';

          const emp = await withBackoff(() => svc.entities.Employee.create({
            tenant_id: tenantId,
            user_email: uploaderEmail,
            first_name: first,
            last_name: last,
            department: 'other',
            job_title: 'Member',
            is_active: true
          }));
          employees.push(emp);
          existingByUserEmail.set(key, emp);
          summary.employeesEnsured += 1;
          await sleep(120 + jitter());
        } catch (err) {
          summary.notes.push('Failed to ensure Employee for uploader: ' + (err?.message || ''));
        }
      }
    }

    // Build helper sets/maps for lead reassignment
    const employeeIdToEmail = new Map();
    for (const e of employees) {
      if (e?.id) {
        const mail = e.user_email || e.email || null;
        if (mail) employeeIdToEmail.set(e.id, mail);
      }
    }

    // 2) Gather leads to fix in a targeted way
    const leadsMap = new Map();

    const collectLeads = (items) => {
      for (const l of items || []) {
        if (!l?.id) continue;
        leadsMap.set(l.id, l);
      }
    };

    if (fixLeads) {
      // a) created_by uploader
      if (uploaderEmail) {
        try {
          const created = await pagedFilter('Lead', { created_by: uploaderEmail }, '-updated_date', 200);
          collectLeads(created);
          await sleep(120 + jitter());
        } catch (err) {
          summary.notes.push('Failed to fetch leads by created_by: ' + (err?.message || ''));
        }
      }

      // b) assigned_to uploader email
      if (uploaderEmail) {
        try {
          const assigned = await pagedFilter('Lead', { assigned_to: uploaderEmail }, '-updated_date', 200);
          collectLeads(assigned);
          await sleep(120 + jitter());
        } catch (err) {
          summary.notes.push('Failed to fetch leads by assigned_to email: ' + (err?.message || ''));
        }
      }

      // c) assigned_to employee IDs (per ID paged)
      const EMP_ID_LIMIT = 40;
      const empIds = Array.from(employeeIdToEmail.keys()).slice(0, EMP_ID_LIMIT);
      for (const empId of empIds) {
        try {
          const list = await pagedFilter('Lead', { assigned_to: empId }, '-updated_date', 200);
          collectLeads(list);
          await sleep(100 + jitter());
        } catch (err) {
          summary.notes.push(`Failed to fetch leads by assigned_to employeeId=${empId}: ${err?.message || ''}`);
        }
      }
    }

    const leads = Array.from(leadsMap.values());
    summary.leadsChecked = leads.length;

    // 3) Prepare updates
    const updates = [];
    for (const lead of leads) {
      const patch = {};

      const t = (lead.tenant_id || '').toString().trim();
      if (!t || t !== tenantId) {
        patch.tenant_id = tenantId;
      }

      const assigned = lead.assigned_to;
      if (assigned && employeeIdToEmail.has(assigned)) {
        const email = employeeIdToEmail.get(assigned);
        if (email && email !== assigned) {
          patch.assigned_to = email;
        }
      }

      if (Object.keys(patch).length > 0) {
        updates.push({ id: lead.id, patch });
      }
    }

    // 4) Apply updates in small batches with backoff
    const BATCH = 40;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(({ id, patch }) => safeUpdate('Lead', id, patch))
      );
      for (const r of results) {
        if (r.status === 'fulfilled') {
          summary.leadsFixed += 1;
        } else {
          const msg = r.reason?.message || 'update failed';
          summary.notes.push('Update failed for a lead: ' + msg);
        }
      }
      await sleep(200 + jitter(50, 200));
    }

    // Count specific changes
    for (const u of updates) {
      if ('tenant_id' in u.patch) summary.tenantPatched += 1;
      if ('assigned_to' in u.patch) summary.reassignedToEmail += 1;
    }

    summary.elapsed_ms = Date.now() - started;

    return Response.json({
      status: 'success',
      message: 'Tenant data fix completed (targeted).',
      ...summary
    });
  } catch (err) {
    const msg = err?.message || 'Internal Server Error';
    return Response.json({ error: msg }, { status: 500 });
  }
});

----------------------------

export default fixTenantDataForTenant;
