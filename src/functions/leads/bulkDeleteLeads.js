/**
 * bulkDeleteLeads
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

    const { leadIds } = await req.json().catch(() => ({ leadIds: [] }));
    
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return Response.json({ 
        status: 'error', 
        message: 'No leadIds provided or invalid format' 
      }, { status: 400 });
    }

    console.log(`🗑️ Bulk delete requested for ${leadIds.length} leads by ${user.email}`);

    const results = {
      total: leadIds.length,
      deleted: 0,
      failed: 0,
      errors: []
    };

    // Process deletions with controlled parallelism to avoid timeouts
    const CONCURRENCY_LIMIT = 5; // Process 5 deletions at a time
    
    const deleteWithRetry = async (leadId, retries = 2) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          await base44.entities.Lead.delete(leadId);
          return { id: leadId, success: true };
        } catch (error) {
          if (attempt === retries) {
            console.error(`❌ Failed to delete lead ${leadId} after ${retries + 1} attempts:`, error.message);
            return { id: leadId, success: false, error: error.message };
          }
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
    };

    // Process leads in batches with concurrency control
    const processBatch = async (batch) => {
      const batchResults = await Promise.all(
        batch.map(leadId => deleteWithRetry(leadId))
      );
      return batchResults;
    };

    // Split into chunks for parallel processing
    const chunks = [];
    for (let i = 0; i < leadIds.length; i += CONCURRENCY_LIMIT) {
      chunks.push(leadIds.slice(i, i + CONCURRENCY_LIMIT));
    }

    // Process all chunks
    for (const chunk of chunks) {
      const chunkResults = await processBatch(chunk);
      
      for (const result of chunkResults) {
        if (result.success) {
          results.deleted++;
          console.log(`✅ Deleted lead ${result.id}`);
        } else {
          results.failed++;
          results.errors.push({ id: result.id, error: result.error });
        }
      }
    }

    const message = results.failed === 0 
      ? `Successfully deleted ${results.deleted} lead(s)`
      : `Deleted ${results.deleted} lead(s), failed to delete ${results.failed} lead(s)`;

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

export default bulkDeleteLeads;
