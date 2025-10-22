/**
 * generateDailyBriefing
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user is authenticated
    const currentUser = await base44.auth.me();
    if (!currentUser) {
      return new Response(JSON.stringify({ 
        error: 'Unauthorized',
        success: false 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`Generating daily briefing for user: ${currentUser.email}`);

    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    const userName = currentUser.full_name || currentUser.display_name || currentUser.email?.split('@')[0] || 'there';

    // CRITICAL FIX: Build tenant filter based on user role
    let tenantFilter = {};
    
    if (currentUser.role === 'superadmin') {
      // Superadmin without tenant_id sees nothing (must select tenant)
      if (!currentUser.tenant_id) {
        return new Response(JSON.stringify({
          success: true,
          briefing: `Good ${getTimeOfDay()} ${userName}! Please select a client to view their daily briefing.`,
          stats: { activities: 0, leads: 0, opportunities: 0 }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      tenantFilter.tenant_id = currentUser.tenant_id;
    } else if (currentUser.tenant_id) {
      // All other users with tenant_id see their tenant's data
      tenantFilter.tenant_id = currentUser.tenant_id;
    } else {
      // User without tenant_id sees nothing
      return new Response(JSON.stringify({
        success: true,
        briefing: `Good ${getTimeOfDay()} ${userName}! You don't have a client assigned yet.`,
        stats: { activities: 0, leads: 0, opportunities: 0 }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Daily briefing tenant filter:', tenantFilter);

    try {
      // Get today's activities with tenant filter
      const todaysActivities = await base44.entities.Activity.filter({
        ...tenantFilter,
        due_date: today,
        status: { $in: ['scheduled', 'in-progress'] }
      });

      // Get recent leads with tenant filter
      const recentLeads = await base44.entities.Lead.filter({
        ...tenantFilter,
        status: { $in: ['new', 'contacted'] }
      });

      // Get pipeline opportunities with tenant filter
      const opportunities = await base44.entities.Opportunity.filter({
        ...tenantFilter,
        stage: { $in: ['prospecting', 'qualification', 'proposal'] }
      });

      console.log('Daily briefing data counts:', {
        activities: todaysActivities.length,
        leads: recentLeads.length,
        opportunities: opportunities.length,
        tenant: tenantFilter.tenant_id
      });

      // Create a simple briefing
      let briefing = `Good ${getTimeOfDay()} ${userName}! Here's your daily CRM briefing.`;

      if (todaysActivities.length > 0) {
        briefing += ` You have ${todaysActivities.length} activities scheduled for today.`;
      } else {
        briefing += ` Your schedule looks clear today - perfect time to focus on your pipeline or reach out to prospects.`;
      }

      if (recentLeads.length > 0) {
        briefing += ` You have ${recentLeads.length} active leads that could use attention.`;
      }

      if (opportunities.length > 0) {
        briefing += ` Your pipeline has ${opportunities.length} active opportunities.`;
      }

      briefing += ` Have a productive day!`;

      console.log('Daily briefing generated successfully');

      return new Response(JSON.stringify({
        success: true,
        briefing: briefing,
        stats: {
          activities: todaysActivities.length,
          leads: recentLeads.length,
          opportunities: opportunities.length
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (dataError) {
      console.error('Error fetching CRM data:', dataError);
      
      // Fallback briefing if data fetch fails
      const fallbackBriefing = `Good ${getTimeOfDay()} ${userName}! Welcome to your CRM dashboard. Have a great day managing your business relationships!`;
      
      return new Response(JSON.stringify({
        success: true,
        briefing: fallbackBriefing,
        fallback: true,
        stats: {
          activities: 0,
          leads: 0,
          opportunities: 0
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Daily briefing generation failed:', error);
    
    return new Response(JSON.stringify({
      error: error.message || 'Failed to generate daily briefing',
      success: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Helper function to determine time of day
function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

----------------------------

export default generateDailyBriefing;
