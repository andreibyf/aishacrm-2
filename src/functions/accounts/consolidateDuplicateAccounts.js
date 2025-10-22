/**
 * consolidateDuplicateAccounts
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accountIds, masterAccountId } = await req.json();

    if (!Array.isArray(accountIds) || accountIds.length < 2) {
      return Response.json({ 
        error: 'Need at least 2 account IDs to consolidate' 
      }, { status: 400 });
    }

    // Fetch all accounts in the group
    const accounts = await Promise.all(
      accountIds.map(id => base44.entities.Account.get(id))
    );

    // Determine master account (oldest by default, or specified)
    let masterAccount;
    if (masterAccountId && accounts.find(a => a.id === masterAccountId)) {
      masterAccount = accounts.find(a => a.id === masterAccountId);
    } else {
      // Pick oldest account as master
      masterAccount = accounts.reduce((oldest, current) => {
        const oldestDate = new Date(oldest.created_date);
        const currentDate = new Date(current.created_date);
        return currentDate < oldestDate ? current : oldest;
      });
    }

    const duplicateAccounts = accounts.filter(a => a.id !== masterAccount.id);

    // Build consolidated data
    const consolidatedData = { ...masterAccount };
    const mergedNotes = [`=== CONSOLIDATED DUPLICATE ACCOUNTS ===\nMaster Account: ${masterAccount.name} (ID: ${masterAccount.id})\nConsolidated on: ${new Date().toISOString()}\n`];

    // Merge data from duplicates
    for (const duplicate of duplicateAccounts) {
      mergedNotes.push(`\n--- From Account: ${duplicate.name} (ID: ${duplicate.id}) ---`);
      
      // Merge email if master doesn't have one
      if (!consolidatedData.email && duplicate.email) {
        consolidatedData.email = duplicate.email;
        mergedNotes.push(`Email: ${duplicate.email}`);
      } else if (duplicate.email && duplicate.email !== consolidatedData.email) {
        mergedNotes.push(`Alternate Email: ${duplicate.email}`);
      }

      // Merge phone if master doesn't have one
      if (!consolidatedData.phone && duplicate.phone) {
        consolidatedData.phone = duplicate.phone;
        mergedNotes.push(`Phone: ${duplicate.phone}`);
      } else if (duplicate.phone && duplicate.phone !== consolidatedData.phone) {
        mergedNotes.push(`Alternate Phone: ${duplicate.phone}`);
      }

      // Merge website if master doesn't have one
      if (!consolidatedData.website && duplicate.website) {
        consolidatedData.website = duplicate.website;
      } else if (duplicate.website && duplicate.website !== consolidatedData.website) {
        mergedNotes.push(`Alternate Website: ${duplicate.website}`);
      }

      // Merge address if master doesn't have one
      if (!consolidatedData.address_1 && duplicate.address_1) {
        consolidatedData.address_1 = duplicate.address_1;
        consolidatedData.address_2 = duplicate.address_2;
        consolidatedData.city = duplicate.city;
        consolidatedData.state = duplicate.state;
        consolidatedData.zip = duplicate.zip;
        consolidatedData.country = duplicate.country;
      } else if (duplicate.address_1 && duplicate.address_1 !== consolidatedData.address_1) {
        mergedNotes.push(`Alternate Address: ${[duplicate.address_1, duplicate.city, duplicate.state, duplicate.zip].filter(Boolean).join(', ')}`);
      }

      // Merge other fields
      if (!consolidatedData.industry && duplicate.industry) {
        consolidatedData.industry = duplicate.industry;
      }
      if (!consolidatedData.annual_revenue && duplicate.annual_revenue) {
        consolidatedData.annual_revenue = duplicate.annual_revenue;
      }
      if (!consolidatedData.employee_count && duplicate.employee_count) {
        consolidatedData.employee_count = duplicate.employee_count;
      }

      // Merge tags
      const masterTags = consolidatedData.tags || [];
      const dupTags = duplicate.tags || [];
      consolidatedData.tags = [...new Set([...masterTags, ...dupTags])];

      // Append existing notes
      if (duplicate.description) {
        mergedNotes.push(`Notes: ${duplicate.description}`);
      }

      // Track legacy IDs
      if (duplicate.legacy_id) {
        mergedNotes.push(`Legacy ID: ${duplicate.legacy_id}`);
      }
    }

    // Append consolidated notes
    const existingDescription = consolidatedData.description || '';
    consolidatedData.description = existingDescription + '\n\n' + mergedNotes.join('\n');

    // Update master account with consolidated data
    await base44.entities.Account.update(masterAccount.id, consolidatedData);

    // Re-link related records
    const relinkResults = {
      contacts: 0,
      opportunities: 0,
      activities: 0,
      leads: 0
    };

    for (const duplicate of duplicateAccounts) {
      // Re-link contacts
      try {
        const contacts = await base44.entities.Contact.filter({ account_id: duplicate.id });
        for (const contact of contacts) {
          await base44.entities.Contact.update(contact.id, { account_id: masterAccount.id });
          relinkResults.contacts++;
        }
      } catch (error) {
        console.error(`Failed to relink contacts from ${duplicate.id}:`, error);
      }

      // Re-link opportunities
      try {
        const opportunities = await base44.entities.Opportunity.filter({ account_id: duplicate.id });
        for (const opp of opportunities) {
          await base44.entities.Opportunity.update(opp.id, { account_id: masterAccount.id });
          relinkResults.opportunities++;
        }
      } catch (error) {
        console.error(`Failed to relink opportunities from ${duplicate.id}:`, error);
      }

      // Re-link activities
      try {
        const activities = await base44.entities.Activity.filter({ related_to: 'account', related_id: duplicate.id });
        for (const activity of activities) {
          await base44.entities.Activity.update(activity.id, { related_id: masterAccount.id });
          relinkResults.activities++;
        }
      } catch (error) {
        console.error(`Failed to relink activities from ${duplicate.id}:`, error);
      }

      // Re-link leads
      try {
        const leads = await base44.entities.Lead.filter({ account_id: duplicate.id });
        for (const lead of leads) {
          await base44.entities.Lead.update(lead.id, { account_id: masterAccount.id });
          relinkResults.leads++;
        }
      } catch (error) {
        console.error(`Failed to relink leads from ${duplicate.id}:`, error);
      }
    }

    // Delete duplicate accounts
    const deletedIds = [];
    for (const duplicate of duplicateAccounts) {
      try {
        await base44.entities.Account.delete(duplicate.id);
        deletedIds.push(duplicate.id);
      } catch (error) {
        console.error(`Failed to delete duplicate ${duplicate.id}:`, error);
      }
    }

    // Create audit log
    try {
      await base44.asServiceRole.entities.AuditLog.create({
        user_email: user.email,
        user_role: user.role,
        action_type: 'consolidate',
        entity_type: 'Account',
        entity_id: masterAccount.id,
        description: `Consolidated ${duplicateAccounts.length} duplicate accounts into master account: ${masterAccount.name}`,
        old_values: {
          duplicate_account_ids: deletedIds,
          relinked_records: relinkResults
        },
        new_values: consolidatedData
      });
    } catch (auditError) {
      console.warn('Failed to create audit log:', auditError);
    }

    return Response.json({
      success: true,
      message: `Successfully consolidated ${duplicateAccounts.length} duplicate(s) into ${masterAccount.name}`,
      master_account_id: masterAccount.id,
      deleted_account_ids: deletedIds,
      relinked_records: relinkResults
    });

  } catch (error) {
    console.error('Consolidation error:', error);
    return Response.json({ 
      error: error.message || 'Failed to consolidate accounts' 
    }, { status: 500 });
  }
});

----------------------------

export default consolidateDuplicateAccounts;
