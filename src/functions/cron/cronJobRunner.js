/**
 * cronJobRunner
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can trigger cron jobs
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return Response.json({ 
        success: false, 
        error: 'Forbidden: Admin access required' 
      }, { status: 403 });
    }

    const now = new Date();
    
    // Fetch all active cron jobs with a timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    
    let cronJobs;
    try {
      cronJobs = await base44.asServiceRole.entities.CronJob.filter(
        { is_active: true },
        null,
        100
      );
    } catch (error) {
      clearTimeout(timeout);
      console.error('CronJobRunner: Failed to fetch cron jobs:', error.message);
      return Response.json({ 
        success: false, 
        error: 'Failed to fetch cron jobs',
        details: error.message 
      }, { status: 500 });
    }
    
    clearTimeout(timeout);

    if (!cronJobs || cronJobs.length === 0) {
      return Response.json({ 
        success: true, 
        message: 'No active cron jobs to run',
        duration_ms: Date.now() - startTime
      });
    }

    const results = [];
    let executed = 0;
    let skipped = 0;
    let failed = 0;

    for (const job of cronJobs) {
      try {
        // Check if job is due to run
        const nextExecution = job.next_execution ? new Date(job.next_execution) : null;
        
        if (nextExecution && nextExecution > now) {
          skipped++;
          continue;
        }

        // Calculate next execution time based on schedule
        const nextRun = calculateNextExecution(job.schedule_expression, now);
        
        // Update job status before execution
        await base44.asServiceRole.entities.CronJob.update(job.id, {
          last_executed: now.toISOString(),
          next_execution: nextRun ? nextRun.toISOString() : null,
          execution_count: (job.execution_count || 0) + 1
        }).catch(err => {
          console.warn(`Failed to update cron job ${job.name}:`, err.message);
        });

        executed++;
        results.push({
          job_id: job.id,
          job_name: job.name,
          status: 'executed',
          next_run: nextRun ? nextRun.toISOString() : null
        });

      } catch (error) {
        failed++;
        console.error(`CronJobRunner: Error processing job ${job.name}:`, error.message);
        
        results.push({
          job_id: job.id,
          job_name: job.name,
          status: 'failed',
          error: error.message
        });

        // Update error count
        try {
          await base44.asServiceRole.entities.CronJob.update(job.id, {
            error_count: (job.error_count || 0) + 1,
            last_result: { error: error.message, timestamp: now.toISOString() }
          });
        } catch (updateError) {
          console.warn(`Failed to update error count for ${job.name}:`, updateError.message);
        }
      }
    }

    return Response.json({
      success: true,
      summary: {
        total_jobs: cronJobs.length,
        executed,
        skipped,
        failed
      },
      results,
      duration_ms: Date.now() - startTime
    });

  } catch (error) {
    console.error('CronJobRunner: Fatal error:', error.message);
    
    return Response.json({
      success: false,
      error: 'Cron runner failed',
      details: error.message,
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
});

// Helper function to calculate next execution time
function calculateNextExecution(scheduleExpression, fromDate) {
  if (!scheduleExpression) return null;
  
  const from = new Date(fromDate);
  
  // Handle simple expressions
  if (scheduleExpression === 'every_5_minutes') {
    return new Date(from.getTime() + 5 * 60 * 1000);
  }
  if (scheduleExpression === 'every_15_minutes') {
    return new Date(from.getTime() + 15 * 60 * 1000);
  }
  if (scheduleExpression === 'every_hour') {
    return new Date(from.getTime() + 60 * 60 * 1000);
  }
  if (scheduleExpression === 'daily') {
    const next = new Date(from);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }
  
  // For cron expressions, default to 5 minutes
  return new Date(from.getTime() + 5 * 60 * 1000);
}

----------------------------

export default cronJobRunner;
