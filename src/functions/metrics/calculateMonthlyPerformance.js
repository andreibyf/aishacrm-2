/**
 * calculateMonthlyPerformance
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Calculate Monthly Performance Metrics
 * Comprehensive monthly rollup of all key metrics
 * Runs at the end of each month
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { year, month, tenantId } = await req.json();
    
    const targetYear = year || new Date().getFullYear();
    const targetMonth = month || new Date().getMonth() + 1;
    
    // Calculate date range
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);
    
    console.log(`📊 Calculating monthly performance for ${targetYear}-${targetMonth}`);
    
    // Get all tenants or specific tenant
    const tenants = tenantId 
      ? [await base44.asServiceRole.entities.Tenant.get(tenantId)]
      : await base44.asServiceRole.entities.Tenant.list();
    
    const results = [];
    
    for (const tenant of tenants) {
      try {
        // Get all entities for this tenant within the month
        const [leads, contacts, opportunities, activities] = await Promise.all([
          base44.asServiceRole.entities.Lead.filter({ tenant_id: tenant.id }),
          base44.asServiceRole.entities.Contact.filter({ tenant_id: tenant.id }),
          base44.asServiceRole.entities.Opportunity.filter({ tenant_id: tenant.id }),
          base44.asServiceRole.entities.Activity.filter({ tenant_id: tenant.id })
        ]);
        
        // Filter to records created in this month
        const leadsThisMonth = leads.filter(l => {
          const created = new Date(l.created_date);
          return created >= startDate && created <= endDate;
        });
        
        const contactsThisMonth = contacts.filter(c => {
          const created = new Date(c.created_date);
          return created >= startDate && created <= endDate;
        });
        
        const opportunitiesThisMonth = opportunities.filter(o => {
          const created = new Date(o.created_date);
          return created >= startDate && created <= endDate;
        });
        
        // Opportunities won/lost in this month
        const opportunitiesWon = opportunities.filter(o => {
          if (o.stage !== 'closed_won') return false;
          const updated = new Date(o.updated_date);
          return updated >= startDate && updated <= endDate;
        });
        
        const opportunitiesLost = opportunities.filter(o => {
          if (o.stage !== 'closed_lost') return false;
          const updated = new Date(o.updated_date);
          return updated >= startDate && updated <= endDate;
        });
        
        const revenueWon = opportunitiesWon.reduce((sum, o) => sum + (o.amount || 0), 0);
        
        // Calculate pipeline value at end of month
        const pipelineValue = opportunities
          .filter(o => o.stage !== 'closed_won' && o.stage !== 'closed_lost')
          .reduce((sum, o) => sum + (o.amount || 0), 0);
        
        // Win rate
        const totalClosed = opportunitiesWon.length + opportunitiesLost.length;
        const winRate = totalClosed > 0 ? (opportunitiesWon.length / totalClosed) * 100 : 0;
        
        // Average deal size
        const averageDealSize = opportunitiesWon.length > 0 
          ? revenueWon / opportunitiesWon.length 
          : 0;
        
        // Average sales cycle (from created to closed)
        let totalCycleDays = 0;
        opportunitiesWon.forEach(opp => {
          const created = new Date(opp.created_date);
          const closed = new Date(opp.updated_date);
          const days = Math.floor((closed - created) / (1000 * 60 * 60 * 24));
          totalCycleDays += days;
        });
        const averageSalesCycle = opportunitiesWon.length > 0 
          ? totalCycleDays / opportunitiesWon.length 
          : 0;
        
        // Lead conversion rate
        const convertedLeads = leads.filter(l => l.status === 'converted').length;
        const leadConversionRate = leads.length > 0 
          ? (convertedLeads / leads.length) * 100 
          : 0;
        
        // Activities completed this month
        const activitiesCompleted = activities.filter(a => {
          if (a.status !== 'completed') return false;
          const updated = new Date(a.updated_date);
          return updated >= startDate && updated <= endDate;
        }).length;
        
        // Top performers
        const performanceByUser = {};
        opportunitiesWon.forEach(opp => {
          const user = opp.assigned_to || 'unassigned';
          if (!performanceByUser[user]) {
            performanceByUser[user] = {
              user_email: user,
              user_name: opp.assigned_to_name || user,
              opportunities_won: 0,
              revenue: 0
            };
          }
          performanceByUser[user].opportunities_won++;
          performanceByUser[user].revenue += (opp.amount || 0);
        });
        
        const topPerformers = Object.values(performanceByUser)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10);
        
        // Lead sources breakdown
        const leadSources = {};
        leads.forEach(lead => {
          const source = lead.source || 'unknown';
          leadSources[source] = (leadSources[source] || 0) + 1;
        });
        
        // Industry breakdown
        const industryBreakdown = {};
        opportunities.forEach(opp => {
          const industry = opp.account_industry || 'unknown';
          if (!industryBreakdown[industry]) {
            industryBreakdown[industry] = 0;
          }
          industryBreakdown[industry] += (opp.amount || 0);
        });
        
        // Check if metrics already exist
        const existing = await base44.asServiceRole.entities.MonthlyPerformance.filter({
          tenant_id: tenant.id,
          year: targetYear,
          month: targetMonth
        });
        
        const performanceData = {
          tenant_id: tenant.id,
          year: targetYear,
          month: targetMonth,
          total_leads: leadsThisMonth.length,
          total_contacts: contactsThisMonth.length,
          total_opportunities: opportunitiesThisMonth.length,
          opportunities_won: opportunitiesWon.length,
          opportunities_lost: opportunitiesLost.length,
          revenue_won: revenueWon,
          pipeline_value: pipelineValue,
          win_rate: winRate,
          average_deal_size: averageDealSize,
          average_sales_cycle: averageSalesCycle,
          lead_conversion_rate: leadConversionRate,
          activities_completed: activitiesCompleted,
          top_performers: topPerformers,
          lead_sources: leadSources,
          industry_breakdown: industryBreakdown,
          last_calculated: new Date().toISOString()
        };
        
        if (existing.length > 0) {
          await base44.asServiceRole.entities.MonthlyPerformance.update(existing[0].id, performanceData);
          results.push({ tenant: tenant.name, action: 'updated' });
        } else {
          await base44.asServiceRole.entities.MonthlyPerformance.create(performanceData);
          results.push({ tenant: tenant.name, action: 'created' });
        }
        
      } catch (error) {
        console.error(`Error calculating monthly performance for tenant ${tenant.name}:`, error);
        results.push({ tenant: tenant.name, action: 'error', error: error.message });
      }
    }
    
    return Response.json({
      success: true,
      year: targetYear,
      month: targetMonth,
      results: results,
      message: `Calculated monthly performance for ${results.length} tenant(s)`
    });
    
  } catch (error) {
    console.error("Error calculating monthly performance:", error);
    return Response.json({ 
      error: error.message,
      success: false
    }, { status: 500 });
  }
});

----------------------------

export default calculateMonthlyPerformance;
