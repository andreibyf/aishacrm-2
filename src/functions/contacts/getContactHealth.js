/**
 * getContactHealth
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const selectedTenantId = body?.selectedTenantId || null;

    let tenantId = null;
    if (user.role === 'superadmin' || user.role === 'admin') {
      tenantId = selectedTenantId || user.tenant_id || null;
    } else {
      tenantId = user.tenant_id || null;
    }

    if (!tenantId) {
      return Response.json({
        success: true,
        tenant_id: null,
        total: 0,
        visible: 0,
        test: 0,
        has_invisible: false,
        message: 'No tenant context available'
      });
    }

    // Fetch all contacts for tenant, then split by test flag
    const contacts = await base44.entities.Contact.filter({ tenant_id: tenantId });

    const total = contacts.length;
    const testContacts = contacts.filter((c) => c.is_test_data === true);
    const nonTestContacts = contacts.filter((c) => !c.is_test_data);

    const visible = nonTestContacts.length;
    const test = testContacts.length;

    const sample = (arr) => arr.slice(0, 5).map((c) => ({
      id: c.id,
      name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || (c.email || 'Unnamed'),
      email: c.email || null
    }));

    return Response.json({
      success: true,
      tenant_id: tenantId,
      total,
      visible,
      test,
      has_invisible: test > 0,
      samples: {
        non_test: sample(nonTestContacts),
        test: sample(testContacts)
      }
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error?.message || 'Unknown error'
    }, { status: 500 });
  }
});

----------------------------

export default getContactHealth;
