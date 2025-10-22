/**
 * backfillUniqueIds
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entity_type, tenant_id } = await req.json();

    if (!entity_type) {
      return Response.json({ error: 'entity_type is required' }, { status: 400 });
    }

    const validEntities = ['Lead', 'Contact', 'Account'];
    if (!validEntities.includes(entity_type)) {
      return Response.json({ 
        error: `Invalid entity_type. Must be one of: ${validEntities.join(', ')}` 
      }, { status: 400 });
    }

    const targetTenantId = tenant_id || user.tenant_id;
    
    if (!targetTenantId) {
      return Response.json({ error: 'tenant_id is required' }, { status: 400 });
    }

    // Get all records without unique_id
    const allRecords = await base44.asServiceRole.entities[entity_type].filter({
      tenant_id: targetTenantId
    });

    const recordsWithoutId = allRecords.filter(r => !r.unique_id);

    console.log(`Found ${recordsWithoutId.length} ${entity_type} records without unique_id`);

    if (recordsWithoutId.length === 0) {
      return Response.json({
        success: true,
        message: `All ${entity_type} records already have unique_ids`,
        updated: 0
      });
    }

    const prefixes = {
      Lead: 'LEAD',
      Contact: 'CONT',
      Account: 'ACCT'
    };

    const prefix = prefixes[entity_type];

    // Get existing unique_ids to find the highest number
    const existingIds = allRecords
      .filter(r => r.unique_id && r.unique_id.startsWith(`${prefix}-`))
      .map(r => {
        const parts = r.unique_id.split('-');
        if (parts.length >= 2) {
          const num = parseInt(parts[parts.length - 1]);
          return isNaN(num) ? 0 : num;
        }
        return 0;
      });

    let nextNumber = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

    // Update records in batches
    let updated = 0;
    const BATCH_SIZE = 50;

    for (let i = 0; i < recordsWithoutId.length; i += BATCH_SIZE) {
      const batch = recordsWithoutId.slice(i, i + BATCH_SIZE);
      
      for (const record of batch) {
        const unique_id = `${prefix}-${String(nextNumber).padStart(6, '0')}`;
        
        try {
          await base44.asServiceRole.entities[entity_type].update(record.id, { unique_id });
          updated++;
          nextNumber++;
          
          if (updated % 10 === 0) {
            console.log(`Updated ${updated}/${recordsWithoutId.length} records...`);
          }
        } catch (error) {
          console.error(`Failed to update ${entity_type} ${record.id}:`, error);
        }
      }
    }

    return Response.json({
      success: true,
      message: `Successfully backfilled unique_ids for ${updated} ${entity_type} records`,
      updated,
      next_id: `${prefix}-${String(nextNumber).padStart(6, '0')}`
    });

  } catch (error) {
    console.error('Error backfilling unique_ids:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});

----------------------------

export default backfillUniqueIds;
