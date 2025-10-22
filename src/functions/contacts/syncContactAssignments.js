/**
 * syncContactAssignments
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { tenant_id } = await req.json();
    
    // Get all users for this tenant
    const users = await base44.asServiceRole.entities.User.list();
    const userMap = new Map(users.map(u => [u.email, u.display_name || u.full_name]));
    
    // Get all contacts that need updating
    const contacts = tenant_id 
      ? await base44.asServiceRole.entities.Contact.filter({ tenant_id })
      : await base44.asServiceRole.entities.Contact.list();
    
    let updated = 0;
    let errors = 0;
    
    for (const contact of contacts) {
      if (contact.assigned_to && !contact.assigned_to_name) {
        try {
          const name = userMap.get(contact.assigned_to);
          if (name) {
            await base44.asServiceRole.entities.Contact.update(contact.id, {
              assigned_to_name: name
            });
            updated++;
          }
        } catch (error) {
          console.error(`Failed to update contact ${contact.id}:`, error);
          errors++;
        }
      }
    }
    
    return Response.json({
      success: true,
      updated,
      errors,
      total: contacts.length
    });
    
  } catch (error) {
    console.error('Sync failed:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});

----------------------------

export default syncContactAssignments;
