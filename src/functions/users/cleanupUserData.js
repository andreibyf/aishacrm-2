/**
 * cleanupUserData
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
        
        // This function will now ONLY clean the problematic JSON fields.
        // It will NOT attempt to change the user's role.
        const cleanUserData = {
            branding_settings: null,
            permissions: null,
        };
        
        console.log('Attempting to clean user data (will not change role):', cleanUserData);
        
        // Use service role to ensure we have permission to nullify these fields.
        await base44.asServiceRole.entities.User.update(user.id, cleanUserData);
        
        const updatedUser = await base44.auth.me();
        
        return new Response(JSON.stringify({
            status: 'success',
            message: 'User data cleaned successfully. Problematic fields have been reset.',
            user: updatedUser
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        
    } catch (error) {
        console.error('Cleanup error:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message || 'An error occurred during cleanup.',
            details: error.stack
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

----------------------------

export default cleanupUserData;
