/**
 * cleanupAccountRelationships
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const { action, account_id } = await req.json();

        if (!action) {
            return Response.json({ error: "action is required" }, { status: 400 });
        }

        const base44 = createClientFromRequest(req).asServiceRole;

        if (action === 'orphaned_relationships') {
            // Find contacts and leads referencing non-existent accounts
            const allContacts = await base44.entities.Contact.list();
            const allLeads = await base44.entities.Lead.list();
            const allAccounts = await base44.entities.Account.list();
            
            const accountIds = new Set(allAccounts.map(a => a.id));
            
            const orphanedContacts = allContacts.filter(c => 
                c.account_id && !accountIds.has(c.account_id)
            );
            
            const orphanedLeads = allLeads.filter(l => 
                l.account_id && !accountIds.has(l.account_id)
            );

            // Clean up orphaned relationships
            let cleanedContacts = 0;
            let cleanedLeads = 0;

            for (const contact of orphanedContacts) {
                try {
                    await base44.entities.Contact.update(contact.id, { account_id: null });
                    cleanedContacts++;
                } catch (error) {
                    console.warn(`Failed to clean contact ${contact.id}:`, error);
                }
            }

            for (const lead of orphanedLeads) {
                try {
                    await base44.entities.Lead.update(lead.id, { account_id: null });
                    cleanedLeads++;
                } catch (error) {
                    console.warn(`Failed to clean lead ${lead.id}:`, error);
                }
            }

            return Response.json({
                success: true,
                cleaned: {
                    contacts: cleanedContacts,
                    leads: cleanedLeads
                },
                found_orphaned: {
                    contacts: orphanedContacts.length,
                    leads: orphanedLeads.length
                }
            });
        }

        if (action === 'account_deletion_cleanup' && account_id) {
            // Clean up relationships before account deletion
            const relatedContacts = await base44.entities.Contact.filter({ account_id });
            const relatedLeads = await base44.entities.Lead.filter({ account_id });

            // Option 1: Unlink relationships (safer)
            for (const contact of relatedContacts) {
                await base44.entities.Contact.update(contact.id, { account_id: null });
            }

            for (const lead of relatedLeads) {
                await base44.entities.Lead.update(lead.id, { account_id: null });
            }

            return Response.json({
                success: true,
                unlinked: {
                    contacts: relatedContacts.length,
                    leads: relatedLeads.length
                }
            });
        }

        return Response.json({ error: "Invalid action" }, { status: 400 });

    } catch (error) {
        console.error('Error in cleanupAccountRelationships:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

----------------------------

export default cleanupAccountRelationships;
