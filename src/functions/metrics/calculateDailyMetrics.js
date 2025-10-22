/**
 * calculateDailyMetrics
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Calculate Daily Sales Metrics
 * Computes and stores aggregated metrics for fast dashboard loading
 * Should run nightly via cron job
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { targetDate, tenantId } = await req.json();
    
    const date = targetDate ? new Date(targetDate) : new Date();
    date.setHours(0, 0, 0, 0); // Start of day
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999); // End of day
    
    const dateStr = date.toISOString().split('T')[0];
    
    console.log(`📊 Calculating metrics for ${dateStr}${tenantId ? ` (tenant: ${tenantId})` : ' (all tenants)'}`);
    
    // Get all tenants or specific tenant
    const tenants = tenantId 
      ? [await base44.asServiceRole.entities.Tenant.get(tenantId)]
      : await base44.asServiceRole.entities.Tenant.list();
    
    const results = [];
    
    for (const tenant of tenants) {
      try {
        // Get all opportunities for this tenant
        const opportunities = await base44.asServiceRole.entities.Opportunity.filter({
          tenant_id: tenant.id
        });
        
        // Calculate metrics
        const totalOpportunities = opportunities.length;
        const totalPipelineValue = opportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);
        
        // Opportunities won/lost on this specific date
        const opportunitiesWon = opportunities.filter(opp => {
          if (opp.stage !== 'closed_won') return false;
          const closedDate = new Date(opp.updated_date);
          return closedDate >= date && closedDate <= endDate;
        });
        
        const opportunitiesLost = opportunities.filter(opp => {
          if (opp.stage !== 'closed_lost') return false;
          const closedDate = new Date(opp.updated_date);
          return closedDate >= date && closedDate <= endDate;
        });
        
        const revenueWon = opportunitiesWon.reduce((sum, opp) => sum + (opp.amount || 0), 0);
        const revenueLost = opportunitiesLost.reduce((sum, opp) => sum + (opp.amount || 0), 0);
        
        // Calculate win rate
        const totalClosed = opportunitiesWon.length + opportunitiesLost.length;
        const winRate = totalClosed > 0 ? (opportunitiesWon.length / totalClosed) * 100 : 0;
        
        // Average deal size
        const averageDealSize = opportunitiesWon.length > 0 
          ? revenueWon / opportunitiesWon.length 
          : 0;
        
        // Stage breakdown
        const stageBreakdown = {
          prospecting: opportunities.filter(o => o.stage === 'prospecting').length,
          qualification: opportunities.filter(o => o.stage === 'qualification').length,
          proposal: opportunities.filter(o => o.stage === 'proposal').length,
          negotiation: opportunities.filter(o => o.stage === 'negotiation').length,
          closed_won: opportunities.filter(o => o.stage === 'closed_won').length,
          closed_lost: opportunities.filter(o => o.stage === 'closed_lost').length
        };
        
        // Breakdown by assigned user
        const assignedToBreakdown = {};
        opportunities.forEach(opp => {
          const assignee = opp.assigned_to || 'unassigned';
          if (!assignedToBreakdown[assignee]) {
            assignedToBreakdown[assignee] = 0;
          }
          assignedToBreakdown[assignee] += (opp.amount || 0);
        });
        
        // Check if metrics already exist for this date
        const existing = await base44.asServiceRole.entities.DailySalesMetrics.filter({
          tenant_id: tenant.id,
          metric_date: dateStr
        });
        
        const metricsData = {
          tenant_id: tenant.id,
          metric_date: dateStr,
          total_opportunities: totalOpportunities,
          total_pipeline_value: totalPipelineValue,
          opportunities_won: opportunitiesWon.length,
          opportunities_lost: opportunitiesLost.length,
          revenue_won: revenueWon,
          revenue_lost: revenueLost,
          win_rate: winRate,
          average_deal_size: averageDealSize,
          stage_breakdown: stageBreakdown,
          assigned_to_breakdown: assignedToBreakdown,
          last_calculated: new Date().toISOString(),
          is_final: date < new Date(new Date().setDate(new Date().getDate() - 1))
        };
        
        if (existing.length > 0) {
          await base44.asServiceRole.entities.DailySalesMetrics.update(existing[0].id, metricsData);
          results.push({ tenant: tenant.name, action: 'updated', date: dateStr });
        } else {
          await base44.asServiceRole.entities.DailySalesMetrics.create(metricsData);
          results.push({ tenant: tenant.name, action: 'created', date: dateStr });
        }
        
      } catch (error) {
        console.error(`Error calculating metrics for tenant ${tenant.name}:`, error);
        results.push({ tenant: tenant.name, action: 'error', error: error.message });
      }
    }
    
    return Response.json({
      success: true,
      date: dateStr,
      results: results,
      message: `Calculated metrics for ${results.length} tenant(s)`
    });
    
  } catch (error) {
    console.error("Error calculating daily metrics:", error);
    return Response.json({ 
      error: error.message,
      success: false
    }, { status: 500 });
  }
});

----------------------------

export default calculateDailyMetrics;
