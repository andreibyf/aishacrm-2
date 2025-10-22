/**
 * cronOrphanCleanup
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Automated Orphan Record Cleanup Cron Job
 * Runs weekly to find and nullify orphaned references
 * Should be registered in CronJob entity with schedule: "0 3 * * 0" (3 AM Sundays)
 */

Deno.serve(async (req) => {
  const startTime = new Date();
  let healthLogId = null;

  try {
    const base44 = createClientFromRequest(req);
    const { tenantId, autoFix = true } = await req.json();
    
    console.log(`[Cron Orphan Cleanup] Starting for tenant: ${tenantId || 'ALL'}`);
    
    // Create health log
    const healthLog = await base44.asServiceRole.entities.SyncHealth.create({
      sync_type: 'orphan_cleanup',
      tenant_id: tenantId || null,
      start_time: startTime.toISOString(),
      status: 'running',
      mode: 'full',
      triggered_by: 'cron',
      records_processed: 0,
      records_updated: 0,
      error_count: 0,
      errors: []
    });
    healthLogId = healthLog.id;

    const results = {
      orphansFound: 0,
      orphansFixed: 0,
      errors: [],
      entities: {
        contacts: { found: 0, fixed: 0 },
        leads: { found: 0, fixed: 0 },
        opportunities: { found: 0, fixed: 0 },
        activities: { found: 0, fixed: 0 }
      }
    };

    // Get all tenants or specific tenant
    let tenants = [];
    if (tenantId) {
      const tenant = await base44.asServiceRole.entities.Tenant.get(tenantId);
      if (tenant) tenants = [tenant];
    } else {
      tenants = await base44.asServiceRole.entities.Tenant.list('-created_date', 100);
    }

    // Helper: Check if account exists
    const accountExists = async (accountId) => {
      try {
        const account = await base44.asServiceRole.entities.Account.get(accountId);
        return !!account;
      } catch {
        return false;
      }
    };

    // Helper: Check if contact exists
    const contactExists = async (contactId) => {
      try {
        const contact = await base44.asServiceRole.entities.Contact.get(contactId);
        return !!contact;
      } catch {
        return false;
      }
    };

    // Helper: Check if employee exists
    const employeeExists = async (email, tenantId) => {
      try {
        const employees = await base44.asServiceRole.entities.Employee.filter({
          tenant_id: tenantId,
          $or: [{ email }, { user_email: email }]
        });
        return employees && employees.length > 0;
      } catch {
        return false;
      }
    };

    // Clean orphans for each tenant
    for (const tenant of tenants) {
      console.log(`[Cron Orphan Cleanup] Processing tenant: ${tenant.name}`);

      // Check Contacts
      const contacts = await base44.asServiceRole.entities.Contact.filter({ tenant_id: tenant.id }, '-created_date', 1000);
      for (const contact of contacts) {
        let needsUpdate = false;
        const updates = {};

        if (contact.account_id && !(await accountExists(contact.account_id))) {
          results.entities.contacts.found++;
          results.orphansFound++;
          if (autoFix) {
            updates.account_id = null;
            updates.account_name = null;
            updates.account_industry = null;
            needsUpdate = true;
          }
        }

        if (contact.assigned_to && !(await employeeExists(contact.assigned_to, tenant.id))) {
          results.entities.contacts.found++;
          results.orphansFound++;
          if (autoFix) {
            updates.assigned_to = null;
            updates.assigned_to_name = null;
            needsUpdate = true;
          }
        }

        if (needsUpdate && autoFix) {
          try {
            await base44.asServiceRole.entities.Contact.update(contact.id, updates);
            results.entities.contacts.fixed++;
            results.orphansFixed++;
          } catch (error) {
            results.errors.push({ entity: 'Contact', id: contact.id, error: error.message });
          }
        }
      }

      // Check Leads
      const leads = await base44.asServiceRole.entities.Lead.filter({ tenant_id: tenant.id }, '-created_date', 1000);
      for (const lead of leads) {
        let needsUpdate = false;
        const updates = {};

        if (lead.account_id && !(await accountExists(lead.account_id))) {
          results.entities.leads.found++;
          results.orphansFound++;
          if (autoFix) {
            updates.account_id = null;
            updates.account_name = null;
            needsUpdate = true;
          }
        }

        if (lead.assigned_to && !(await employeeExists(lead.assigned_to, tenant.id))) {
          results.entities.leads.found++;
          results.orphansFound++;
          if (autoFix) {
            updates.assigned_to = null;
            updates.assigned_to_name = null;
            needsUpdate = true;
          }
        }

        if (needsUpdate && autoFix) {
          try {
            await base44.asServiceRole.entities.Lead.update(lead.id, updates);
            results.entities.leads.fixed++;
            results.orphansFixed++;
          } catch (error) {
            results.errors.push({ entity: 'Lead', id: lead.id, error: error.message });
          }
        }
      }

      // Check Opportunities
      const opportunities = await base44.asServiceRole.entities.Opportunity.filter({ tenant_id: tenant.id }, '-created_date', 1000);
      for (const opp of opportunities) {
        let needsUpdate = false;
        const updates = {};

        if (opp.account_id && !(await accountExists(opp.account_id))) {
          results.entities.opportunities.found++;
          results.orphansFound++;
          if (autoFix) {
            updates.account_id = null;
            updates.account_name = null;
            updates.account_industry = null;
            needsUpdate = true;
          }
        }

        if (opp.contact_id && !(await contactExists(opp.contact_id))) {
          results.entities.opportunities.found++;
          results.orphansFound++;
          if (autoFix) {
            updates.contact_id = null;
            updates.contact_name = null;
            updates.contact_email = null;
            needsUpdate = true;
          }
        }

        if (opp.assigned_to && !(await employeeExists(opp.assigned_to, tenant.id))) {
          results.entities.opportunities.found++;
          results.orphansFound++;
          if (autoFix) {
            updates.assigned_to = null;
            updates.assigned_to_name = null;
            needsUpdate = true;
          }
        }

        if (needsUpdate && autoFix) {
          try {
            await base44.asServiceRole.entities.Opportunity.update(opp.id, updates);
            results.entities.opportunities.fixed++;
            results.orphansFixed++;
          } catch (error) {
            results.errors.push({ entity: 'Opportunity', id: opp.id, error: error.message });
          }
        }
      }

      // Check Activities
      const activities = await base44.asServiceRole.entities.Activity.filter({ tenant_id: tenant.id }, '-created_date', 1000);
      for (const activity of activities) {
        let needsUpdate = false;
        const updates = {};

        if (activity.assigned_to && !(await employeeExists(activity.assigned_to, tenant.id))) {
          results.entities.activities.found++;
          results.orphansFound++;
          if (autoFix) {
            updates.assigned_to = null;
            updates.assigned_to_name = null;
            needsUpdate = true;
          }
        }

        // Check related entity exists
        if (activity.related_to && activity.related_id) {
          let exists = false;
          switch (activity.related_to) {
            case 'contact':
              exists = await contactExists(activity.related_id);
              break;
            case 'account':
              exists = await accountExists(activity.related_id);
              break;
            case 'lead':
              try {
                const lead = await base44.asServiceRole.entities.Lead.get(activity.related_id);
                exists = !!lead;
              } catch {
                exists = false;
              }
              break;
            case 'opportunity':
              try {
                const opp = await base44.asServiceRole.entities.Opportunity.get(activity.related_id);
                exists = !!opp;
              } catch {
                exists = false;
              }
              break;
          }

          if (!exists) {
            results.entities.activities.found++;
            results.orphansFound++;
            if (autoFix) {
              updates.related_id = null;
              updates.related_to = null;
              updates.related_name = null;
              updates.related_email = null;
              needsUpdate = true;
            }
          }
        }

        if (needsUpdate && autoFix) {
          try {
            await base44.asServiceRole.entities.Activity.update(activity.id, updates);
            results.entities.activities.fixed++;
            results.orphansFixed++;
          } catch (error) {
            results.errors.push({ entity: 'Activity', id: activity.id, error: error.message });
          }
        }
      }
    }

    const endTime = new Date();
    const duration = endTime - startTime;

    // Update health log
    await base44.asServiceRole.entities.SyncHealth.update(healthLogId, {
      end_time: endTime.toISOString(),
      duration_ms: duration,
      status: results.errors.length > 0 ? 'partial' : 'completed',
      records_processed: results.orphansFound,
      records_updated: results.orphansFixed,
      error_count: results.errors.length,
      errors: results.errors.slice(0, 100),
      entity_stats: {
        contacts: results.entities.contacts.fixed,
        leads: results.entities.leads.fixed,
        opportunities: results.entities.opportunities.fixed,
        activities: results.entities.activities.fixed
      }
    });

    // Notify admins if orphans were found
    if (results.orphansFound > 0) {
      try {
        const adminUsers = await base44.asServiceRole.entities.User.filter({
          role: { $in: ['admin', 'superadmin'] }
        });

        for (const admin of adminUsers) {
          await base44.asServiceRole.entities.Notification.create({
            user_email: admin.email,
            title: 'Orphan Records Cleanup',
            description: `Found and ${autoFix ? 'fixed' : 'detected'} ${results.orphansFound} orphaned references across ${tenants.length} tenants.`,
            link: '/settings?tab=data-consistency',
            icon: 'AlertCircle'
          });
        }
      } catch (error) {
        console.error('[Cron Orphan Cleanup] Failed to create notifications:', error);
      }
    }

    console.log(`[Cron Orphan Cleanup] Complete. Found: ${results.orphansFound}, Fixed: ${results.orphansFixed}`);

    return Response.json({
      success: true,
      message: 'Orphan cleanup completed',
      results: results,
      healthLogId: healthLogId
    });

  } catch (error) {
    console.error('[Cron Orphan Cleanup] Fatal error:', error);

    if (healthLogId) {
      try {
        await base44.asServiceRole.entities.SyncHealth.update(healthLogId, {
          end_time: new Date().toISOString(),
          duration_ms: new Date() - startTime,
          status: 'failed',
          error_count: 1,
          errors: [{ error: error.message }]
        });
      } catch (updateError) {
        console.error('[Cron Orphan Cleanup] Failed to update health log:', updateError);
      }
    }

    return Response.json({
      success: false,
      error: error.message || 'Cleanup failed'
    }, { status: 500 });
  }
});

----------------------------

export default cronOrphanCleanup;
