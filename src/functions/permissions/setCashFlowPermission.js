/**
 * setCashFlowPermission
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Not authenticated' }, { status: 401 });
        }
        
        // Get current navigation permissions
        const currentPermissions = user.navigation_permissions || {};
        
        // Add CashFlow permission
        const updatedPermissions = {
            ...currentPermissions,
            CashFlow: true
        };
        
        // Update the user with CashFlow permission
        await base44.asServiceRole.entities.User.update(user.id, {
            navigation_permissions: updatedPermissions
        });
        
        return Response.json({ 
            success: true, 
            message: 'CashFlow permission added',
            permissions: updatedPermissions
        });
        
    } catch (error) {
        console.error('Error setting CashFlow permission:', error);
        return Response.json({ 
            error: error.message 
        }, { status: 500 });
    }
});

----------------------------

export default setCashFlowPermission;
