/**
 * detectOrphanedRecords
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Detect orphaned records across all entities
 * Returns list of records with invalid foreign key references
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can run orphan detection
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { tenantId, entityTypes = ['Contact', 'Lead', 'Opportunity', 'Activity'] } = await req.json();
    
    const tenant = tenantId || user.tenant_id;
    if (!tenant) {
      return Response.json({ 
        error: 'No tenant context available' 
      }, { status: 400 });
    }

    const results = {
      contacts: [],
      leads: [],
      opportunities: [],
      activities: [],
      totalOrphans: 0
    };

    // Helper function to validate account
    const validateAccount = async (accountId) => {
      try {
        const account = await base44.entities.Account.get(accountId);
        return account && account.tenant_id === tenant;
      } catch (error) {
        return false;
      }
    };

    // Helper function to validate employee
    const validateEmployee = async (assignedTo) => {
      try {
        const employees = await base44.entities.Employee.filter({
          tenant_id: tenant,
          $or: [{ email: assignedTo }, { user_email: assignedTo }]
        });
        return employees && employees.length > 0 && employees[0].is_active;
      } catch (error) {
        return false;
      }
    };

    // Helper function to validate contact
    const validateContact = async (contactId) => {
      try {
        const contact = await base44.entities.Contact.get(contactId);
        return contact && contact.tenant_id === tenant;
      } catch (error) {
        return false;
      }
    };

    // Check Contacts
    if (entityTypes.includes('Contact')) {
      const contacts = await base44.entities.Contact.filter({ tenant_id: tenant }, '-created_date', 500);
      
      for (const contact of contacts) {
        const issues = [];
        
        if (contact.account_id) {
          const validAccount = await validateAccount(contact.account_id);
          if (!validAccount) {
            issues.push({ field: 'account_id', value: contact.account_id, error: 'Invalid account reference' });
          }
        }
        
        if (contact.assigned_to) {
          const validEmployee = await validateEmployee(contact.assigned_to);
          if (!validEmployee) {
            issues.push({ field: 'assigned_to', value: contact.assigned_to, error: 'Invalid or inactive employee' });
          }
        }
        
        if (issues.length > 0) {
          results.contacts.push({
            id: contact.id,
            name: `${contact.first_name} ${contact.last_name}`,
            email: contact.email,
            issues: issues
          });
        }
      }
    }

    // Check Leads
    if (entityTypes.includes('Lead')) {
      const leads = await base44.entities.Lead.filter({ tenant_id: tenant }, '-created_date', 500);
      
      for (const lead of leads) {
        const issues = [];
        
        if (lead.account_id) {
          const validAccount = await validateAccount(lead.account_id);
          if (!validAccount) {
            issues.push({ field: 'account_id', value: lead.account_id, error: 'Invalid account reference' });
          }
        }
        
        if (lead.assigned_to) {
          const validEmployee = await validateEmployee(lead.assigned_to);
          if (!validEmployee) {
            issues.push({ field: 'assigned_to', value: lead.assigned_to, error: 'Invalid or inactive employee' });
          }
        }
        
        if (lead.converted_contact_id) {
          const validContact = await validateContact(lead.converted_contact_id);
          if (!validContact) {
            issues.push({ field: 'converted_contact_id', value: lead.converted_contact_id, error: 'Invalid contact reference' });
          }
        }
        
        if (lead.converted_account_id) {
          const validAccount = await validateAccount(lead.converted_account_id);
          if (!validAccount) {
            issues.push({ field: 'converted_account_id', value: lead.converted_account_id, error: 'Invalid account reference' });
          }
        }
        
        if (issues.length > 0) {
          results.leads.push({
            id: lead.id,
            name: `${lead.first_name} ${lead.last_name}`,
            email: lead.email,
            issues: issues
          });
        }
      }
    }

    // Check Opportunities
    if (entityTypes.includes('Opportunity')) {
      const opportunities = await base44.entities.Opportunity.filter({ tenant_id: tenant }, '-created_date', 500);
      
      for (const opp of opportunities) {
        const issues = [];
        
        if (opp.account_id) {
          const validAccount = await validateAccount(opp.account_id);
          if (!validAccount) {
            issues.push({ field: 'account_id', value: opp.account_id, error: 'Invalid account reference' });
          }
        }
        
        if (opp.contact_id) {
          const validContact = await validateContact(opp.contact_id);
          if (!validContact) {
            issues.push({ field: 'contact_id', value: opp.contact_id, error: 'Invalid contact reference' });
          }
        }
        
        if (opp.assigned_to) {
          const validEmployee = await validateEmployee(opp.assigned_to);
          if (!validEmployee) {
            issues.push({ field: 'assigned_to', value: opp.assigned_to, error: 'Invalid or inactive employee' });
          }
        }
        
        if (issues.length > 0) {
          results.opportunities.push({
            id: opp.id,
            name: opp.name,
            amount: opp.amount,
            issues: issues
          });
        }
      }
    }

    // Check Activities
    if (entityTypes.includes('Activity')) {
      const activities = await base44.entities.Activity.filter({ tenant_id: tenant }, '-created_date', 500);
      
      for (const activity of activities) {
        const issues = [];
        
        if (activity.related_to && activity.related_id) {
          let valid = false;
          try {
            switch (activity.related_to) {
              case 'contact': {
                valid = await validateContact(activity.related_id);
                break;
              }
              case 'account': {
                valid = await validateAccount(activity.related_id);
                break;
              }
              case 'lead': {
                const lead = await base44.entities.Lead.get(activity.related_id);
                valid = lead && lead.tenant_id === tenant;
                break;
              }
              case 'opportunity': {
                const opp = await base44.entities.Opportunity.get(activity.related_id);
                valid = opp && opp.tenant_id === tenant;
                break;
              }
              default:
                issues.push({ field: 'related_to', value: activity.related_to, error: 'Unknown entity type' });
            }
          } catch (error) {
            valid = false;
          }
          
          if (!valid && !issues.some(i => i.field === 'related_to')) {
            issues.push({ field: 'related_id', value: activity.related_id, error: `Invalid ${activity.related_to} reference` });
          }
        }
        
        if (activity.assigned_to) {
          const validEmployee = await validateEmployee(activity.assigned_to);
          if (!validEmployee) {
            issues.push({ field: 'assigned_to', value: activity.assigned_to, error: 'Invalid or inactive employee' });
          }
        }
        
        if (issues.length > 0) {
          results.activities.push({
            id: activity.id,
            subject: activity.subject,
            type: activity.type,
            related_to: activity.related_to,
            related_id: activity.related_id,
            issues: issues
          });
        }
      }
    }

    // Calculate totals
    results.totalOrphans = 
      results.contacts.length + 
      results.leads.length + 
      results.opportunities.length + 
      results.activities.length;

    return Response.json({
      success: true,
      results: results,
      scannedEntities: entityTypes,
      tenantId: tenant
    });

  } catch (error) {
    console.error("Orphan detection error:", error);
    return Response.json({ 
      error: error.message || 'Orphan detection failed',
      success: false
    }, { status: 500 });
  }
});

----------------------------

export default detectOrphanedRecords;
