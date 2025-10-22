/**
 * checkDataVolume
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// Define data volume thresholds
const THRESHOLDS = {
    Contact: 5000,
    Account: 2000,
    Lead: 5000,
    Opportunity: 5000,
    Activity: 10000,
};

// Map entity names to their corresponding page URL names
const ENTITY_PAGE_MAP = {
    Contact: "Contacts",
    Account: "Accounts",
    Lead: "Leads",
    Opportunity: "Opportunities",
    Activity: "Activities",
};

// Helper function to check a single tenant's data volume
async function checkTenantDataVolume(base44, tenantId, tenantName) {
    const notificationsToSend = [];
    
    for (const entityName of Object.keys(THRESHOLDS)) {
        try {
            const count = await base44.asServiceRole.entities[entityName].count({ tenant_id: tenantId });
            const threshold = THRESHOLDS[entityName];
            
            if (count > threshold) {
                console.log(`Tenant ${tenantName} (${tenantId}) exceeded ${entityName} threshold: ${count}/${threshold}`);
                
                const usersToNotify = await base44.asServiceRole.entities.User.filter({
                    tenant_id: tenantId,
                    $or: [{ role: 'admin' }, { role: 'power-user' }]
                });

                usersToNotify.forEach(user => {
                    notificationsToSend.push({
                        user_email: user.email,
                        title: "Data Volume Recommendation",
                        description: `Your CRM has over ${threshold.toLocaleString()} ${entityName} records. Consider archiving older data to maintain optimal performance.`,
                        link: `/${ENTITY_PAGE_MAP[entityName]}`, // Use a relative path directly
                        icon: 'Database'
                    });
                });
            }
        } catch (error) {
            console.error(`Error counting ${entityName} for tenant ${tenantId}:`, error);
        }
    }
    return notificationsToSend;
}

// Main Deno function
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // Ensure the user is an admin
    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const user = await base44.auth.me();
    if (user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        let allNotifications = [];
        const tenants = await base44.asServiceRole.entities.Tenant.list();

        for (const tenant of tenants) {
            const tenantNotifications = await checkTenantDataVolume(base44, tenant.id, tenant.name);
            allNotifications = allNotifications.concat(tenantNotifications);
        }

        // Bulk create all notifications
        if (allNotifications.length > 0) {
            await base44.asServiceRole.entities.Notification.bulkCreate(allNotifications);
            console.log(`Successfully created ${allNotifications.length} data volume notifications.`);
        }

        return new Response(JSON.stringify({
            status: 'success',
            message: `Data volume check completed for ${tenants.length} tenants.`,
            notifications_created: allNotifications.length
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error in checkDataVolume function:', error);
        return new Response(JSON.stringify({ status: 'error', message: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});


----------------------------

export default checkDataVolume;
