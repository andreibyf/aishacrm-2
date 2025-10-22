/**
 * handleCascadeDelete
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * Cascade delete handler
 * Manages related records when parent entity is deleted
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entityType, entityId, tenantId, strategy = 'nullify' } = await req.json();

    if (!entityType || !entityId) {
      return Response.json({ 
        error: 'Missing required parameters: entityType, entityId' 
      }, { status: 400 });
    }

    const tenant = tenantId || user.tenant_id;
    if (!tenant) {
      return Response.json({ 
        error: 'No tenant context available' 
      }, { status: 400 });
    }

    // Only admins can perform cascade deletes
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const affected = {
      contacts: [],
      leads: [],
      opportunities: [],
      activities: [],
      notes: []
    };

    // Handle based on entity type
    switch (entityType) {
      case 'Account': {
        // Find and handle related contacts
        const contacts = await base44.entities.Contact.filter({ 
          tenant_id: tenant, 
          account_id: entityId 
        });
        for (const contact of contacts) {
          if (strategy === 'nullify') {
            await base44.entities.Contact.update(contact.id, { 
              account_id: null, 
              account_name: null 
            });
            affected.contacts.push(contact.id);
          } else if (strategy === 'delete') {
            await base44.entities.Contact.delete(contact.id);
            affected.contacts.push(contact.id);
          }
        }

        // Find and handle related leads
        const leads = await base44.entities.Lead.filter({ 
          tenant_id: tenant, 
          account_id: entityId 
        });
        for (const lead of leads) {
          if (strategy === 'nullify') {
            await base44.entities.Lead.update(lead.id, { 
              account_id: null, 
              company: null 
            });
            affected.leads.push(lead.id);
          } else if (strategy === 'delete') {
            await base44.entities.Lead.delete(lead.id);
            affected.leads.push(lead.id);
          }
        }

        // Find and handle related opportunities
        const opportunities = await base44.entities.Opportunity.filter({ 
          tenant_id: tenant, 
          account_id: entityId 
        });
        for (const opp of opportunities) {
          if (strategy === 'nullify') {
            await base44.entities.Opportunity.update(opp.id, { account_id: null });
            affected.opportunities.push(opp.id);
          } else if (strategy === 'delete') {
            await base44.entities.Opportunity.delete(opp.id);
            affected.opportunities.push(opp.id);
          }
        }

        // Delete related notes
        const accountNotes = await base44.entities.Note.filter({ 
          tenant_id: tenant, 
          related_to: 'account', 
          related_id: entityId 
        });
        for (const note of accountNotes) {
          await base44.entities.Note.delete(note.id);
          affected.notes.push(note.id);
        }
        break;
      }

      case 'Contact': {
        // Nullify contact_id in opportunities
        const contactOpportunities = await base44.entities.Opportunity.filter({ 
          tenant_id: tenant, 
          contact_id: entityId 
        });
        for (const opp of contactOpportunities) {
          await base44.entities.Opportunity.update(opp.id, { contact_id: null });
          affected.opportunities.push(opp.id);
        }

        // Soft delete related activities
        const contactActivities = await base44.entities.Activity.filter({ 
          tenant_id: tenant, 
          related_to: 'contact', 
          related_id: entityId 
        });
        for (const activity of contactActivities) {
          await base44.entities.Activity.update(activity.id, { 
            related_id: null, 
            related_to: null 
          });
          affected.activities.push(activity.id);
        }

        // Delete related notes
        const contactNotes = await base44.entities.Note.filter({ 
          tenant_id: tenant, 
          related_to: 'contact', 
          related_id: entityId 
        });
        for (const note of contactNotes) {
          await base44.entities.Note.delete(note.id);
          affected.notes.push(note.id);
        }
        break;
      }

      case 'Lead': {
        // Soft delete related activities
        const leadActivities = await base44.entities.Activity.filter({ 
          tenant_id: tenant, 
          related_to: 'lead', 
          related_id: entityId 
        });
        for (const activity of leadActivities) {
          await base44.entities.Activity.update(activity.id, { 
            related_id: null, 
            related_to: null 
          });
          affected.activities.push(activity.id);
        }

        // Delete related notes
        const leadNotes = await base44.entities.Note.filter({ 
          tenant_id: tenant, 
          related_to: 'lead', 
          related_id: entityId 
        });
        for (const note of leadNotes) {
          await base44.entities.Note.delete(note.id);
          affected.notes.push(note.id);
        }
        break;
      }

      case 'Opportunity': {
        // Soft delete related activities
        const oppActivities = await base44.entities.Activity.filter({ 
          tenant_id: tenant, 
          related_to: 'opportunity', 
          related_id: entityId 
        });
        for (const activity of oppActivities) {
          await base44.entities.Activity.update(activity.id, { 
            related_id: null, 
            related_to: null 
          });
          affected.activities.push(activity.id);
        }

        // Delete related notes
        const oppNotes = await base44.entities.Note.filter({ 
          tenant_id: tenant, 
          related_to: 'opportunity', 
          related_id: entityId 
        });
        for (const note of oppNotes) {
          await base44.entities.Note.delete(note.id);
          affected.notes.push(note.id);
        }
        break;
      }

      default:
        return Response.json({ 
          error: `Unsupported entity type for cascade delete: ${entityType}` 
        }, { status: 400 });
    }

    return Response.json({
      success: true,
      strategy: strategy,
      affected: affected,
      totalAffected: 
        affected.contacts.length + 
        affected.leads.length + 
        affected.opportunities.length + 
        affected.activities.length + 
        affected.notes.length
    });

  } catch (error) {
    console.error("Cascade delete error:", error);
    return Response.json({ 
      error: error.message || 'Cascade delete failed',
      success: false
    }, { status: 500 });
  }
});

----------------------------

export default handleCascadeDelete;
