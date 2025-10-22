/**
 * diagnoseLeadVisibility
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const body = await req.json();
    const { leadId, userEmail } = body;

    if (!leadId || !userEmail) {
      return Response.json({ error: 'leadId and userEmail are required' }, { status: 400 });
    }

    // Get the target user FIRST to know which tenant to search
    const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
    if (!users || users.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }
    const targetUser = users[0];

    // CRITICAL FIX: Search for lead by unique_id AND tenant_id
    let lead = null;
    
    try {
      // Try by database ID first
      lead = await base44.asServiceRole.entities.Lead.get(leadId);
    } catch (e) {
      // Not found by database ID, try by unique_id AND tenant_id
      if (targetUser.tenant_id) {
        const leads = await base44.asServiceRole.entities.Lead.filter({ 
          unique_id: leadId,
          tenant_id: targetUser.tenant_id  // CRITICAL: Include tenant filter
        });
        if (leads && leads.length > 0) {
          lead = leads[0];
        }
      }
    }

    if (!lead) {
      return Response.json({ 
        error: `Lead not found with ID or unique_id: ${leadId}${targetUser.tenant_id ? ` for tenant: ${targetUser.tenant_id}` : ''}` 
      }, { status: 404 });
    }
    
    // Get the lead creator
    let creatorUser = null;
    if (lead.created_by) {
      const creators = await base44.asServiceRole.entities.User.filter({ email: lead.created_by });
      creatorUser = creators && creators.length > 0 ? creators[0] : null;
    }

    // Check RLS conditions
    const diagnosis = {
      lead_info: {
        id: lead.id,
        unique_id: lead.unique_id || 'N/A',
        name: `${lead.first_name} ${lead.last_name}`,
        tenant_id: lead.tenant_id || 'NOT SET ❌',
        assigned_to: lead.assigned_to || 'unassigned',
        created_by: lead.created_by || 'unknown',
        status: lead.status
      },
      creator_info: creatorUser ? {
        email: creatorUser.email,
        tenant_id: creatorUser.tenant_id || 'NOT SET ❌',
        employee_role: creatorUser.employee_role || 'none',
        role: creatorUser.role
      } : null,
      target_user_info: {
        email: targetUser.email,
        tenant_id: targetUser.tenant_id || 'NOT SET ❌',
        employee_role: targetUser.employee_role || 'none',
        role: targetUser.role,
        access_level: targetUser.access_level
      },
      rls_checks: {
        lead_has_tenant: !!lead.tenant_id,
        user_has_tenant: !!targetUser.tenant_id,
        tenant_matches: lead.tenant_id === targetUser.tenant_id,
        user_is_manager: targetUser.employee_role === 'manager',
        user_is_admin: targetUser.role === 'admin' || targetUser.role === 'superadmin',
        user_is_assigned: lead.assigned_to === targetUser.email,
        user_is_power_user: targetUser.role === 'power-user'
      }
    };

    // Calculate if user should see the lead
    const checks = diagnosis.rls_checks;
    const canSeeLead = 
      checks.user_is_admin ||
      (checks.lead_has_tenant && checks.user_has_tenant && checks.tenant_matches && checks.user_is_manager) ||
      (checks.lead_has_tenant && checks.user_has_tenant && checks.tenant_matches && checks.user_is_power_user) ||
      (checks.lead_has_tenant && checks.user_has_tenant && checks.tenant_matches && targetUser.employee_role === 'employee' && checks.user_is_assigned);

    diagnosis.can_see_lead = canSeeLead;
    diagnosis.explanation = [];

    if (!canSeeLead) {
      diagnosis.explanation.push("❌ USER CANNOT SEE LEAD:");
      
      if (!checks.lead_has_tenant) {
        diagnosis.explanation.push("  ⚠️ CRITICAL: Lead has NO tenant_id set!");
      }
      
      if (!checks.user_has_tenant) {
        diagnosis.explanation.push("  ⚠️ CRITICAL: User has NO tenant_id set!");
      }
      
      if (checks.lead_has_tenant && checks.user_has_tenant && !checks.tenant_matches) {
        diagnosis.explanation.push(`  ❌ Tenant mismatch: Lead(${lead.tenant_id}) ≠ User(${targetUser.tenant_id})`);
      }
      
      if (checks.tenant_matches && !checks.user_is_manager && !checks.user_is_admin && !checks.user_is_power_user) {
        diagnosis.explanation.push(`  ❌ User employee_role is '${targetUser.employee_role}' (needs to be 'manager' or role needs to be 'admin'/'power-user')`);
      }
      
      if (checks.tenant_matches && targetUser.employee_role === 'employee' && !checks.user_is_assigned) {
        diagnosis.explanation.push(`  ❌ Employee user not assigned to this lead`);
      }
    } else {
      diagnosis.explanation.push("✅ USER CAN SEE LEAD");
    }

    // Suggest fixes
    diagnosis.suggested_fixes = [];
    if (!checks.lead_has_tenant) {
      diagnosis.suggested_fixes.push({
        issue: "Lead missing tenant_id",
        fix: `Set lead tenant_id to ${creatorUser?.tenant_id || targetUser.tenant_id || '[tenant_id]'}`,
        action: "update_lead_tenant"
      });
    }
    if (!checks.user_has_tenant) {
      diagnosis.suggested_fixes.push({
        issue: "User missing tenant_id",
        fix: "Set user tenant_id to match their tenant",
        action: "update_user_tenant"
      });
    }
    if (checks.tenant_matches && !checks.user_is_manager && !checks.user_is_admin) {
      diagnosis.suggested_fixes.push({
        issue: "User needs manager role",
        fix: "Set user.employee_role to 'manager'",
        action: "update_user_employee_role"
      });
    }

    return Response.json(diagnosis);

  } catch (error) {
    console.error('[diagnoseLeadVisibility] Error:', error);
    return Response.json({ 
      error: error.message || 'Failed to diagnose lead visibility'
    }, { status: 500 });
  }
});


----------------------------

export default diagnoseLeadVisibility;
