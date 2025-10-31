/**
 * Denormalization Helper
 * Automatically enriches entity data with denormalized fields before save
 * Used by all forms to maintain data consistency
 */

import { Account, Employee, Contact, Lead, Opportunity } from "@/api/entities";

export class DenormalizationHelper {
  
  /**
   * Enrich contact data with denormalized fields
   */
  static async enrichContact(contactData, tenantId) {
    const enriched = { ...contactData };
    
    // Enrich account information
    if (contactData.account_id) {
      try {
        const account = await Account.get(contactData.account_id);
        if (account) {
          enriched.account_name = account.name;
          enriched.account_industry = account.industry;
        }
      } catch (error) {
        console.warn("Could not enrich account data:", error);
      }
    } else {
      // Clear denormalized fields if account is removed
      enriched.account_name = null;
      enriched.account_industry = null;
    }
    
    // Enrich assigned employee information
    if (contactData.assigned_to) {
      try {
        const employees = await Employee.filter({
          tenant_id: tenantId,
          $or: [
            { email: contactData.assigned_to },
            { user_email: contactData.assigned_to }
          ]
        });
        if (employees && employees.length > 0) {
          const emp = employees[0];
          enriched.assigned_to_name = `${emp.first_name} ${emp.last_name}`;
        }
      } catch (error) {
        console.warn("Could not enrich employee data:", error);
      }
    } else {
      enriched.assigned_to_name = null;
    }
    
    enriched.last_synced = new Date().toISOString();
    return enriched;
  }

  /**
   * Enrich lead data with denormalized fields
   */
  static async enrichLead(leadData, tenantId) {
    const enriched = { ...leadData };
    
    // Enrich account information
    if (leadData.account_id) {
      try {
        const account = await Account.get(leadData.account_id);
        if (account) {
          enriched.account_name = account.name;
        }
      } catch (error) {
        console.warn("Could not enrich account data:", error);
      }
    } else {
      enriched.account_name = null;
    }
    
    // Enrich assigned employee information
    if (leadData.assigned_to) {
      try {
        const employees = await Employee.filter({
          tenant_id: tenantId,
          $or: [
            { email: leadData.assigned_to },
            { user_email: leadData.assigned_to }
          ]
        });
        if (employees && employees.length > 0) {
          const emp = employees[0];
          enriched.assigned_to_name = `${emp.first_name} ${emp.last_name}`;
        }
      } catch (error) {
        console.warn("Could not enrich employee data:", error);
      }
    } else {
      enriched.assigned_to_name = null;
    }
    
    // Enrich converted contact/account if present
    if (leadData.converted_contact_id) {
      try {
        const contact = await Contact.get(leadData.converted_contact_id);
        if (contact) {
          enriched.converted_contact_name = `${contact.first_name} ${contact.last_name}`;
        }
      } catch (error) {
        console.warn("Could not enrich converted contact data:", error);
      }
    }
    
    if (leadData.converted_account_id) {
      try {
        const account = await Account.get(leadData.converted_account_id);
        if (account) {
          enriched.converted_account_name = account.name;
        }
      } catch (error) {
        console.warn("Could not enrich converted account data:", error);
      }
    }
    
    enriched.last_synced = new Date().toISOString();
    return enriched;
  }

  /**
   * Enrich opportunity data with denormalized fields
   */
  static async enrichOpportunity(oppData, tenantId) {
    const enriched = { ...oppData };
    
    // Enrich account information
    if (oppData.account_id) {
      try {
        const account = await Account.get(oppData.account_id);
        if (account) {
          enriched.account_name = account.name;
          enriched.account_industry = account.industry;
        }
      } catch (error) {
        console.warn("Could not enrich account data:", error);
      }
    } else {
      enriched.account_name = null;
      enriched.account_industry = null;
    }
    
    // Enrich contact information
    if (oppData.contact_id) {
      try {
        const contact = await Contact.get(oppData.contact_id);
        if (contact) {
          enriched.contact_name = `${contact.first_name} ${contact.last_name}`;
          enriched.contact_email = contact.email;
        }
      } catch (error) {
        console.warn("Could not enrich contact data:", error);
      }
    } else {
      enriched.contact_name = null;
      enriched.contact_email = null;
    }
    
    // Enrich assigned employee information
    if (oppData.assigned_to) {
      try {
        const employees = await Employee.filter({
          tenant_id: tenantId,
          $or: [
            { email: oppData.assigned_to },
            { user_email: oppData.assigned_to }
          ]
        });
        if (employees && employees.length > 0) {
          const emp = employees[0];
          enriched.assigned_to_name = `${emp.first_name} ${emp.last_name}`;
        }
      } catch (error) {
        console.warn("Could not enrich employee data:", error);
      }
    } else {
      enriched.assigned_to_name = null;
    }
    
    enriched.last_synced = new Date().toISOString();
    return enriched;
  }

  /**
   * Enrich activity data with denormalized fields
   */
  static async enrichActivity(activityData, tenantId) {
    const enriched = { ...activityData };
    
    // Enrich assigned employee information
    if (activityData.assigned_to) {
      try {
        const employees = await Employee.filter({
          tenant_id: tenantId,
          $or: [
            { email: activityData.assigned_to },
            { user_email: activityData.assigned_to }
          ]
        });
        if (employees && employees.length > 0) {
          const emp = employees[0];
          enriched.assigned_to_name = `${emp.first_name} ${emp.last_name}`;
        }
      } catch (error) {
        console.warn("Could not enrich employee data:", error);
      }
    } else {
      enriched.assigned_to_name = null;
    }
    
    // Enrich related entity information
    if (activityData.related_to && activityData.related_id) {
      try {
        switch (activityData.related_to) {
          case 'contact': {
            const contact = await Contact.get(activityData.related_id);
            if (contact) {
              enriched.related_name = `${contact.first_name} ${contact.last_name}`;
              enriched.related_email = contact.email;
            }
            break;
          }
          case 'account': {
            const account = await Account.get(activityData.related_id);
            if (account) {
              enriched.related_name = account.name;
            }
            break;
          }
          case 'lead': {
            const lead = await Lead.get(activityData.related_id);
            if (lead) {
              enriched.related_name = `${lead.first_name} ${lead.last_name}`;
              enriched.related_email = lead.email;
            }
            break;
          }
          case 'opportunity': {
            const opp = await Opportunity.get(activityData.related_id);
            if (opp) {
              enriched.related_name = opp.name;
            }
            break;
          }
        }
      } catch (error) {
        console.warn("Could not enrich related entity data:", error);
      }
    } else {
      enriched.related_name = null;
      enriched.related_email = null;
    }
    
    enriched.last_synced = new Date().toISOString();
    return enriched;
  }
}