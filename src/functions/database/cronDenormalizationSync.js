/**
 * cronDenormalizationSync
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Automated Denormalization Sync Cron Job with Health Logging
 * Runs daily to keep denormalized fields in sync
 * Should be registered in CronJob entity with schedule: "0 2 * * *" (2 AM daily)
 */

Deno.serve(async (req) => {
  const startTime = new Date();
  let healthLogId = null;

  try {
    const base44 = createClientFromRequest(req);
    const { tenantId, mode = 'incremental' } = await req.json();
    
    console.log(`[Cron Denorm Sync] Starting ${mode} sync for tenant: ${tenantId || 'ALL'}`);
    
    // Create initial health log
    const healthLog = await base44.asServiceRole.entities.SyncHealth.create({
      sync_type: 'denormalization',
      tenant_id: tenantId || null,
      start_time: startTime.toISOString(),
      status: 'running',
      mode: mode,
      triggered_by: 'cron',
      records_processed: 0,
      records_updated: 0,
      error_count: 0,
      errors: []
    });
    healthLogId = healthLog.id;

    const results = {
      startTime: startTime.toISOString(),
      tenants: [],
      totalProcessed: 0,
      totalSynced: 0,
      totalErrors: 0,
      success: true
    };

    // ... keep existing code (syncTenant helper) ...

    // Get all tenants or specific tenant
    let tenants = [];
    if (tenantId) {
      const tenant = await base44.asServiceRole.entities.Tenant.get(tenantId);
      if (tenant) tenants = [tenant];
    } else {
      tenants = await base44.asServiceRole.entities.Tenant.list('-created_date', 100);
    }

    console.log(`[Cron Denorm Sync] Found ${tenants.length} tenants to sync`);

    // Sync each tenant
    for (const tenant of tenants) {
      const tenantResult = await syncTenant(tenant);
      results.tenants.push(tenantResult);
      results.totalSynced += tenantResult.totalSynced || 0;
      results.totalErrors += tenantResult.errorCount || 0;
      results.totalProcessed += tenantResult.totalProcessed || 0;
    }

    const endTime = new Date();
    results.endTime = endTime.toISOString();
    results.duration = endTime - startTime;

    // Aggregate entity stats
    const entityStats = {
      contacts: results.tenants.reduce((sum, t) => sum + (t.contacts || 0), 0),
      leads: results.tenants.reduce((sum, t) => sum + (t.leads || 0), 0),
      opportunities: results.tenants.reduce((sum, t) => sum + (t.opportunities || 0), 0),
      activities: results.tenants.reduce((sum, t) => sum + (t.activities || 0), 0)
    };

    // Collect all errors
    const allErrors = [];
    for (const tenant of results.tenants) {
      if (tenant.errors && tenant.errors.length > 0) {
        allErrors.push(...tenant.errors.map(e => ({
          tenant_id: tenant.tenantId,
          ...e
        })));
      }
    }

    // Update health log with final results
    await base44.asServiceRole.entities.SyncHealth.update(healthLogId, {
      end_time: endTime.toISOString(),
      duration_ms: results.duration,
      status: results.totalErrors > 0 ? 'partial' : 'completed',
      records_processed: results.totalProcessed,
      records_updated: results.totalSynced,
      error_count: results.totalErrors,
      errors: allErrors.slice(0, 100), // Keep max 100 errors
      entity_stats: entityStats
    });

    // Create notification for admins if errors occurred
    if (results.totalErrors > 0) {
      try {
        const adminUsers = await base44.asServiceRole.entities.User.filter({
          role: { $in: ['admin', 'superadmin'] }
        });

        for (const admin of adminUsers) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: admin.email,
            title: 'Denormalization Sync Errors',
            description: `Daily sync completed with ${results.totalErrors} errors. ${results.totalSynced} records updated.`,
            link: '/settings?tab=data-consistency',
            icon: 'AlertCircle'
          });
        }
      } catch (error) {
        console.error('[Cron Denorm Sync] Failed to create error notifications:', error);
      }
    }

    console.log(`[Cron Denorm Sync] Complete. Synced: ${results.totalSynced}, Errors: ${results.totalErrors}`);

    return Response.json({
      success: true,
      message: 'Denormalization sync completed',
      results: results,
      healthLogId: healthLogId
    });

  } catch (error) {
    console.error('[Cron Denorm Sync] Fatal error:', error);

    // Update health log with failure
    if (healthLogId) {
      try {
        await base44.asServiceRole.entities.SyncHealth.update(healthLogId, {
          end_time: new Date().toISOString(),
          duration_ms: new Date() - startTime,
          status: 'failed',
          error_count: 1,
          errors: [{ error: error.message }]
        });
      } catch (updateError) {
        console.error('[Cron Denorm Sync] Failed to update health log:', updateError);
      }
    }

    return Response.json({
      success: false,
      error: error.message || 'Sync failed'
    }, { status: 500 });
  }
});

----------------------------

export default cronDenormalizationSync;
