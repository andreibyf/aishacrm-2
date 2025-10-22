/**
 * getDashboardStats
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Get the authenticated user
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantFilter } = await req.json();
    
    console.log('[getDashboardStats] Received request:', {
      userEmail: user.email,
      userRole: user.role,
      tenantFilter: tenantFilter,
      hasTestDataFilter: tenantFilter?.is_test_data !== undefined
    });

    // Build the base filter - CRITICAL: Use the exact tenantFilter passed from Dashboard
    const baseFilter = { ...tenantFilter };

    console.log('[getDashboardStats] Using base filter:', baseFilter);

    // Fetch counts in parallel with proper filtering
    const [contacts, leads, opps, activities] = await Promise.all([
      base44.entities.Contact.filter(baseFilter),
      base44.entities.Lead.filter(baseFilter),
      base44.entities.Opportunity.filter({ ...baseFilter, stage: { $nin: ['closed_won', 'closed_lost'] } }),
      base44.entities.Activity.filter({ ...baseFilter, status: 'completed' })
    ]);

    console.log('[getDashboardStats] Fetched data counts:', {
      contacts: (contacts || []).length,
      leads: (leads || []).length,
      opportunities: (opps || []).length,
      activities: (activities || []).length,
      filterUsed: baseFilter
    });

    // Calculate pipeline value
    let pipelineValue = 0;
    if (opps && Array.isArray(opps)) {
      pipelineValue = opps.reduce((sum, opp) => sum + (opp.amount || 0), 0);
    }

    // Filter activities by last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentActivities = (activities || []).filter(a => {
      const completedDate = new Date(a.updated_date || a.created_date);
      return completedDate >= thirtyDaysAgo;
    });

    // Filter leads by last 30 days
    const recentLeads = (leads || []).filter(l => {
      const createdDate = new Date(l.created_date);
      return createdDate >= thirtyDaysAgo;
    });

    const stats = {
      totalContacts: (contacts || []).length,
      newLeads: recentLeads.length,
      activeOpportunities: (opps || []).length,
      pipelineValue: pipelineValue,
      activitiesLogged: recentActivities.length,
      trends: {
        contacts: null,
        newLeads: null,
        activeOpportunities: null,
        pipelineValue: null,
        activitiesLogged: null,
      }
    };

    console.log('[getDashboardStats] Calculated stats:', stats);

    return Response.json({ stats });
  } catch (error) {
    console.error('[getDashboardStats] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

----------------------------

export default getDashboardStats;
