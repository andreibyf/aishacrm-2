/**
 * activateMyAccount
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ error: 'Please log in first' }), 
                { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        
        const user = await base44.auth.me();
        
        // Only allow admin/superadmin to activate themselves
        if (user.role !== 'admin' && user.role !== 'superadmin') {
            return new Response(JSON.stringify({ error: 'Insufficient permissions' }), 
                { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        
        console.log(`SuperAdmin ${user.email} activating their own account`);
        
        // Use service role to ensure we have permission to update the account
        await base44.asServiceRole.entities.User.update(user.id, { 
            is_active: true,
            last_login: new Date().toISOString()
        });
        
        const updatedUser = await base44.auth.me();
        
        return new Response(JSON.stringify({
            status: 'success',
            message: 'Your account has been activated successfully.',
            user: updatedUser
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        
    } catch (error) {
        console.error('Account activation error:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message || 'An error occurred during account activation.',
            details: error.stack
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

----------------------------

export default activateMyAccount;
