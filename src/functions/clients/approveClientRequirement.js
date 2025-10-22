/**
 * approveClientRequirement
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  console.log('[approveClientRequirement] === FUNCTION START ===');
  
  try {
    console.log('[approveClientRequirement] Step 1: Creating client from request');
    const base44 = createClientFromRequest(req);
    
    console.log('[approveClientRequirement] Step 2: Getting authenticated user');
    const user = await base44.auth.me();
    console.log('[approveClientRequirement] User:', user?.email, 'Role:', user?.role);
    
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      console.log('[approveClientRequirement] ERROR: Unauthorized user');
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    console.log('[approveClientRequirement] Step 3: Parsing request body');
    const { requirement_id, admin_notes } = await req.json();
    console.log('[approveClientRequirement] requirement_id:', requirement_id);
    
    if (!requirement_id) {
      console.log('[approveClientRequirement] ERROR: Missing requirement_id');
      return Response.json({ error: 'requirement_id is required' }, { status: 400 });
    }

    console.log('[approveClientRequirement] Step 4: Fetching requirement with service role');
    const requirement = await base44.asServiceRole.entities.ClientRequirement.get(requirement_id);
    console.log('[approveClientRequirement] Requirement fetched:', requirement?.company_name);
    
    if (!requirement) {
      console.log('[approveClientRequirement] ERROR: Requirement not found');
      return Response.json({ error: 'Requirement not found' }, { status: 404 });
    }

    if (requirement.status === 'approved') {
      console.log('[approveClientRequirement] ERROR: Already approved');
      return Response.json({ error: 'This requirement has already been approved' }, { status: 400 });
    }

    console.log('[approveClientRequirement] Step 5: Validating initial employee');
    if (!requirement.initial_employee || !requirement.initial_employee.email) {
      console.log('[approveClientRequirement] ERROR: Missing employee info');
      return Response.json({ 
        error: 'Missing initial employee information',
        details: 'The client requirement must have an initial_employee with email'
      }, { status: 400 });
    }

    console.log('[approveClientRequirement] Step 6: Creating tenant');
    const newTenant = await base44.asServiceRole.entities.Tenant.create({
      name: requirement.company_name,
      industry: requirement.industry,
      business_model: requirement.business_model || 'b2b',
      geographic_focus: requirement.geographic_focus || 'north_america',
      branding_settings: {
        companyName: requirement.company_name
      }
    });
    console.log('[approveClientRequirement] Tenant created:', newTenant.id);

    console.log('[approveClientRequirement] Step 7: Creating module settings');
    const moduleEntries = Object.entries(requirement.selected_modules || {})
      .filter(([_, isActive]) => isActive !== undefined);
    console.log('[approveClientRequirement] Creating', moduleEntries.length, 'module settings');
    
    const moduleNames = {
      dashboard: 'Dashboard',
      contacts: 'Contacts',
      accounts: 'Accounts',
      leads: 'Leads',
      opportunities: 'Opportunities',
      activities: 'Activities',
      calendar: 'Calendar',
      bizdev_sources: 'BizDev Sources',
      cash_flow: 'Cash Flow',
      document_processing: 'Document Processing',
      employees: 'Employees',
      reports: 'Reports',
      integrations: 'Integrations',
      payment_portal: 'Payment Portal',
      ai_campaigns: 'AI Campaigns',
      utilities: 'Utilities'
    };

    const moduleSettingsPromises = moduleEntries.map(([moduleId, isActive]) => {
      console.log('[approveClientRequirement] Creating module setting:', moduleId, isActive);
      return base44.asServiceRole.entities.ModuleSettings.create({
        tenant_id: newTenant.id,
        module_id: moduleId,
        module_name: moduleNames[moduleId] || moduleId,
        is_active: isActive,
        user_email: user.email
      });
    });

    await Promise.all(moduleSettingsPromises);
    console.log('[approveClientRequirement] Module settings created successfully');

    console.log('[approveClientRequirement] Step 8: Creating user invitation');
    const inviteToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await base44.asServiceRole.entities.UserInvitation.create({
      email: requirement.initial_employee.email,
      full_name: `${requirement.initial_employee.first_name} ${requirement.initial_employee.last_name}`,
      role: requirement.initial_employee.role || 'admin',
      tenant_id: newTenant.id,
      invited_by: user.email,
      invitation_token: inviteToken,
      is_used: false,
      expires_at: expiresAt.toISOString(),
      requested_access: requirement.initial_employee.access_level || 'read_write',
      can_use_softphone: false,
      requested_permissions: {
        employee_role: requirement.initial_employee.employee_role || 'manager',
        navigation_permissions: requirement.navigation_permissions || {}
      }
    });
    console.log('[approveClientRequirement] Invitation created:', invitation.id);

    console.log('[approveClientRequirement] Step 9: Updating requirement status');
    await base44.asServiceRole.entities.ClientRequirement.update(requirement_id, {
      status: 'approved',
      approved_by: user.email,
      approved_at: new Date().toISOString(),
      admin_notes: admin_notes || '',
      created_tenant_id: newTenant.id,
      created_user_id: invitation.id
    });
    console.log('[approveClientRequirement] Requirement updated successfully');

    console.log('[approveClientRequirement] === SUCCESS ===');
    const signupUrl = `${req.headers.get('origin') || 'https://app.base44.com'}/signup?token=${inviteToken}`;
    
    return Response.json({
      success: true,
      message: 'Client requirement approved and tenant created successfully',
      tenant_id: newTenant.id,
      invitation_id: invitation.id,
      invitation_link: signupUrl,
      invitation_email: requirement.initial_employee.email
    });

  } catch (error) {
    console.error('[approveClientRequirement] === ERROR ===');
    console.error('[approveClientRequirement] Error message:', error.message);
    console.error('[approveClientRequirement] Error stack:', error.stack);
    
    return Response.json({
      error: 'Failed to approve requirement',
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});

----------------------------

export default approveClientRequirement;
