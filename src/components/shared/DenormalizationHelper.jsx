/**
 * Denormalization Helper
 * Automatically enriches entity data with denormalized fields before save
 * Used by all forms to maintain data consistency
 */

import { Account, Employee, Contact, Lead, Opportunity } from "@/api/entities";

// Helper to check if a string is a valid UUID
const isValidUUID = (str) => {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

export class DenormalizationHelper {
  
  /**
   * Enrich contact data with denormalized fields
   */
  static async enrichContact(contactData, _tenantId) {
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
        // assigned_to should be a UUID (employee.id)
        // Skip enrichment if it's an email (legacy data) - just clear the invalid value
        if (isValidUUID(contactData.assigned_to)) {
          const employee = await Employee.get(contactData.assigned_to);
          if (employee) {
            enriched.assigned_to_name = `${employee.first_name} ${employee.last_name}`;
          }
        } else {
          // Legacy email data - clear it since it's invalid
          console.warn("assigned_to contains non-UUID value (legacy data), clearing:", contactData.assigned_to);
          enriched.assigned_to = null;
          enriched.assigned_to_name = null;
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
  static async enrichLead(leadData, _tenantId) {
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
        // assigned_to is now a UUID (employee.id)
        const employee = await Employee.get(leadData.assigned_to);
        if (employee) {
          enriched.assigned_to_name = `${employee.first_name} ${employee.last_name}`;
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
  static async enrichOpportunity(oppData, _tenantId) {
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
        // assigned_to is now a UUID (employee.id)
        const employee = await Employee.get(oppData.assigned_to);
        if (employee) {
          enriched.assigned_to_name = `${employee.first_name} ${employee.last_name}`;
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
  static async enrichActivity(activityData, _tenantId) {
    const enriched = { ...activityData };
    
    // Enrich assigned employee information
    if (activityData.assigned_to) {
      try {
        // assigned_to is now a UUID (employee.id)
        const employee = await Employee.get(activityData.assigned_to);
        if (employee) {
          enriched.assigned_to_name = `${employee.first_name} ${employee.last_name}`;
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