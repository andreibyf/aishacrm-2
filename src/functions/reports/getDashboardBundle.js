/**
 * getDashboardBundle
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { tenantFilter, signal } = await req.json();
    
    console.log('[getDashboardStats] Request received:', {
      userEmail: user.email,
      userRole: user.role,
      tenantFilter,
      includesTestDataFilter: tenantFilter?.is_test_data !== undefined
    });

    // Fetch all data in parallel with tenant filter
    const [contacts, leads, opportunities, activities] = await Promise.all([
      base44.entities.Contact.filter(tenantFilter || {}),
      base44.entities.Lead.filter(tenantFilter || {}),
      base44.entities.Opportunity.filter(tenantFilter || {}),
      base44.entities.Activity.filter(tenantFilter || {})
    ]);

    console.log('[getDashboardStats] Raw data counts:', {
      contacts: contacts.length,
      leads: leads.length,
      opportunities: opportunities.length,
      activities: activities.length,
      testDataFilter: tenantFilter?.is_test_data
    });

    // Calculate stats
    const totalContacts = contacts.length;
    const newLeads = leads.filter(l => l.status === 'new' || l.status === 'contacted').length;
    const activeOpportunities = opportunities.filter(o => 
      o.stage !== 'closed_won' && o.stage !== 'closed_lost'
    ).length;
    const pipelineValue = opportunities
      .filter(o => o.stage !== 'closed_won' && o.stage !== 'closed_lost')
      .reduce((sum, o) => sum + (o.amount || 0), 0);
    const activitiesLogged = activities.length;

    // Calculate trends (simplified for now)
    const trends = {
      contacts: 0,
      leads: 0,
      opportunities: 0,
      pipeline: 0,
      activities: 0
    };

    const stats = {
      totalContacts,
      newLeads,
      activeOpportunities,
      pipelineValue,
      activitiesLogged,
      trends
    };

    console.log('[getDashboardStats] Calculated stats:', stats);

    return new Response(JSON.stringify({
      success: true,
      stats,
      contacts,
      leads,
      opportunities,
      activities
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[getDashboardStats] Error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Failed to fetch dashboard data'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

----------------------------

export default getDashboardBundle;
