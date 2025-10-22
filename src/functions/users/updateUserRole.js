/**
 * updateUserRole
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), 
                { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        
        const user = await base44.auth.me();
        console.log('Attempting to update role for user:', user.email);
        
        // Try updating role through service API
        try {
            await base44.asServiceRole.entities.User.update(user.id, { 
                role: 'superadmin'
            });
            
            return new Response(JSON.stringify({
                status: 'success',
                message: 'Role updated successfully'
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            
        } catch (roleError) {
            console.log('Role update failed (expected):', roleError.message);
            
            return new Response(JSON.stringify({
                status: 'error',
                message: 'Role updates must be done through the base44 platform interface',
                suggestion: 'Try clearing your browser cache and using the base44 Dashboard → Users interface'
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        
    } catch (error) {
        console.error('Function error:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

----------------------------

export default updateUserRole;
