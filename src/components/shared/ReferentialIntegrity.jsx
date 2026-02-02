import { Contact, Lead, Opportunity, Activity, Account, Employee, Note } from "@/api/entities";

/**
 * REFERENTIAL INTEGRITY UTILITIES
 * Enforces data consistency and relationship validation across entities
 * Phase 1 of Database Architecture Optimization
 */

export class ReferentialIntegrityManager {
  
  // ===== VALIDATION FUNCTIONS =====
  
  /**
   * Validate that an account exists and belongs to the tenant
   */
  static async validateAccount(accountId, tenantId) {
    if (!accountId) return { valid: true, exists: false }; // null is valid (optional)
    
    try {
      const account = await Account.get(accountId);
      if (!account) {
        return { valid: false, error: "Account does not exist", exists: false };
      }
      if (account.tenant_id !== tenantId) {
        return { valid: false, error: "Account belongs to different tenant", exists: false };
      }
      return { valid: true, exists: true, entity: account };
    } catch (error) {
      return { valid: false, error: error.message, exists: false };
    }
  }

  /**
   * Validate that an employee exists and is active
   */
  static async validateEmployee(assignedTo, tenantId) {
    if (!assignedTo) return { valid: true, exists: false }; // null is valid (optional)
    
    try {
      // Find by email or user_email
      const employees = await Employee.filter({ 
        tenant_id: tenantId,
        $or: [
          { email: assignedTo },
          { user_email: assignedTo }
        ]
      });
      
      if (!employees || employees.length === 0) {
        return { valid: false, error: "Employee not found", exists: false };
      }
      
      const employee = employees[0];
      if (!employee.is_active) {
        return { valid: false, error: "Employee is inactive", exists: false };
      }
      
      return { valid: true, exists: true, entity: employee };
    } catch (error) {
      return { valid: false, error: error.message, exists: false };
    }
  }

  /**
   * Validate that a contact exists and belongs to the tenant
   */
  static async validateContact(contactId, tenantId) {
    if (!contactId) return { valid: true, exists: false };
    
    try {
      const contact = await Contact.get(contactId);
      if (!contact) {
        return { valid: false, error: "Contact does not exist", exists: false };
      }
      if (contact.tenant_id !== tenantId) {
        return { valid: false, error: "Contact belongs to different tenant", exists: false };
      }
      return { valid: true, exists: true, entity: contact };
    } catch (error) {
      return { valid: false, error: error.message, exists: false };
    }
  }

  /**
   * Validate that a lead exists and belongs to the tenant
   */
  static async validateLead(leadId, tenantId) {
    if (!leadId) return { valid: true, exists: false };
    
    try {
      const lead = await Lead.get(leadId);
      if (!lead) {
        return { valid: false, error: "Lead does not exist", exists: false };
      }
      if (lead.tenant_id !== tenantId) {
        return { valid: false, error: "Lead belongs to different tenant", exists: false };
      }
      return { valid: true, exists: true, entity: lead };
    } catch (error) {
      return { valid: false, error: error.message, exists: false };
    }
  }

  /**
   * Validate all foreign key references in a Contact record
   */
  static async validateContactReferences(contactData, tenantId) {
    const errors = [];
    
    // Validate account_id
    if (contactData.account_id) {
      const accountCheck = await this.validateAccount(contactData.account_id, tenantId);
      if (!accountCheck.valid) {
        errors.push({ field: 'account_id', error: accountCheck.error });
      }
    }
    
    // Validate assigned_to
    if (contactData.assigned_to) {
      const employeeCheck = await this.validateEmployee(contactData.assigned_to, tenantId);
      if (!employeeCheck.valid) {
        errors.push({ field: 'assigned_to', error: employeeCheck.error });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate all foreign key references in a Lead record
   */
  static async validateLeadReferences(leadData, tenantId) {
    const errors = [];
    
    // Validate account_id
    if (leadData.account_id) {
      const accountCheck = await this.validateAccount(leadData.account_id, tenantId);
      if (!accountCheck.valid) {
        errors.push({ field: 'account_id', error: accountCheck.error });
      }
    }
    
    // Validate assigned_to
    if (leadData.assigned_to) {
      const employeeCheck = await this.validateEmployee(leadData.assigned_to, tenantId);
      if (!employeeCheck.valid) {
        errors.push({ field: 'assigned_to', error: employeeCheck.error });
      }
    }
    
    // Validate converted references
    if (leadData.converted_contact_id) {
      const contactCheck = await this.validateContact(leadData.converted_contact_id, tenantId);
      if (!contactCheck.valid) {
        errors.push({ field: 'converted_contact_id', error: contactCheck.error });
      }
    }
    
    if (leadData.converted_account_id) {
      const accountCheck = await this.validateAccount(leadData.converted_account_id, tenantId);
      if (!accountCheck.valid) {
        errors.push({ field: 'converted_account_id', error: accountCheck.error });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate all foreign key references in an Opportunity record
   */
  static async validateOpportunityReferences(oppData, tenantId) {
    const errors = [];
    
    // Validate account_id (required for opportunities)
    if (oppData.account_id) {
      const accountCheck = await this.validateAccount(oppData.account_id, tenantId);
      if (!accountCheck.valid) {
        errors.push({ field: 'account_id', error: accountCheck.error });
      }
    }
    
    // Validate contact_id
    if (oppData.contact_id) {
      const contactCheck = await this.validateContact(oppData.contact_id, tenantId);
      if (!contactCheck.valid) {
        errors.push({ field: 'contact_id', error: contactCheck.error });
      }
    }
    
    // Validate lead_id
    if (oppData.lead_id) {
      const leadCheck = await this.validateLead(oppData.lead_id, tenantId);
      if (!leadCheck.valid) {
        errors.push({ field: 'lead_id', error: leadCheck.error });
      }
    }
    
    // Validate assigned_to
    if (oppData.assigned_to) {
      const employeeCheck = await this.validateEmployee(oppData.assigned_to, tenantId);
      if (!employeeCheck.valid) {
        errors.push({ field: 'assigned_to', error: employeeCheck.error });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Validate polymorphic Activity references
   */
  static async validateActivityReferences(activityData, tenantId) {
    const errors = [];
    
    // Validate polymorphic related_to/related_id
    if (activityData.related_to && activityData.related_id) {
      let entityCheck;
      
      switch (activityData.related_to) {
        case 'contact':
          entityCheck = await this.validateContact(activityData.related_id, tenantId);
          break;
        case 'account':
          entityCheck = await this.validateAccount(activityData.related_id, tenantId);
          break;
        case 'lead':
          entityCheck = await this.validateLead(activityData.related_id, tenantId);
          break;
        case 'opportunity':
          // Would need validateOpportunity similar to above
          entityCheck = { valid: true }; // Skip for now
          break;
        default:
          errors.push({ field: 'related_to', error: `Unknown entity type: ${activityData.related_to}` });
          return { valid: false, errors };
      }
      
      if (!entityCheck.valid) {
        errors.push({ field: 'related_id', error: entityCheck.error });
      }
    }
    
    // Validate assigned_to
    if (activityData.assigned_to) {
      const employeeCheck = await this.validateEmployee(activityData.assigned_to, tenantId);
      if (!employeeCheck.valid) {
        errors.push({ field: 'assigned_to', error: employeeCheck.error });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  // ===== ORPHAN DETECTION =====
  
  /**
   * Find contacts with invalid account references
   */
  static async findOrphanedContacts(tenantId) {
    try {
      const contacts = await Contact.filter({ tenant_id: tenantId }, '-created_date', 500);
      const orphans = [];
      
      for (const contact of contacts) {
        if (contact.account_id) {
          const accountCheck = await this.validateAccount(contact.account_id, tenantId);
          if (!accountCheck.valid) {
            orphans.push({
              id: contact.id,
              name: `${contact.first_name} ${contact.last_name}`,
              email: contact.email,
              issue: 'Invalid account_id',
              account_id: contact.account_id,
              error: accountCheck.error
            });
          }
        }
        
        if (contact.assigned_to) {
          const employeeCheck = await this.validateEmployee(contact.assigned_to, tenantId);
          if (!employeeCheck.valid) {
            orphans.push({
              id: contact.id,
              name: `${contact.first_name} ${contact.last_name}`,
              email: contact.email,
              issue: 'Invalid assigned_to',
              assigned_to: contact.assigned_to,
              error: employeeCheck.error
            });
          }
        }
      }
      
      return orphans;
    } catch (error) {
      console.error("Error finding orphaned contacts:", error);
      return [];
    }
  }

  /**
   * Find leads with invalid references
   */
  static async findOrphanedLeads(tenantId) {
    try {
      const leads = await Lead.filter({ tenant_id: tenantId }, '-created_date', 500);
      const orphans = [];
      
      for (const lead of leads) {
        if (lead.account_id) {
          const accountCheck = await this.validateAccount(lead.account_id, tenantId);
          if (!accountCheck.valid) {
            orphans.push({
              id: lead.id,
              name: `${lead.first_name} ${lead.last_name}`,
              email: lead.email,
              issue: 'Invalid account_id',
              account_id: lead.account_id,
              error: accountCheck.error
            });
          }
        }
        
        if (lead.assigned_to) {
          const employeeCheck = await this.validateEmployee(lead.assigned_to, tenantId);
          if (!employeeCheck.valid) {
            orphans.push({
              id: lead.id,
              name: `${lead.first_name} ${lead.last_name}`,
              email: lead.email,
              issue: 'Invalid assigned_to',
              assigned_to: lead.assigned_to,
              error: employeeCheck.error
            });
          }
        }
      }
      
      return orphans;
    } catch (error) {
      console.error("Error finding orphaned leads:", error);
      return [];
    }
  }

  /**
   * Find opportunities with invalid references
   */
  static async findOrphanedOpportunities(tenantId) {
    try {
      const opportunities = await Opportunity.filter({ tenant_id: tenantId }, '-created_date', 500);
      const orphans = [];
      
      for (const opp of opportunities) {
        if (opp.account_id) {
          const accountCheck = await this.validateAccount(opp.account_id, tenantId);
          if (!accountCheck.valid) {
            orphans.push({
              id: opp.id,
              name: opp.name,
              issue: 'Invalid account_id',
              account_id: opp.account_id,
              error: accountCheck.error
            });
          }
        }
        
        if (opp.contact_id) {
          const contactCheck = await this.validateContact(opp.contact_id, tenantId);
          if (!contactCheck.valid) {
            orphans.push({
              id: opp.id,
              name: opp.name,
              issue: 'Invalid contact_id',
              contact_id: opp.contact_id,
              error: contactCheck.error
            });
          }
        }
      }
      
      return orphans;
    } catch (error) {
      console.error("Error finding orphaned opportunities:", error);
      return [];
    }
  }

  /**
   * Find activities with invalid polymorphic references
   */
  static async findOrphanedActivities(tenantId) {
    try {
      const activitiesResult = await Activity.filter({ tenant_id: tenantId }, '-created_date', 500);
      // Handle both array and { activities: [...] } response formats
      const activities = Array.isArray(activitiesResult) ? activitiesResult : (activitiesResult?.activities || []);
      const orphans = [];
      
      for (const activity of activities) {
        if (activity.related_to && activity.related_id) {
          const validation = await this.validateActivityReferences(activity, tenantId);
          if (!validation.valid) {
            orphans.push({
              id: activity.id,
              subject: activity.subject,
              type: activity.type,
              related_to: activity.related_to,
              related_id: activity.related_id,
              errors: validation.errors
            });
          }
        }
      }
      
      return orphans;
    } catch (error) {
      console.error("Error finding orphaned activities:", error);
      return [];
    }
  }

  /**
   * Comprehensive orphan scan across all entities
   */
  static async scanAllOrphans(tenantId) {
    const results = {
      contacts: await this.findOrphanedContacts(tenantId),
      leads: await this.findOrphanedLeads(tenantId),
      opportunities: await this.findOrphanedOpportunities(tenantId),
      activities: await this.findOrphanedActivities(tenantId),
    };
    
    results.totalOrphans = 
      results.contacts.length + 
      results.leads.length + 
      results.opportunities.length + 
      results.activities.length;
    
    return results;
  }

  // ===== CLEANUP UTILITIES =====
  
  /**
   * Clean orphaned contact references (set to null)
   */
  static async cleanOrphanedContactReferences(contactId, field) {
    try {
      const updateData = { [field]: null };
      await Contact.update(contactId, updateData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk clean all orphaned references for a specific entity type
   */
  static async bulkCleanOrphans(entityType, orphanList) {
    const results = { success: 0, failed: 0, errors: [] };
    
    for (const orphan of orphanList) {
      try {
        let Entity;
        switch (entityType) {
          case 'contact':
            Entity = Contact;
            break;
          case 'lead':
            Entity = Lead;
            break;
          case 'opportunity':
            Entity = Opportunity;
            break;
          case 'activity':
            Entity = Activity;
            break;
          default:
            throw new Error(`Unknown entity type: ${entityType}`);
        }
        
        // Set invalid reference fields to null
        const updateData = {};
        if (orphan.issue.includes('account_id')) {
          updateData.account_id = null;
        }
        if (orphan.issue.includes('assigned_to')) {
          updateData.assigned_to = null;
        }
        if (orphan.issue.includes('contact_id')) {
          updateData.contact_id = null;
        }
        
        await Entity.update(orphan.id, updateData);
        results.success += 1;
      } catch (error) {
        results.failed += 1;
        results.errors.push({ id: orphan.id, error: error.message });
      }
    }
    
    return results;
  }

  // ===== CASCADE DELETE HANDLERS =====
  
  /**
   * Handle account deletion - cascade or nullify references
   */
  static async handleAccountDelete(accountId, tenantId, strategy = 'nullify') {
    const affected = {
      contacts: [],
      leads: [],
      opportunities: [],
      notes: []
    };
    
    try {
      // Find all related contacts
      const contacts = await Contact.filter({ tenant_id: tenantId, account_id: accountId });
      for (const contact of contacts) {
        if (strategy === 'nullify') {
          await Contact.update(contact.id, { account_id: null, account_name: null });
          affected.contacts.push(contact.id);
        } else if (strategy === 'delete') {
          await Contact.delete(contact.id);
          affected.contacts.push(contact.id);
        }
      }
      
      // Find all related leads
      const leads = await Lead.filter({ tenant_id: tenantId, account_id: accountId });
      for (const lead of leads) {
        if (strategy === 'nullify') {
          await Lead.update(lead.id, { account_id: null, company: null });
          affected.leads.push(lead.id);
        } else if (strategy === 'delete') {
          await Lead.delete(lead.id);
          affected.leads.push(lead.id);
        }
      }
      
      // Find all related opportunities
      const opportunities = await Opportunity.filter({ tenant_id: tenantId, account_id: accountId });
      for (const opp of opportunities) {
        if (strategy === 'nullify') {
          await Opportunity.update(opp.id, { account_id: null });
          affected.opportunities.push(opp.id);
        } else if (strategy === 'delete') {
          await Opportunity.delete(opp.id);
          affected.opportunities.push(opp.id);
        }
      }
      
      // Find all related notes
      const notes = await Note.filter({ tenant_id: tenantId, related_to: 'account', related_id: accountId });
      for (const note of notes) {
        if (strategy === 'delete') {
          await Note.delete(note.id);
          affected.notes.push(note.id);
        }
      }
      
      return {
        success: true,
        strategy: strategy,
        affected: affected
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        affected: affected
      };
    }
  }

  /**
   * Handle contact deletion - cascade activities and notes
   */
  static async handleContactDelete(contactId, tenantId) {
    const affected = {
      activities: [],
      notes: [],
      opportunities: []
    };
    
    try {
      // Delete or archive related activities
      const activitiesResult = await Activity.filter({ 
        tenant_id: tenantId, 
        related_to: 'contact', 
        related_id: contactId 
      });
      // Handle both array and { activities: [...] } response formats
      const activities = Array.isArray(activitiesResult) ? activitiesResult : (activitiesResult?.activities || []);
      for (const activity of activities) {
        // Soft delete: set related_id to null instead of hard delete
        await Activity.update(activity.id, { related_id: null, related_to: null });
        affected.activities.push(activity.id);
      }
      
      // Delete related notes
      const notes = await Note.filter({ 
        tenant_id: tenantId, 
        related_to: 'contact', 
        related_id: contactId 
      });
      for (const note of notes) {
        await Note.delete(note.id);
        affected.notes.push(note.id);
      }
      
      // Nullify contact_id in opportunities
      const opportunities = await Opportunity.filter({ tenant_id: tenantId, contact_id: contactId });
      for (const opp of opportunities) {
        await Opportunity.update(opp.id, { contact_id: null });
        affected.opportunities.push(opp.id);
      }
      
      return {
        success: true,
        affected: affected
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        affected: affected
      };
    }
  }
}

// Export singleton instance
export const referentialIntegrity = new ReferentialIntegrityManager();