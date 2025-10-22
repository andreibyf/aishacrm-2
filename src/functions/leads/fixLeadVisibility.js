/**
 * fixLeadVisibility
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const body = await req.json();
    const { leadId, userEmail, tenantId } = body;

    if (!leadId || !userEmail || !tenantId) {
      return Response.json({ error: 'leadId, userEmail, and tenantId are required' }, { status: 400 });
    }

    console.log(`Fixing lead visibility for lead ${leadId} and user ${userEmail}`);

    // Find the CORRECT lead for this tenant
    let correctLead = null;
    
    try {
      // Try by database ID first
      correctLead = await base44.asServiceRole.entities.Lead.get(leadId);
      if (correctLead && correctLead.tenant_id !== tenantId) {
        correctLead = null; // Wrong tenant
      }
    } catch (e) {
      // Not found by ID
    }

    if (!correctLead) {
      // Find by unique_id AND tenant_id (critical!)
      const leads = await base44.asServiceRole.entities.Lead.filter({ 
        unique_id: leadId,
        tenant_id: tenantId 
      });
      if (leads && leads.length > 0) {
        correctLead = leads[0];
      }
    }

    if (!correctLead) {
      return Response.json({ error: 'Lead not found for this tenant' }, { status: 404 });
    }

    // Get the user
    const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
    if (!users || users.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    const targetUser = users[0];

    const fixes = [];

    // Fix 1: Ensure lead has tenant_id
    if (!correctLead.tenant_id) {
      await base44.asServiceRole.entities.Lead.update(correctLead.id, {
        tenant_id: tenantId
      });
      fixes.push(`Set lead tenant_id to ${tenantId}`);
    }

    // Fix 2: Ensure user has correct tenant_id and employee_role
    if (targetUser.tenant_id !== tenantId) {
      await base44.asServiceRole.entities.User.update(targetUser.id, {
        tenant_id: tenantId
      });
      fixes.push(`Set user tenant_id to ${tenantId}`);
    }

    if (!targetUser.employee_role || targetUser.employee_role === 'none') {
      await base44.asServiceRole.entities.User.update(targetUser.id, {
        employee_role: 'manager'
      });
      fixes.push(`Set user employee_role to 'manager'`);
    }

    return Response.json({
      success: true,
      message: 'Lead visibility fixed',
      fixes_applied: fixes,
      note: 'No unique_ids were changed - only tenant assignments'
    });

  } catch (error) {
    console.error('Error fixing lead visibility:', error);
    return Response.json({ 
      error: error.message || 'Failed to fix lead visibility'
    }, { status: 500 });
  }
});

----------------------------

export default fixLeadVisibility;
