/**
 * checkScheduledAICalls
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Get all scheduled AI call activities that are due
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);
        
        console.log('Checking for scheduled AI calls at:', { currentDate, currentTime });
        
        // Find AI call activities that are due now
        const scheduledCalls = await base44.asServiceRole.entities.Activity.filter({
            type: 'scheduled_ai_call',
            status: 'scheduled',
            due_date: currentDate
        });
        
        const dueCalls = scheduledCalls.filter(call => {
            if (!call.due_time) return false;
            
            // Check if the call is due (within 5 minutes)
            const dueTime = call.due_time;
            const [dueHour, dueMinute] = dueTime.split(':').map(Number);
            const [currentHour, currentMinute] = currentTime.split(':').map(Number);
            
            const dueMinutes = dueHour * 60 + dueMinute;
            const currentMinutes = currentHour * 60 + currentMinute;
            
            return Math.abs(currentMinutes - dueMinutes) <= 5;
        });
        
        return new Response(JSON.stringify({
            success: true,
            totalScheduledCalls: scheduledCalls.length,
            dueCalls: dueCalls.length,
            calls: dueCalls.map(call => ({
                id: call.id,
                subject: call.subject,
                due_time: call.due_time,
                ai_call_config: call.ai_call_config
            }))
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
        
    } catch (error) {
        console.error('Error checking scheduled AI calls:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default checkScheduledAICalls;
