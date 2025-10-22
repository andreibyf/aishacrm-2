/**
 * registerDataMaintenanceJobs
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Register Data Maintenance Cron Jobs
 * Sets up automated jobs for Phase 4 & 5 features
 * Run this once to initialize
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const jobsToCreate = [
      {
        name: 'Daily Metrics Calculation',
        function_name: 'calculateDailyMetrics',
        schedule_expression: 'daily_midnight',
        description: 'Calculate and cache daily sales metrics for fast dashboard loading',
        is_active: true,
        max_retries: 2,
        timeout_seconds: 600
      },
      {
        name: 'Monthly Performance Rollup',
        function_name: 'calculateMonthlyPerformance',
        schedule_expression: '0 3 1 * *', // 3 AM on the 1st of each month
        description: 'Calculate comprehensive monthly performance metrics',
        is_active: true,
        max_retries: 2,
        timeout_seconds: 900
      },
      {
        name: 'User Performance Cache Update',
        function_name: 'updateUserPerformanceCache',
        schedule_expression: 'every_30_minutes',
        description: 'Refresh user performance metrics cache',
        is_active: true,
        max_retries: 1,
        timeout_seconds: 300
      },
      {
        name: 'Monthly Data Archival',
        function_name: 'archiveOldData',
        schedule_expression: '0 2 1 * *', // 2 AM on the 1st of each month
        description: 'Archive old completed activities and closed opportunities',
        is_active: true,
        max_retries: 1,
        timeout_seconds: 1800
      }
    ];
    
    const results = [];
    
    for (const job of jobsToCreate) {
      try {
        // Check if job already exists
        const existing = await base44.entities.CronJob.filter({
          function_name: job.function_name
        });
        
        if (existing.length > 0) {
          results.push({
            name: job.name,
            status: 'already_exists',
            id: existing[0].id
          });
          continue;
        }
        
        // Create the job
        const created = await base44.entities.CronJob.create({
          ...job,
          next_execution: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes from now
        });
        
        results.push({
          name: job.name,
          status: 'created',
          id: created.id
        });
        
      } catch (error) {
        results.push({
          name: job.name,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return Response.json({
      success: true,
      message: `Registered ${results.filter(r => r.status === 'created').length} new cron jobs`,
      results: results
    });
    
  } catch (error) {
    console.error("Error registering data maintenance jobs:", error);
    return Response.json({ 
      error: error.message,
      success: false
    }, { status: 500 });
  }
});

----------------------------

export default registerDataMaintenanceJobs;
