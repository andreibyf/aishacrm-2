/**
 * debugActivityTime
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Authenticate user
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ error: 'Not authenticated' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const user = await base44.auth.me();
        
        // Get the most recent activities for this user
        const activities = await base44.entities.Activity.filter({
            tenant_id: user.tenant_id || user.role === 'superadmin' ? null : user.tenant_id
        }, '-created_date', 10);

        const now = new Date();
        
        const debugInfo = {
            current_time_utc: now.toISOString(),
            current_time_edt: now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
            user_timezone_explanation: "User should be in EDT (UTC-4) timezone",
            
            recent_activities: activities.map(activity => {
                const utcString = activity.due_date && activity.due_time ? 
                    `${activity.due_date}T${activity.due_time}:00.000Z` : null;
                
                let localTime = null;
                if (utcString) {
                    const utcDate = new Date(utcString);
                    // Convert UTC to EDT (subtract 4 hours)
                    const edtDate = new Date(utcDate.getTime() - (4 * 60 * 60 * 1000));
                    localTime = {
                        edt_iso: edtDate.toISOString(),
                        edt_display: edtDate.toLocaleString('en-US', { 
                            timeZone: 'America/New_York',
                            year: 'numeric',
                            month: 'long', 
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                        })
                    };
                }
                
                return {
                    id: activity.id,
                    subject: activity.subject,
                    stored_due_date: activity.due_date,
                    stored_due_time: activity.due_time,
                    stored_utc_string: utcString,
                    converted_to_edt: localTime,
                    created_date: activity.created_date,
                    updated_date: activity.updated_date
                };
            })
        };

        return new Response(JSON.stringify(debugInfo, null, 2), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Debug activity time error:', error);
        return new Response(JSON.stringify({
            error: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default debugActivityTime;
