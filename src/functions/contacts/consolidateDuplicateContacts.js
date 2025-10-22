/**
 * consolidateDuplicateContacts
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { contact_ids, primary_contact_id, tenant_id } = await req.json();

    if (!contact_ids || !Array.isArray(contact_ids) || contact_ids.length < 2) {
      return new Response(JSON.stringify({ error: "Need at least 2 contacts to merge" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!primary_contact_id || !tenant_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    console.log(`🔄 Merging ${contact_ids.length} contacts into ${primary_contact_id}`);

    // Load all contacts
    const contacts = await Promise.all(
      contact_ids.map(id => base44.entities.Contact.get(id))
    );

    const primaryContact = contacts.find(c => c.id === primary_contact_id);
    if (!primaryContact) {
      return new Response(JSON.stringify({ error: "Primary contact not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Merge data: collect all non-null values from duplicates
    const mergedData = { ...primaryContact };
    
    for (const contact of contacts) {
      if (contact.id === primary_contact_id) continue;
      
      // Merge fields (keep primary's data if it exists, otherwise use duplicate's)
      for (const key of Object.keys(contact)) {
        if (!mergedData[key] && contact[key]) {
          mergedData[key] = contact[key];
        }
      }
      
      // Merge tags
      if (contact.tags && Array.isArray(contact.tags)) {
        mergedData.tags = [...new Set([...(mergedData.tags || []), ...contact.tags])];
      }
    }

    // Update primary contact with merged data
    await base44.entities.Contact.update(primary_contact_id, mergedData);

    // Delete duplicate contacts
    const duplicateIds = contact_ids.filter(id => id !== primary_contact_id);
    for (const id of duplicateIds) {
      await base44.entities.Contact.delete(id);
    }

    console.log(`✅ Successfully merged ${contact_ids.length} contacts`);

    // Create audit log
    try {
      await base44.functions.invoke('createAuditLog', {
        action_type: 'update',
        entity_type: 'Contact',
        entity_id: primary_contact_id,
        description: `Merged ${contact_ids.length} duplicate contacts into one`,
        old_values: { contact_ids: contact_ids },
        new_values: { primary_contact_id: primary_contact_id, merged_count: contact_ids.length }
      });
    } catch (auditError) {
      console.warn('Failed to create audit log:', auditError);
    }

    return new Response(JSON.stringify({
      success: true,
      primary_contact_id: primary_contact_id,
      merged_count: contact_ids.length - 1,
      deleted_ids: duplicateIds
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("consolidateDuplicateContacts error:", error);
    return new Response(JSON.stringify({
      error: error.message || "Failed to consolidate contacts"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

----------------------------

export default consolidateDuplicateContacts;
