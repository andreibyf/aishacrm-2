/**
 * diagnoseActivityVisibility
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();
    
    if (!currentUser) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { activity_id } = body;

    if (!activity_id) {
      return Response.json({ error: 'activity_id required' }, { status: 400 });
    }

    // Fetch activity using service role (bypasses RLS)
    const activities = await base44.asServiceRole.entities.Activity.filter({ id: activity_id });
    
    if (!activities || activities.length === 0) {
      return Response.json({ 
        error: 'Activity not found in database',
        activity_id 
      }, { status: 404 });
    }

    const activity = activities[0];

    // Try to fetch with user's normal permissions
    let userCanSee = false;
    try {
      const userActivities = await base44.entities.Activity.filter({ id: activity_id });
      userCanSee = userActivities && userActivities.length > 0;
    } catch (error) {
      userCanSee = false;
    }

    // Get the tenant info
    let tenantInfo = null;
    if (activity.tenant_id) {
      try {
        const tenants = await base44.asServiceRole.entities.Tenant.filter({ id: activity.tenant_id });
        tenantInfo = tenants?.[0] || null;
      } catch (e) {
        console.error('Failed to fetch tenant:', e);
      }
    }

    // Get creator info
    let creatorInfo = null;
    if (activity.created_by) {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ email: activity.created_by });
        creatorInfo = users?.[0] || null;
      } catch (e) {
        console.error('Failed to fetch creator:', e);
      }
    }

    // Check RLS conditions
    const rlsEvaluation = {
      user_is_superadmin: currentUser.role === 'superadmin',
      user_is_admin: currentUser.role === 'admin',
      user_tenant_matches: currentUser.tenant_id === activity.tenant_id,
      user_is_manager: currentUser.employee_role === 'manager',
      user_is_employee: currentUser.employee_role === 'employee',
      user_created_it: currentUser.email === activity.created_by,
      user_assigned_to_it: currentUser.email === activity.assigned_to,
      activity_unassigned: !activity.assigned_to || activity.assigned_to === null,
      should_see_by_rls: false
    };

    // Evaluate RLS logic manually
    if (rlsEvaluation.user_is_superadmin || rlsEvaluation.user_is_admin) {
      rlsEvaluation.should_see_by_rls = true;
    } else if (rlsEvaluation.user_tenant_matches) {
      if (rlsEvaluation.user_is_manager || currentUser.employee_role === null) {
        rlsEvaluation.should_see_by_rls = true;
      } else if (rlsEvaluation.user_is_employee) {
        if (rlsEvaluation.user_created_it || rlsEvaluation.user_assigned_to_it || rlsEvaluation.activity_unassigned) {
          rlsEvaluation.should_see_by_rls = true;
        }
      }
    }

    return Response.json({
      activity_exists: true,
      user_can_see: userCanSee,
      should_see_by_rls: rlsEvaluation.should_see_by_rls,
      current_user: {
        email: currentUser.email,
        role: currentUser.role,
        employee_role: currentUser.employee_role,
        tenant_id: currentUser.tenant_id
      },
      activity_record: {
        id: activity.id,
        subject: activity.subject,
        type: activity.type,
        status: activity.status,
        tenant_id: activity.tenant_id,
        created_by: activity.created_by,
        assigned_to: activity.assigned_to,
        created_date: activity.created_date,
        is_test_data: activity.is_test_data,
        related_to: activity.related_to,
        related_id: activity.related_id
      },
      tenant_info: tenantInfo ? {
        id: tenantInfo.id,
        name: tenantInfo.name
      } : null,
      creator_info: creatorInfo ? {
        email: creatorInfo.email,
        full_name: creatorInfo.full_name,
        role: creatorInfo.role,
        tenant_id: creatorInfo.tenant_id
      } : null,
      rls_evaluation: rlsEvaluation,
      diagnosis: {
        issue_found: !userCanSee && rlsEvaluation.should_see_by_rls,
        possible_causes: []
      }
    });

  } catch (error) {
    console.error('Error diagnosing activity visibility:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

----------------------------

export default diagnoseActivityVisibility;
