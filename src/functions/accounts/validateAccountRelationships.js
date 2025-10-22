/**
 * validateAccountRelationships
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const { entity_type, entity_id, account_id } = await req.json();

        if (!entity_type || !entity_id) {
            return Response.json({ error: "entity_type and entity_id are required" }, { status: 400 });
        }

        const base44 = createClientFromRequest(req).asServiceRole;

        // If account_id is provided, verify the account exists
        if (account_id) {
            try {
                const account = await base44.entities.Account.get(account_id);
                if (!account) {
                    return Response.json({ 
                        error: "Referenced account does not exist",
                        account_id: account_id 
                    }, { status: 400 });
                }
            } catch (error) {
                return Response.json({ 
                    error: "Referenced account does not exist or is not accessible",
                    account_id: account_id 
                }, { status: 400 });
            }
        }

        // Additional validation based on entity type
        if (entity_type === 'Contact') {
            try {
                const contact = await base44.entities.Contact.get(entity_id);
                
                // Check for potential duplicates if linking to an account
                if (account_id && contact.email) {
                    const duplicates = await base44.entities.Contact.filter({
                        account_id: account_id,
                        email: contact.email
                    });
                    
                    const otherDuplicates = duplicates.filter(c => c.id !== entity_id);
                    if (otherDuplicates.length > 0) {
                        return Response.json({
                            warning: "A contact with this email already exists for this account",
                            existing_contact_id: otherDuplicates[0].id,
                            can_proceed: true
                        });
                    }
                }
            } catch (error) {
                return Response.json({ error: "Contact not found" }, { status: 404 });
            }
        }

        if (entity_type === 'Lead') {
            try {
                const lead = await base44.entities.Lead.get(entity_id);
                
                // Check if lead is already converted
                if (lead.status === 'converted') {
                    return Response.json({
                        error: "Cannot modify account relationship for converted leads",
                        lead_status: lead.status
                    }, { status: 400 });
                }
                
                // Check for potential duplicates
                if (account_id && lead.email) {
                    const duplicates = await base44.entities.Lead.filter({
                        account_id: account_id,
                        email: lead.email
                    });
                    
                    const otherDuplicates = duplicates.filter(l => l.id !== entity_id);
                    if (otherDuplicates.length > 0) {
                        return Response.json({
                            warning: "A lead with this email already exists for this account",
                            existing_lead_id: otherDuplicates[0].id,
                            can_proceed: true
                        });
                    }
                }
            } catch (error) {
                return Response.json({ error: "Lead not found" }, { status: 404 });
            }
        }

        return Response.json({ 
            success: true, 
            message: "Relationship validation passed" 
        });

    } catch (error) {
        console.error('Error in validateAccountRelationships:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

----------------------------

export default validateAccountRelationships;
