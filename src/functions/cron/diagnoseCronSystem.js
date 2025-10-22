/**
 * diagnoseCronSystem
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user.role !== 'admin' && user.role !== 'superadmin') {
            return new Response(JSON.stringify({ 
                error: 'Unauthorized - Admin access required' 
            }), { 
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log('=== CRON SYSTEM DIAGNOSTIC ===');

        // 1. Check all cron jobs
        const allJobs = await base44.asServiceRole.entities.CronJob.list('-created_date');
        console.log(`Found ${allJobs.length} total cron jobs`);

        // 2. Check active jobs
        const activeJobs = allJobs.filter(job => job.is_active);
        console.log(`Found ${activeJobs.length} active cron jobs`);

        // 3. Check overdue jobs
        const now = new Date();
        const overdueJobs = activeJobs.filter(job => {
            if (!job.next_execution) return false;
            return new Date(job.next_execution) <= now;
        });
        console.log(`Found ${overdueJobs.length} overdue cron jobs`);

        // 4. Try to manually run the cron processor
        let processorResult = null;
        try {
            console.log('Testing cron job processor...');
            // FIX: Destructure the response to get only the 'data' part, avoiding the circular structure.
            const { data } = await base44.asServiceRole.functions.invoke('cronJobRunner', {});
            processorResult = data;
            console.log('Cron processor test result:', processorResult);
        } catch (error) {
            console.error('Cron processor test failed:', error);
            // FIX: Safely construct an error object instead of passing the raw circular error.
            processorResult = { 
                error: 'Function invocation failed.',
                message: error.message,
                response_data: error.response?.data
            };
        }

        // 5. Check if system cron is set up (look for master runner)
        const systemRunnerJob = allJobs.find(job => 
            job.function_name === 'cronJobRunner' && !job.tenant_id
        );

        const diagnostic = {
            timestamp: now.toISOString(),
            summary: {
                total_jobs: allJobs.length,
                active_jobs: activeJobs.length,
                overdue_jobs: overdueJobs.length,
                system_runner_exists: !!systemRunnerJob
            },
            jobs: allJobs.map(job => ({
                id: job.id,
                name: job.name,
                function_name: job.function_name,
                tenant_id: job.tenant_id,
                is_active: job.is_active,
                schedule_expression: job.schedule_expression,
                next_execution: job.next_execution,
                last_executed: job.last_executed,
                execution_count: job.execution_count,
                error_count: job.error_count,
                is_overdue: job.next_execution ? new Date(job.next_execution) <= now : false
            })),
            system_runner: systemRunnerJob ? {
                exists: true,
                name: systemRunnerJob.name,
                is_active: systemRunnerJob.is_active,
                next_execution: systemRunnerJob.next_execution,
                last_executed: systemRunnerJob.last_executed,
                execution_count: systemRunnerJob.execution_count
            } : {
                exists: false,
                message: 'System cron runner not found - run "Initialize System Cron Jobs"'
            },
            processor_test: processorResult,
            recommendations: []
        };

        // Add recommendations
        if (!systemRunnerJob) {
            diagnostic.recommendations.push('Initialize System Cron Jobs from Settings > System tab');
        }
        if (overdueJobs.length > 0) {
            diagnostic.recommendations.push(`${overdueJobs.length} jobs are overdue - check if the system runner is working`);
        }
        if (activeJobs.length === 0) {
            diagnostic.recommendations.push('No active cron jobs found - create and activate some jobs');
        }

        return new Response(JSON.stringify(diagnostic, null, 2), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Cron diagnostic error:', error);
        return new Response(JSON.stringify({
            error: error.message,
            timestamp: new Date().toISOString()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default diagnoseCronSystem;
