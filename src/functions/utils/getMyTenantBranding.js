/**
 * getMyTenantBranding
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

    const tenantId = user.tenant_id || null;
    if (!tenantId) {
      return Response.json({ tenant: null }, { status: 200 });
    }

    // Use service role to bypass Tenant RLS, but only for the authenticated user's tenant
    const tenant = await base44.asServiceRole.entities.Tenant.get(tenantId);
    if (!tenant) {
      return Response.json({ tenant: null }, { status: 200 });
    }

    const {
      id,
      name,
      logo_url,
      primary_color,
      accent_color,
      elevenlabs_agent_id
    } = tenant;

    return Response.json({
      tenant: {
        id,
        name,
        logo_url,
        primary_color,
        accent_color,
        elevenlabs_agent_id
      }
    }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

----------------------------

export default getMyTenantBranding;
