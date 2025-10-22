/**
 * bulkDeleteBizDevSources
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ 
        status: 'error', 
        message: 'Unauthorized' 
      }, { status: 401 });
    }

    const { bizdev_source_ids } = await req.json().catch(() => ({ bizdev_source_ids: [] }));
    
    if (!Array.isArray(bizdev_source_ids) || bizdev_source_ids.length === 0) {
      return Response.json({ 
        status: 'error', 
        message: 'No bizdev_source_ids provided or invalid format' 
      }, { status: 400 });
    }

    console.log(`🗑️ Bulk delete requested for ${bizdev_source_ids.length} BizDev Sources by ${user.email}`);

    // Get tenant_id for security validation
    const tenantId = user.role === 'superadmin' && user.selected_tenant_id 
      ? user.selected_tenant_id 
      : user.tenant_id;

    if (!tenantId) {
      return Response.json({ 
        status: 'error', 
        message: 'No tenant_id found' 
      }, { status: 400 });
    }

    const results = {
      total: bizdev_source_ids.length,
      deleted: 0,
      failed: 0,
      errors: []
    };

    // Process deletions with controlled parallelism to avoid timeouts
    const CONCURRENCY_LIMIT = 5; // Process 5 deletions at a time
    
    const deleteWithRetry = async (sourceId, retries = 2) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // First verify the source belongs to the user's tenant (security check)
          const source = await base44.entities.BizDevSource.get(sourceId);
          
          if (!source) {
            return { id: sourceId, success: false, error: 'Source not found' };
          }
          
          // Multi-tenant security check
          if (source.tenant_id !== tenantId && user.role !== 'superadmin') {
            return { id: sourceId, success: false, error: 'Permission denied: Source belongs to different tenant' };
          }
          
          // Delete the source
          await base44.entities.BizDevSource.delete(sourceId);
          return { id: sourceId, success: true };
          
        } catch (error) {
          if (attempt === retries) {
            console.error(`❌ Failed to delete BizDev Source ${sourceId} after ${retries + 1} attempts:`, error.message);
            return { id: sourceId, success: false, error: error.message };
          }
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
    };

    // Process sources in batches with concurrency control
    const processBatch = async (batch) => {
      const batchResults = await Promise.all(
        batch.map(sourceId => deleteWithRetry(sourceId))
      );
      return batchResults;
    };

    // Split into chunks for parallel processing
    const chunks = [];
    for (let i = 0; i < bizdev_source_ids.length; i += CONCURRENCY_LIMIT) {
      chunks.push(bizdev_source_ids.slice(i, i + CONCURRENCY_LIMIT));
    }

    // Process all chunks
    for (const chunk of chunks) {
      const chunkResults = await processBatch(chunk);
      
      for (const result of chunkResults) {
        if (result.success) {
          results.deleted++;
          console.log(`✅ Deleted BizDev Source ${result.id}`);
        } else {
          results.failed++;
          results.errors.push({ id: result.id, error: result.error });
        }
      }
    }

    const message = results.failed === 0 
      ? `Successfully deleted ${results.deleted} BizDev Source(s)`
      : `Deleted ${results.deleted} BizDev Source(s), failed to delete ${results.failed} BizDev Source(s)`;

    console.log(`📊 Bulk delete complete: ${message}`);

    return Response.json({
      status: results.failed === 0 ? 'success' : 'partial',
      message,
      results
    }, { status: 200 });

  } catch (error) {
    console.error('❌ Bulk delete error:', error);
    return Response.json({ 
      status: 'error', 
      message: error.message || 'An unexpected error occurred',
      stack: error.stack
    }, { status: 500 });
  }
});

----------------------------

export default bulkDeleteBizDevSources;
