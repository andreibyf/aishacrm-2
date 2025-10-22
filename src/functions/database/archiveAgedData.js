/**
 * archiveAgedData
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';
import { subDays } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // 1. Authenticate and authorize the request
    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const user = await base44.auth.me();
    if (user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    try {
        // 2. Fetch data management settings for the current tenant
        const settingsList = await base44.asServiceRole.entities.DataManagementSettings.filter({ tenant_id: user.tenant_id });
        const settings = settingsList[0] || { activity_retention_days: 365, opportunity_retention_days: 365 };

        const { activity_retention_days, opportunity_retention_days } = settings;

        // 3. Calculate cutoff dates
        const activityCutoffDate = subDays(new Date(), activity_retention_days).toISOString();
        const opportunityCutoffDate = subDays(new Date(), opportunity_retention_days).toISOString();

        // 4. Find and delete aged activities
        const agedActivities = await base44.asServiceRole.entities.Activity.filter({
            tenant_id: user.tenant_id,
            due_date: { $lt: activityCutoffDate },
            status: { $in: ['completed', 'cancelled'] }
        });

        const activityDeletionPromises = agedActivities.map(act => base44.asServiceRole.entities.Activity.delete(act.id));
        await Promise.all(activityDeletionPromises);

        // 5. Find and delete aged opportunities
        const agedOpportunities = await base44.asServiceRole.entities.Opportunity.filter({
            tenant_id: user.tenant_id,
            close_date: { $lt: opportunityCutoffDate },
            stage: { $in: ['closed_won', 'closed_lost'] }
        });

        const opportunityDeletionPromises = agedOpportunities.map(opp => base44.asServiceRole.entities.Opportunity.delete(opp.id));
        await Promise.all(opportunityDeletionPromises);

        console.log(`Archived ${agedActivities.length} activities and ${agedOpportunities.length} opportunities for tenant ${user.tenant_id}`);

        return new Response(JSON.stringify({
            status: 'success',
            archived_activities: agedActivities.length,
            archived_opportunities: agedOpportunities.length,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error('Archival process failed:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message,
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});

----------------------------

export default archiveAgedData;
