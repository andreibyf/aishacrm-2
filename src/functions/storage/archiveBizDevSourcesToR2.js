/**
 * archiveBizDevSourcesToR2
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.583.0';

// Initialize R2 S3-compatible client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${Deno.env.get("CLOUDFLARE_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID"),
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY"),
  },
});

/**
 * Compresses data using gzip
 */
async function compressData(data) {
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(data);
  
  // Use CompressionStream API (available in Deno)
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(uint8Array);
      controller.close();
    }
  }).pipeThrough(new CompressionStream('gzip'));
  
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  // Concatenate chunks
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const compressed = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.length;
  }
  
  return compressed;
}

/**
 * Archives BizDev Sources to Cloudflare R2
 * - Serializes records to JSON or CSV
 * - Optionally compresses with gzip
 * - Uploads to R2 with organized path structure
 * - Creates ArchiveIndex records for tracking
 * - Updates records to Archived status
 * - Optionally soft-deletes records from active database
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { 
      bizdev_source_ids, 
      format = 'json',
      compress = true,
      remove_after_archive = false 
    } = await req.json();
    
    if (!bizdev_source_ids || !Array.isArray(bizdev_source_ids) || bizdev_source_ids.length === 0) {
      return Response.json({ 
        error: 'bizdev_source_ids array is required' 
      }, { status: 400 });
    }
    
    // Fetch all BizDev Sources to archive
    const sources = [];
    for (const id of bizdev_source_ids) {
      try {
        const source = await base44.entities.BizDevSource.get(id);
        if (source) {
          // Verify user has access to this tenant
          const isAdmin = user.role === 'admin' || user.role === 'superadmin';
          if (!isAdmin && source.tenant_id !== user.tenant_id) {
            console.warn(`User ${user.email} attempted to archive source ${id} from different tenant`);
            continue;
          }
          sources.push(source);
        }
      } catch (error) {
        console.warn(`Failed to fetch BizDev Source ${id}:`, error.message);
      }
    }
    
    if (sources.length === 0) {
      return Response.json({ 
        error: 'No valid BizDev Sources found to archive' 
      }, { status: 404 });
    }
    
    // Group by tenant and batch
    const groupedSources = sources.reduce((acc, source) => {
      const key = `${source.tenant_id}_${source.batch_id || 'no-batch'}`;
      if (!acc[key]) {
        acc[key] = {
          tenant_id: source.tenant_id,
          batch_id: source.batch_id || 'no-batch',
          source_description: source.source || 'BizDev Sources',
          sources: []
        };
      }
      acc[key].sources.push(source);
      return acc;
    }, {});
    
    const uploadResults = [];
    const archiveIndexRecords = [];
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Upload each group to R2
    for (const [key, group] of Object.entries(groupedSources)) {
      try {
        // Serialize to JSON or CSV
        let fileContent;
        let contentType;
        let fileExtension;
        
        if (format === 'csv') {
          // CSV format
          const headers = [
            'id', 'company_name', 'dba_name', 'industry', 'website', 'email', 
            'phone_number', 'address_line_1', 'address_line_2', 'city', 
            'state_province', 'postal_code', 'country', 'industry_license',
            'license_status', 'license_expiry_date', 'note', 'source',
            'batch_id', 'status', 'created_date', 'archived_at'
          ];
          
          const rows = group.sources.map(s => 
            headers.map(h => {
              const val = s[h];
              if (val === null || val === undefined) return '';
              // Escape CSV values
              const str = String(val).replace(/"/g, '""');
              return str.includes(',') || str.includes('"') || str.includes('\n') 
                ? `"${str}"` 
                : str;
            }).join(',')
          );
          
          fileContent = [headers.join(','), ...rows].join('\n');
          contentType = 'text/csv';
          fileExtension = 'csv';
        } else {
          // JSON format (default)
          fileContent = JSON.stringify({
            archived_at: new Date().toISOString(),
            archived_by: user.email,
            tenant_id: group.tenant_id,
            batch_id: group.batch_id,
            record_count: group.sources.length,
            records: group.sources
          }, null, 2);
          contentType = 'application/json';
          fileExtension = 'json';
        }
        
        // Compress if requested
        let uploadBody;
        let finalContentType;
        let finalExtension;
        let uncompressedSize = new Blob([fileContent]).size;
        let compressedSize = uncompressedSize;
        
        if (compress) {
          uploadBody = await compressData(fileContent);
          finalContentType = 'application/gzip';
          finalExtension = `${fileExtension}.gz`;
          compressedSize = uploadBody.length;
          console.log(`Compression: ${uncompressedSize} -> ${compressedSize} (${((1 - compressedSize/uncompressedSize) * 100).toFixed(1)}% reduction)`);
        } else {
          uploadBody = fileContent;
          finalContentType = contentType;
          finalExtension = fileExtension;
        }
        
        // R2 path: {tenant-id}/archives/bizdev-sources/{batch-id}/{timestamp}.{ext}
        const filePath = `${group.tenant_id}/archives/bizdev-sources/${group.batch_id}/${timestamp}.${finalExtension}`;
        const bucketName = `tenant-${group.tenant_id}`;
        
        // Upload to R2
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: filePath,
          Body: uploadBody,
          ContentType: finalContentType,
          Metadata: {
            'archived-by': user.email,
            'record-count': String(group.sources.length),
            'batch-id': group.batch_id,
            'entity-type': 'BizDevSource',
            'original-format': format,
            'compressed': String(compress)
          }
        });
        
        await r2Client.send(command);
        
        uploadResults.push({
          tenant_id: group.tenant_id,
          batch_id: group.batch_id,
          file_path: filePath,
          record_count: group.sources.length,
          file_size: compressedSize,
          uncompressed_size: uncompressedSize,
          compression_ratio: compress ? ((1 - compressedSize/uncompressedSize) * 100).toFixed(1) + '%' : 'none',
          status: 'success'
        });
        
        // Create ArchiveIndex record
        archiveIndexRecords.push({
          tenant_id: group.tenant_id,
          entity_type: 'BizDevSource',
          batch_id: group.batch_id,
          archive_path: filePath,
          record_count: group.sources.length,
          file_size_bytes: compressedSize,
          file_format: format,
          archived_at: new Date().toISOString(),
          archived_by: user.email,
          source_description: group.source_description,
          metadata: {
            bucket: bucketName,
            content_type: finalContentType,
            compressed: compress,
            uncompressed_size: uncompressedSize,
            source_ids: group.sources.map(s => s.id)
          },
          is_accessible: true
        });
        
        console.log(`Archived ${group.sources.length} BizDev Sources to R2: ${filePath}`);
        
      } catch (uploadError) {
        console.error(`Failed to upload group ${key}:`, uploadError);
        uploadResults.push({
          tenant_id: group.tenant_id,
          batch_id: group.batch_id,
          status: 'failed',
          error: uploadError.message
        });
      }
    }
    
    // Create all ArchiveIndex records
    try {
      if (archiveIndexRecords.length > 0) {
        await base44.entities.ArchiveIndex.bulkCreate(archiveIndexRecords);
        console.log(`Created ${archiveIndexRecords.length} ArchiveIndex records`);
      }
    } catch (indexError) {
      console.error('Failed to create ArchiveIndex records:', indexError);
      // Don't fail the entire operation if index creation fails
    }
    
    // Update all successfully archived records
    const archivedAt = new Date().toISOString();
    const updatePromises = [];
    
    for (const source of sources) {
      const wasUploaded = uploadResults.some(r => 
        r.tenant_id === source.tenant_id && 
        r.batch_id === (source.batch_id || 'no-batch') && 
        r.status === 'success'
      );
      
      if (wasUploaded) {
        if (remove_after_archive) {
          // Soft delete by marking as archived and clearing some fields to minimize data
          updatePromises.push(
            base44.entities.BizDevSource.update(source.id, {
              status: 'Archived',
              archived_at: archivedAt,
              // Clear large text fields to minimize storage
              note: `[Archived to R2 on ${archivedAt}]`,
              // Keep essential identifiers for reference
            })
          );
        } else {
          // Just update status
          updatePromises.push(
            base44.entities.BizDevSource.update(source.id, {
              status: 'Archived',
              archived_at: archivedAt
            })
          );
        }
      }
    }
    
    await Promise.all(updatePromises);
    
    const successCount = uploadResults.filter(r => r.status === 'success').length;
    const failureCount = uploadResults.filter(r => r.status === 'failed').length;
    
    return Response.json({
      success: true,
      archived_count: sources.length,
      upload_results: uploadResults,
      archive_index_count: archiveIndexRecords.length,
      summary: {
        total_groups: uploadResults.length,
        successful_uploads: successCount,
        failed_uploads: failureCount,
        records_updated: sources.length,
        compressed: compress,
        minimized: remove_after_archive
      }
    });
    
  } catch (error) {
    console.error('Archive to R2 error:', error);
    return Response.json({ 
      error: error.message || 'Failed to archive BizDev Sources'
    }, { status: 500 });
  }
});

----------------------------

export default archiveBizDevSourcesToR2;
