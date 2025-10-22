/**
 * archiveOldData
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Archive Old Data
 * Moves old records to archive entities to keep main tables fast
 * Runs monthly via cron
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { archiveOlderThan = 365, entityTypes = ['Activity', 'Opportunity'], dryRun = false } = await req.json();
    
    console.log(`🗄️  Starting archival process (${dryRun ? 'DRY RUN' : 'LIVE'})...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - archiveOlderThan);
    
    const results = {
      startTime: new Date().toISOString(),
      cutoffDate: cutoffDate.toISOString(),
      dryRun,
      archived: {
        activities: 0,
        opportunities: 0
      },
      errors: []
    };
    
    // Archive completed/cancelled activities older than cutoff
    if (entityTypes.includes('Activity')) {
      try {
        const oldActivities = await base44.asServiceRole.entities.Activity.filter({
          status: { $in: ['completed', 'cancelled'] }
        });
        
        const toArchive = oldActivities.filter(a => {
          const updated = new Date(a.updated_date);
          return updated < cutoffDate;
        });
        
        console.log(`Found ${toArchive.length} activities to archive`);
        
        if (!dryRun) {
          for (const activity of toArchive) {
            try {
              // In a real implementation, you'd move to an ArchiveActivity entity
              // For now, we'll just mark them with a flag
              await base44.asServiceRole.entities.Activity.update(activity.id, {
                is_archived: true,
                archived_date: new Date().toISOString()
              });
              results.archived.activities++;
            } catch (error) {
              results.errors.push({
                entity: 'Activity',
                id: activity.id,
                error: error.message
              });
            }
          }
        } else {
          results.archived.activities = toArchive.length;
        }
        
      } catch (error) {
        console.error("Error archiving activities:", error);
        results.errors.push({ entity: 'Activity', error: error.message });
      }
    }
    
    // Archive closed opportunities older than cutoff
    if (entityTypes.includes('Opportunity')) {
      try {
        const oldOpportunities = await base44.asServiceRole.entities.Opportunity.filter({
          stage: { $in: ['closed_won', 'closed_lost'] }
        });
        
        const toArchive = oldOpportunities.filter(o => {
          const updated = new Date(o.updated_date);
          return updated < cutoffDate;
        });
        
        console.log(`Found ${toArchive.length} opportunities to archive`);
        
        if (!dryRun) {
          for (const opp of toArchive) {
            try {
              await base44.asServiceRole.entities.Opportunity.update(opp.id, {
                is_archived: true,
                archived_date: new Date().toISOString()
              });
              results.archived.opportunities++;
            } catch (error) {
              results.errors.push({
                entity: 'Opportunity',
                id: opp.id,
                error: error.message
              });
            }
          }
        } else {
          results.archived.opportunities = toArchive.length;
        }
        
      } catch (error) {
        console.error("Error archiving opportunities:", error);
        results.errors.push({ entity: 'Opportunity', error: error.message });
      }
    }
    
    results.endTime = new Date().toISOString();
    results.duration = new Date(results.endTime) - new Date(results.startTime);
    
    console.log(`✅ Archival complete: ${results.archived.activities + results.archived.opportunities} records processed`);
    
    return Response.json({
      success: true,
      results: results
    });
    
  } catch (error) {
    console.error("Error in archival process:", error);
    return Response.json({ 
      error: error.message,
      success: false
    }, { status: 500 });
  }
});

----------------------------

export default archiveOldData;
