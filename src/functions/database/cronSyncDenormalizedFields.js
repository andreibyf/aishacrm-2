/**
 * cronSyncDenormalizedFields
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Cron Job: Automated Denormalized Field Sync
 * Runs daily to keep cached data fresh
 * Called by cronJobRunner on schedule
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // This is a system-level cron job, use service role
    const allTenants = await base44.asServiceRole.entities.Tenant.list();
    
    // Ensure allTenants is an array
    const tenantList = Array.isArray(allTenants) ? allTenants : [];
    
    const results = {
      totalTenants: tenantList.length,
      successfulTenants: 0,
      failedTenants: 0,
      totalRecordsSynced: 0,
      tenantResults: [],
      startTime: new Date().toISOString(),
      endTime: null,
      duration: null
    };

    console.log(`🔄 Starting automated sync for ${tenantList.length} tenants...`);

    for (const tenant of tenantList) {
      const tenantResult = {
        tenantId: tenant?.id,
        tenantName: tenant?.name || 'Unknown',
        success: false,
        recordsSynced: 0,
        errors: []
      };

      try {
        // Call the sync function with incremental mode for efficiency
        const apiUrl = Deno.env.get('BASE44_API_URL') || 'https://app.base44.com';
        const serviceKey = Deno.env.get('BASE44_SERVICE_KEY');
        
        if (!serviceKey) {
          throw new Error('BASE44_SERVICE_KEY not configured');
        }

        const syncResponse = await fetch(`${apiUrl}/api/functions/syncDenormalizedFields`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify({
            tenantId: tenant.id,
            mode: 'incremental', // Daily incremental sync
            entityType: null // All entities
          })
        });

        const syncData = await syncResponse.json();

        if (syncData?.success) {
          tenantResult.success = true;
          tenantResult.recordsSynced = syncData.totalSynced || 0;
          results.successfulTenants++;
          results.totalRecordsSynced += tenantResult.recordsSynced;
        } else {
          tenantResult.errors.push(syncData?.error || 'Unknown error');
          results.failedTenants++;
        }
      } catch (error) {
        console.error(`❌ Sync failed for tenant ${tenant?.name || tenant?.id}:`, error);
        tenantResult.errors.push(error.message);
        results.failedTenants++;
      }

      results.tenantResults.push(tenantResult);
    }

    results.endTime = new Date().toISOString();
    results.duration = new Date(results.endTime) - new Date(results.startTime);

    console.log(`✅ Automated sync completed: ${results.successfulTenants}/${results.totalTenants} tenants successful`);

    // Create notification for admins about sync results
    if (results.failedTenants > 0) {
      try {
        await base44.asServiceRole.entities.Notification.create({
          user_email: 'admin@system',
          title: 'Denormalization Sync Completed with Errors',
          description: `Synced ${results.totalRecordsSynced} records across ${results.successfulTenants} tenants, but ${results.failedTenants} tenants failed.`,
          icon: 'AlertCircle',
          link: '/settings?tab=monitoring'
        });
      } catch (error) {
        console.warn('Could not create notification:', error);
      }
    }

    return Response.json({
      success: true,
      results: results
    });

  } catch (error) {
    console.error("Cron sync error:", error);
    return Response.json({ 
      error: error.message || 'Cron sync failed',
      success: false
    }, { status: 500 });
  }
});

----------------------------

export default cronSyncDenormalizedFields;
