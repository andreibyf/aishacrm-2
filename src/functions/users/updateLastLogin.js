/**
 * updateLastLogin
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ error: 'Not authenticated' }), 
                { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        
        const user = await base44.auth.me();
        
        // Check if we've updated recently (within last 30 minutes instead of 4 hours) to improve live status
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        if (user.last_login && new Date(user.last_login) > thirtyMinutesAgo) {
            return new Response(JSON.stringify({
                status: 'skipped',
                message: 'Last login recently updated, skipping to avoid rate limits',
                timestamp: user.last_login
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        
        // Update the user's last_login timestamp
        await base44.asServiceRole.entities.User.update(user.id, {
            last_login: new Date().toISOString()
        });

        // Create audit log for login activity
        try {
            await base44.asServiceRole.entities.AuditLog.create({
                user_email: user.email,
                user_role: user.role,
                user_display_role: user.permissions?.intended_role || user.role,
                action_type: 'login',
                entity_type: 'User',
                entity_id: user.id,
                description: `User logged in - session updated`,
                ip_address: req.headers.get('x-forwarded-for') || 'unknown',
                user_agent: req.headers.get('user-agent') || 'unknown'
            });
        } catch (auditError) {
            console.warn('Failed to create login audit log:', auditError);
        }
        
        return new Response(JSON.stringify({
            status: 'success',
            message: 'Last login updated',
            timestamp: new Date().toISOString()
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        
    } catch (error) {
        console.error('Error updating last login:', error);
        
        // Handle rate limit errors gracefully - don't treat them as real errors
        if (error.message?.includes('Rate limit') || error.message?.includes('rate limit') || error.response?.status === 429) {
            return new Response(JSON.stringify({
                status: 'rate_limited',
                message: 'Rate limit reached, will try again later'
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }); // Return 200 instead of 429
        }
        
        // Handle other quota/limit related errors
        if (error.message?.includes('quota') || error.message?.includes('limit')) {
            return new Response(JSON.stringify({
                status: 'quota_exceeded',
                message: 'API quota exceeded, will try again later'
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message || 'Failed to update last login'
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

----------------------------

export default updateLastLogin;
