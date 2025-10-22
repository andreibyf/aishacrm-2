/**
 * deleteTenantWithData
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // Only allow admins to delete tenants
    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const user = await base44.auth.me();
    if (user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Only admins can delete tenants' }), { status: 403 });
    }

    const { tenantId } = await req.json();
    if (!tenantId) {
        return new Response(JSON.stringify({ error: 'tenantId is required' }), { status: 400 });
    }

    try {
        // Get tenant info first for logging
        const tenant = await base44.asServiceRole.entities.Tenant.filter({ id: tenantId });
        if (tenant.length === 0) {
            return new Response(JSON.stringify({ error: 'Tenant not found' }), { status: 404 });
        }
        
        const tenantName = tenant[0].name;
        console.log(`Starting deletion of tenant: ${tenantName} (${tenantId})`);

        // 1. Delete all tenant-specific data
        const entitiesToClean = ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity', 'Note'];
        
        for (const entityName of entitiesToClean) {
            const records = await base44.asServiceRole.entities[entityName].filter({ tenant_id: tenantId });
            console.log(`Deleting ${records.length} ${entityName} records`);
            
            const deletePromises = records.map(record => 
                base44.asServiceRole.entities[entityName].delete(record.id)
            );
            await Promise.all(deletePromises);
        }

        // 2. Update users to remove tenant assignment (don't delete users, just unassign them)
        const users = await base44.asServiceRole.entities.User.filter({ tenant_id: tenantId });
        console.log(`Unassigning ${users.length} users from tenant`);
        
        const userUpdatePromises = users.map(user => 
            base44.asServiceRole.entities.User.update(user.id, { tenant_id: null })
        );
        await Promise.all(userUpdatePromises);

        // 3. Delete tenant-specific settings and configurations
        const settingsEntities = ['ModuleSettings', 'DataManagementSettings', 'TenantIntegration'];
        for (const entityName of settingsEntities) {
            try {
                const settings = await base44.asServiceRole.entities[entityName].filter({ tenant_id: tenantId });
                console.log(`Deleting ${settings.length} ${entityName} records`);
                
                const deletePromises = settings.map(setting => 
                    base44.asServiceRole.entities[entityName].delete(setting.id)
                );
                await Promise.all(deletePromises);
            } catch (error) {
                console.log(`No ${entityName} records to delete or entity doesn't exist`);
            }
        }

        // 4. Delete subscriptions (this will need to be handled with Stripe cancellation)
        try {
            const subscriptions = await base44.asServiceRole.entities.Subscription.filter({ tenant_id: tenantId });
            if (subscriptions.length > 0) {
                console.log(`Found ${subscriptions.length} subscriptions - these should be cancelled in Stripe first`);
                // Note: In production, you'd want to cancel the Stripe subscription first
                const subDeletePromises = subscriptions.map(sub => 
                    base44.asServiceRole.entities.Subscription.delete(sub.id)
                );
                await Promise.all(subDeletePromises);
            }
        } catch (error) {
            console.log("No subscriptions to delete");
        }

        // 5. Finally, delete the tenant itself
        await base44.asServiceRole.entities.Tenant.delete(tenantId);
        console.log(`Successfully deleted tenant: ${tenantName}`);

        return new Response(JSON.stringify({
            status: 'success',
            message: `Tenant "${tenantName}" and all associated data has been deleted successfully.`
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Tenant deletion failed:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

----------------------------

export default deleteTenantWithData;
