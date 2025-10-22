/**
 * checkMyPermissions
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
        
        return Response.json({ 
            email: user.email,
            role: user.role,
            navigation_permissions: user.navigation_permissions || 'No navigation permissions set',
            has_cashflow: user.navigation_permissions?.CashFlow || false
        });
        
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

----------------------------

export default checkMyPermissions;
