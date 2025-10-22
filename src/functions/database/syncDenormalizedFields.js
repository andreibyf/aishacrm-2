/**
 * syncDenormalizedFields
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Sync Denormalized Fields
 * Updates cached/denormalized fields across entities
 * Can run in incremental or full mode
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { tenantId, mode = 'incremental', entityType = null } = await req.json().catch(() => ({}));

    const startTime = Date.now();
    const results = {
      success: true,
      mode,
      tenantId,
      entityType,
      totalSynced: 0,
      errors: [],
      stats: {
        contacts: 0,
        leads: 0,
        opportunities: 0,
        activities: 0
      }
    };

    console.log(`[Sync] Starting ${mode} sync for tenant: ${tenantId || 'ALL'}, entity: ${entityType || 'ALL'}`);

    // Helper: Get account details
    const getAccountDetails = async (accountId) => {
      if (!accountId) return null;
      try {
        const account = await base44.asServiceRole.entities.Account.get(accountId);
        return { name: account?.name, industry: account?.industry };
      } catch (error) {
        return null;
      }
    };

    // Helper: Get employee name
    const getEmployeeName = async (email, tenantId) => {
      if (!email) return null;
      try {
        const filter = tenantId ? { tenant_id: tenantId, $or: [{ email }, { user_email: email }] } : { $or: [{ email }, { user_email: email }] };
        const employees = await base44.asServiceRole.entities.Employee.filter(filter);
        if (employees && employees.length > 0) {
          return `${employees[0].first_name} ${employees[0].last_name}`;
        }
        return null;
      } catch (error) {
        return null;
      }
    };

    // Helper: Get contact details
    const getContactDetails = async (contactId) => {
      if (!contactId) return null;
      try {
        const contact = await base44.asServiceRole.entities.Contact.get(contactId);
        return { name: `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim(), email: contact?.email };
      } catch (error) {
        return null;
      }
    };

    // Sync Contacts
    if (!entityType || entityType === 'Contact') {
      try {
        const filter = tenantId ? { tenant_id: tenantId } : {};
        const contacts = await base44.asServiceRole.entities.Contact.filter(filter, '-updated_date', 1000);
        
        if (Array.isArray(contacts)) {
          for (const contact of contacts) {
            try {
              const updates = {};
              let needsUpdate = false;

              if (contact.account_id && (!contact.account_name || mode === 'full')) {
                const accountDetails = await getAccountDetails(contact.account_id);
                if (accountDetails) {
                  updates.account_name = accountDetails.name;
                  updates.account_industry = accountDetails.industry;
                  needsUpdate = true;
                }
              }

              if (contact.assigned_to && (!contact.assigned_to_name || mode === 'full')) {
                const employeeName = await getEmployeeName(contact.assigned_to, contact.tenant_id);
                if (employeeName) {
                  updates.assigned_to_name = employeeName;
                  needsUpdate = true;
                }
              }

              if (needsUpdate) {
                updates.last_synced = new Date().toISOString();
                await base44.asServiceRole.entities.Contact.update(contact.id, updates);
                results.stats.contacts++;
                results.totalSynced++;
              }
            } catch (error) {
              results.errors.push({ entity: 'Contact', id: contact.id, error: error.message });
            }
          }
        }
      } catch (error) {
        console.error('Error syncing contacts:', error);
        results.errors.push({ entity: 'Contact', error: error.message });
      }
    }

    // Sync Leads
    if (!entityType || entityType === 'Lead') {
      try {
        const filter = tenantId ? { tenant_id: tenantId } : {};
        const leads = await base44.asServiceRole.entities.Lead.filter(filter, '-updated_date', 1000);
        
        if (Array.isArray(leads)) {
          for (const lead of leads) {
            try {
              const updates = {};
              let needsUpdate = false;

              if (lead.account_id && (!lead.account_name || mode === 'full')) {
                const accountDetails = await getAccountDetails(lead.account_id);
                if (accountDetails) {
                  updates.account_name = accountDetails.name;
                  needsUpdate = true;
                }
              }

              if (lead.assigned_to && (!lead.assigned_to_name || mode === 'full')) {
                const employeeName = await getEmployeeName(lead.assigned_to, lead.tenant_id);
                if (employeeName) {
                  updates.assigned_to_name = employeeName;
                  needsUpdate = true;
                }
              }

              if (lead.converted_contact_id && (!lead.converted_contact_name || mode === 'full')) {
                const contactDetails = await getContactDetails(lead.converted_contact_id);
                if (contactDetails) {
                  updates.converted_contact_name = contactDetails.name;
                  needsUpdate = true;
                }
              }

              if (lead.converted_account_id && (!lead.converted_account_name || mode === 'full')) {
                const accountDetails = await getAccountDetails(lead.converted_account_id);
                if (accountDetails) {
                  updates.converted_account_name = accountDetails.name;
                  needsUpdate = true;
                }
              }

              if (needsUpdate) {
                updates.last_synced = new Date().toISOString();
                await base44.asServiceRole.entities.Lead.update(lead.id, updates);
                results.stats.leads++;
                results.totalSynced++;
              }
            } catch (error) {
              results.errors.push({ entity: 'Lead', id: lead.id, error: error.message });
            }
          }
        }
      } catch (error) {
        console.error('Error syncing leads:', error);
        results.errors.push({ entity: 'Lead', error: error.message });
      }
    }

    // Sync Opportunities
    if (!entityType || entityType === 'Opportunity') {
      try {
        const filter = tenantId ? { tenant_id: tenantId } : {};
        const opportunities = await base44.asServiceRole.entities.Opportunity.filter(filter, '-updated_date', 1000);
        
        if (Array.isArray(opportunities)) {
          for (const opp of opportunities) {
            try {
              const updates = {};
              let needsUpdate = false;

              if (opp.account_id && (!opp.account_name || mode === 'full')) {
                const accountDetails = await getAccountDetails(opp.account_id);
                if (accountDetails) {
                  updates.account_name = accountDetails.name;
                  updates.account_industry = accountDetails.industry;
                  needsUpdate = true;
                }
              }

              if (opp.contact_id && (!opp.contact_name || mode === 'full')) {
                const contactDetails = await getContactDetails(opp.contact_id);
                if (contactDetails) {
                  updates.contact_name = contactDetails.name;
                  updates.contact_email = contactDetails.email;
                  needsUpdate = true;
                }
              }

              if (opp.assigned_to && (!opp.assigned_to_name || mode === 'full')) {
                const employeeName = await getEmployeeName(opp.assigned_to, opp.tenant_id);
                if (employeeName) {
                  updates.assigned_to_name = employeeName;
                  needsUpdate = true;
                }
              }

              if (needsUpdate) {
                updates.last_synced = new Date().toISOString();
                await base44.asServiceRole.entities.Opportunity.update(opp.id, updates);
                results.stats.opportunities++;
                results.totalSynced++;
              }
            } catch (error) {
              results.errors.push({ entity: 'Opportunity', id: opp.id, error: error.message });
            }
          }
        }
      } catch (error) {
        console.error('Error syncing opportunities:', error);
        results.errors.push({ entity: 'Opportunity', error: error.message });
      }
    }

    // Sync Activities
    if (!entityType || entityType === 'Activity') {
      try {
        const filter = tenantId ? { tenant_id: tenantId } : {};
        const activities = await base44.asServiceRole.entities.Activity.filter(filter, '-updated_date', 1000);
        
        if (Array.isArray(activities)) {
          for (const activity of activities) {
            try {
              const updates = {};
              let needsUpdate = false;

              if (activity.assigned_to && (!activity.assigned_to_name || mode === 'full')) {
                const employeeName = await getEmployeeName(activity.assigned_to, activity.tenant_id);
                if (employeeName) {
                  updates.assigned_to_name = employeeName;
                  needsUpdate = true;
                }
              }

              // Denormalize related entity info
              if (activity.related_to && activity.related_id && (!activity.related_name || mode === 'full')) {
                try {
                  let relatedName = null;
                  if (activity.related_to === 'contact') {
                    const contactDetails = await getContactDetails(activity.related_id);
                    relatedName = contactDetails?.name;
                  } else if (activity.related_to === 'account') {
                    const accountDetails = await getAccountDetails(activity.related_id);
                    relatedName = accountDetails?.name;
                  } else if (activity.related_to === 'lead') {
                    const lead = await base44.asServiceRole.entities.Lead.get(activity.related_id);
                    relatedName = `${lead?.first_name || ''} ${lead?.last_name || ''}`.trim();
                  }

                  if (relatedName) {
                    updates.related_name = relatedName;
                    needsUpdate = true;
                  }
                } catch (error) {
                  console.warn(`Could not fetch related entity for activity ${activity.id}:`, error.message);
                }
              }

              if (needsUpdate) {
                updates.last_synced = new Date().toISOString();
                await base44.asServiceRole.entities.Activity.update(activity.id, updates);
                results.stats.activities++;
                results.totalSynced++;
              }
            } catch (error) {
              results.errors.push({ entity: 'Activity', id: activity.id, error: error.message });
            }
          }
        }
      } catch (error) {
        console.error('Error syncing activities:', error);
        results.errors.push({ entity: 'Activity', error: error.message });
      }
    }

    const duration = Date.now() - startTime;
    results.duration_ms = duration;

    console.log(`[Sync] Completed in ${duration}ms. Synced: ${results.totalSynced}, Errors: ${results.errors.length}`);

    // Create sync health record
    try {
      await base44.asServiceRole.entities.SyncHealth.create({
        tenant_id: tenantId,
        sync_type: 'denormalization',
        start_time: new Date(startTime).toISOString(),
        end_time: new Date().toISOString(),
        duration_ms: duration,
        status: results.errors.length === 0 ? 'completed' : (results.totalSynced > 0 ? 'partial' : 'failed'),
        mode,
        records_processed: results.totalSynced + results.errors.length,
        records_updated: results.totalSynced,
        error_count: results.errors.length,
        errors: results.errors.slice(0, 100), // Limit to first 100 errors
        entity_stats: results.stats,
        triggered_by: 'manual'
      });
    } catch (error) {
      console.warn('Could not create sync health record:', error);
    }

    return Response.json(results);

  } catch (error) {
    console.error("Sync error:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
});

----------------------------

export default syncDenormalizedFields;
