/**
 * resetCronSchedules
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all active cron jobs
        const cronJobs = await base44.asServiceRole.entities.CronJob.filter({
            is_active: true
        });

        console.log(`Found ${cronJobs.length} active cron jobs to reset`);

        const updates = [];
        const now = new Date();

        for (const job of cronJobs) {
            // Calculate next execution based on schedule
            let nextExecution;
            
            switch (job.schedule_expression) {
                case 'every_5_minutes':
                    nextExecution = new Date(now.getTime() + 5 * 60 * 1000);
                    break;
                case 'every_15_minutes':
                    nextExecution = new Date(now.getTime() + 15 * 60 * 1000);
                    break;
                case 'hourly':
                    nextExecution = new Date(now.getTime() + 60 * 60 * 1000);
                    break;
                case 'daily':
                case 'daily_midnight': {
                    const tomorrow = new Date(now);
                    tomorrow.setDate(now.getDate() + 1);
                    tomorrow.setHours(0, 0, 0, 0);
                    nextExecution = tomorrow;
                    break;
                }
                default:
                    // Default to 5 minutes from now
                    nextExecution = new Date(now.getTime() + 5 * 60 * 1000);
            }

            // Update the job
            await base44.asServiceRole.entities.CronJob.update(job.id, {
                next_execution: nextExecution.toISOString(),
                error_count: 0 // Reset error count
            });

            updates.push({
                jobName: job.name,
                schedule: job.schedule_expression,
                oldNextExecution: job.next_execution,
                newNextExecution: nextExecution.toISOString()
            });

            console.log(`Updated ${job.name}: next execution set to ${nextExecution.toISOString()}`);
        }

        return Response.json({
            success: true,
            message: `Reset schedules for ${cronJobs.length} cron jobs`,
            updates: updates,
            currentTime: now.toISOString()
        });

    } catch (error) {
        console.error("Error resetting cron schedules:", error);
        return Response.json({ 
            error: error.message,
            success: false 
        }, { status: 500 });
    }
});

----------------------------

export default resetCronSchedules;
