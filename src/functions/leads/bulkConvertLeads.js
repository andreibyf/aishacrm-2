/**
 * bulkConvertLeads
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const user = await base44.auth.me();

    const { leadIds } = await req.json();
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return new Response(JSON.stringify({ error: 'leadIds array is required' }), { status: 400 });
    }

    try {
        console.log(`Starting bulk conversion for ${leadIds.length} leads by user ${user.email}`);

        // Fetch all leads to be converted
        const leads = await base44.asServiceRole.entities.Lead.filter({
            id: { $in: leadIds },
            status: { $ne: 'converted' } // Only convert non-converted leads
        });

        if (leads.length === 0) {
            return new Response(JSON.stringify({ message: 'No valid leads to convert.' }), { status: 200 });
        }
        
        // Find all unique company names from the leads
        const companyNames = [...new Set(leads.map(lead => lead.company).filter(Boolean))];
        
        // Fetch existing accounts to prevent duplicates
        const existingAccounts = companyNames.length > 0 ? await base44.asServiceRole.entities.Account.filter({
            name: { $in: companyNames }
        }) : [];

        const accountMap = new Map(existingAccounts.map(acc => [acc.name.toLowerCase(), acc]));
        
        let convertedCount = 0;
        let newAccountsCount = 0;
        let newContactsCount = 0;

        for (const lead of leads) {
            let accountId = null;
            let accountName = null;

            // 1. Find or Create Account
            if (lead.company) {
                const lowerCaseCompany = lead.company.toLowerCase();
                if (accountMap.has(lowerCaseCompany)) {
                    accountId = accountMap.get(lowerCaseCompany).id;
                    accountName = accountMap.get(lowerCaseCompany).name;
                } else {
                    // Create new account if it doesn't exist
                    const newAccount = await base44.asServiceRole.entities.Account.create({
                        name: lead.company,
                        assigned_to: lead.assigned_to || user.email,
                        tenant_id: lead.tenant_id,
                        phone: lead.phone,
                        address_1: lead.address_1,
                        city: lead.city,
                        state: lead.state,
                        zip: lead.zip,
                        country: lead.country,
                        type: 'customer' // Default type
                    });
                    accountId = newAccount.id;
                    accountName = newAccount.name;
                    accountMap.set(lowerCaseCompany, newAccount); // Add to map to reuse for other leads in this batch
                    newAccountsCount++;
                }
            }

            // 2. Create Contact - preserve the unique_id from the lead
            const contactUniqueId = lead.unique_id ? lead.unique_id.replace('LEAD-', 'CONT-') : null;
            
            const newContact = await base44.asServiceRole.entities.Contact.create({
                unique_id: contactUniqueId, // Preserve the ID with updated prefix
                first_name: lead.first_name,
                last_name: lead.last_name,
                email: lead.email,
                phone: lead.phone,
                job_title: lead.job_title,
                account_id: accountId,
                lead_source: lead.source,
                assigned_to: lead.assigned_to || user.email,
                tenant_id: lead.tenant_id,
                score: lead.score,
                score_reason: lead.score_reason,
                ai_action: lead.ai_action,
                last_contacted: lead.last_contacted,
                next_action: lead.next_action,
                address_1: lead.address_1,
                address_2: lead.address_2,
                city: lead.city,
                state: lead.state,
                zip: lead.zip,
                country: lead.country,
                notes: lead.notes,
                tags: lead.tags
            });
            newContactsCount++;

            // 3. Update Lead status
            await base44.asServiceRole.entities.Lead.update(lead.id, {
                status: 'converted',
                converted_contact_id: newContact.id,
                converted_account_id: accountId
            });
            convertedCount++;
        }

        const summary = `Successfully converted ${convertedCount} lead(s). Created ${newContactsCount} new contact(s) and ${newAccountsCount} new account(s).`;
        
        return new Response(JSON.stringify({
            status: 'success',
            message: summary
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Bulk lead conversion failed:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});


----------------------------

export default bulkConvertLeads;
