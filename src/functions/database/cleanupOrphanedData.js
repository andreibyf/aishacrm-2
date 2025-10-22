/**
 * cleanupOrphanedData
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

async function cleanupEntity(base44Client, entityName, summary) {
  let deletedCount = 0;
  try {
    // Use regular entities API since user is already admin
    const entity = base44Client.entities[entityName];
    if (!entity) {
      console.warn(`Entity ${entityName} not available`);
      summary[entityName] = "Entity not found";
      return 0;
    }

    const allRecords = await entity.filter({});
    const orphanedRecords = allRecords.filter(record => !record.tenant_id);

    if (orphanedRecords.length > 0) {
      for (const record of orphanedRecords) {
        await entity.delete(record.id);
        deletedCount++;
      }
    }
    summary[entityName] = deletedCount;
  } catch (e) {
    console.error(`Error cleaning up ${entityName}:`, e);
    summary[entityName] = `Error: ${e.message.slice(0, 100)}`;
  }
  return deletedCount;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  // Ensure the user is an admin
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized: Admin role required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const summary = {};
  let totalDeleted = 0;

  try {
    totalDeleted += await cleanupEntity(base44, 'Contact', summary);
    totalDeleted += await cleanupEntity(base44, 'Account', summary);
    totalDeleted += await cleanupEntity(base44, 'Lead', summary);
    totalDeleted += await cleanupEntity(base44, 'Opportunity', summary);
    totalDeleted += await cleanupEntity(base44, 'Activity', summary);
    totalDeleted += await cleanupEntity(base44, 'Note', summary);
    totalDeleted += await cleanupEntity(base44, 'Employee', summary);

    return new Response(JSON.stringify({
      status: 'success',
      message: `Cleanup complete. Removed ${totalDeleted} orphaned record(s).`,
      summary: summary
    }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Fatal error during cleanup:', error);
    return new Response(JSON.stringify({
      status: 'error',
      message: 'A fatal error occurred during cleanup.',
      details: error.message
    }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
    });
  }
});

----------------------------

export default cleanupOrphanedData;
