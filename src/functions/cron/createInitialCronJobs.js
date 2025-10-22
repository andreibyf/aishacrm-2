/**
 * createInitialCronJobs
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Ensure only an admin can run this
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin' && user.role !== 'superadmin') {
            return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
                status: 401, headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const jobsToCreate = [
            {
                name: 'System Cron Job Runner',
                function_name: 'cronJobRunner',
                schedule_expression: 'every_5_minutes',
                description: 'Master runner that executes all other scheduled jobs.',
                is_active: true,
                max_retries: 5,
                timeout_seconds: 240
            },
            {
                name: 'Scheduled AI Call Processor',
                function_name: 'processScheduledAICalls',
                schedule_expression: 'every_15_minutes',
                description: 'Checks for and executes due AI-scheduled calls.',
                is_active: true,
                max_retries: 3,
                timeout_seconds: 600
            },
            {
                name: 'Scheduled AI Email Processor',
                function_name: 'processScheduledAIEmails',
                schedule_expression: 'every_10_minutes',
                description: 'Checks for and sends due AI-scheduled emails.',
                is_active: true,
                max_retries: 3,
                timeout_seconds: 600
            }
        ];

        const results = [];

        for (const jobData of jobsToCreate) {
            try {
                // Check if a job with this function name already exists
                const existingJobs = await base44.asServiceRole.entities.CronJob.filter({
                    function_name: jobData.function_name
                });
                
                if (existingJobs.length > 0) {
                    // Update existing job to ensure it's active and has latest settings
                    const job = existingJobs[0];
                    await base44.asServiceRole.entities.CronJob.update(job.id, {
                        is_active: true,
                        schedule_expression: jobData.schedule_expression
                    });
                    results.push({ name: jobData.name, status: 'updated' });
                } else {
                    // Create the new job
                    await base44.asServiceRole.entities.CronJob.create(jobData);
                    results.push({ name: jobData.name, status: 'created' });
                }
            } catch (error) {
                console.error(`Failed to create or update job: ${jobData.name}`, error);
                results.push({ name: jobData.name, status: 'error', message: error.message });
            }
        }
        
        return Response.json({ success: true, message: "System cron jobs initialized successfully.", results });

    } catch (error) {
        console.error("Error initializing cron jobs:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default createInitialCronJobs;
