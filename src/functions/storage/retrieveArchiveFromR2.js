/**
 * retrieveArchiveFromR2
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.583.0';

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
 * Retrieves archived BizDev Sources from Cloudflare R2
 * - Downloads archive file from R2
 * - Parses JSON or CSV content
 * - Rehydrates records back into BizDevSource entity
 * - Sets Status = Active and preserves original BatchID/Source
 * - Enforces multi-tenant security
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { archive_index_id, reactivate_mode = 'all' } = await req.json();
    
    if (!archive_index_id) {
      return Response.json({ 
        error: 'archive_index_id is required' 
      }, { status: 400 });
    }
    
    // Get the ArchiveIndex record
    const archiveIndex = await base44.entities.ArchiveIndex.get(archive_index_id);
    
    if (!archiveIndex) {
      return Response.json({ 
        error: 'Archive index not found' 
      }, { status: 404 });
    }
    
    // MULTI-TENANT SECURITY: Verify user has access to this tenant's archives
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    if (!isAdmin && archiveIndex.tenant_id !== user.tenant_id) {
      return Response.json({ 
        error: 'Permission denied: Cannot access archives from different tenant' 
      }, { status: 403 });
    }
    
    // Check if archive is accessible
    if (!archiveIndex.is_accessible) {
      return Response.json({ 
        error: 'Archive file is marked as inaccessible' 
      }, { status: 400 });
    }
    
    // Extract bucket and key from archive path
    const bucketName = `tenant-${archiveIndex.tenant_id}`;
    const archivePath = archiveIndex.archive_path;
    
    console.log(`Retrieving archive from R2: ${bucketName}/${archivePath}`);
    
    // Download file from R2
    let fileContent;
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: archivePath,
      });
      
      const response = await r2Client.send(command);
      
      // Read the stream (Deno-compatible)
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      
      // Concatenate Uint8Arrays
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const concatenated = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        concatenated.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Decode to string
      const decoder = new TextDecoder();
      fileContent = decoder.decode(concatenated);
      
    } catch (r2Error) {
      console.error('R2 download error:', r2Error);
      
      // Update ArchiveIndex to mark as inaccessible
      await base44.entities.ArchiveIndex.update(archive_index_id, {
        is_accessible: false
      });
      
      return Response.json({ 
        error: 'Failed to download archive from R2',
        details: r2Error.message 
      }, { status: 500 });
    }
    
    // Parse content based on format
    let records = [];
    
    if (archiveIndex.file_format === 'csv') {
      // Parse CSV
      const lines = fileContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return Response.json({ 
          error: 'Invalid CSV format: no data rows' 
        }, { status: 400 });
      }
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const record = {};
        headers.forEach((header, index) => {
          record[header] = values[index] || null;
        });
        records.push(record);
      }
      
    } else {
      // Parse JSON
      try {
        const parsed = JSON.parse(fileContent);
        records = parsed.records || [];
      } catch (parseError) {
        return Response.json({ 
          error: 'Failed to parse JSON archive',
          details: parseError.message 
        }, { status: 400 });
      }
    }
    
    if (records.length === 0) {
      return Response.json({ 
        error: 'No records found in archive' 
      }, { status: 400 });
    }
    
    console.log(`Parsed ${records.length} records from archive`);
    
    // Check for existing records to avoid duplicates
    const existingFilter = {
      tenant_id: archiveIndex.tenant_id,
      batch_id: archiveIndex.batch_id
    };
    
    const existingSources = await base44.entities.BizDevSource.filter(existingFilter);
    const existingIds = new Set(existingSources.map(s => s.id));
    
    // Prepare records for rehydration
    const rehydratedRecords = [];
    const skippedRecords = [];
    
    for (const record of records) {
      // Check if this record already exists (by ID)
      if (record.id && existingIds.has(record.id)) {
        if (reactivate_mode === 'all') {
          // Update existing record to reactivate it
          try {
            await base44.entities.BizDevSource.update(record.id, {
              status: 'Active',
              archived_at: null
            });
            rehydratedRecords.push({ id: record.id, mode: 'reactivated' });
          } catch (updateError) {
            console.warn(`Failed to reactivate record ${record.id}:`, updateError.message);
            skippedRecords.push({ id: record.id, reason: 'update_failed' });
          }
        } else {
          skippedRecords.push({ id: record.id, reason: 'already_exists' });
        }
        continue;
      }
      
      // Create new record (without the old ID to avoid conflicts)
      const newRecord = {
        tenant_id: archiveIndex.tenant_id,
        source: record.source,
        batch_id: record.batch_id,
        company_name: record.company_name,
        dba_name: record.dba_name,
        industry: record.industry,
        website: record.website,
        email: record.email,
        phone_number: record.phone_number,
        address_line_1: record.address_line_1,
        address_line_2: record.address_line_2,
        city: record.city,
        state_province: record.state_province,
        postal_code: record.postal_code,
        country: record.country,
        note: record.note,
        industry_license: record.industry_license,
        license_status: record.license_status,
        license_expiry_date: record.license_expiry_date,
        status: 'Active', // Rehydrate as Active
        archived_at: null
      };
      
      try {
        const created = await base44.entities.BizDevSource.create(newRecord);
        rehydratedRecords.push({ id: created.id, mode: 'created' });
      } catch (createError) {
        console.warn(`Failed to create record for ${record.company_name}:`, createError.message);
        skippedRecords.push({ 
          company_name: record.company_name, 
          reason: 'create_failed',
          error: createError.message 
        });
      }
    }
    
    console.log(`Rehydrated ${rehydratedRecords.length} records, skipped ${skippedRecords.length}`);
    
    return Response.json({
      success: true,
      archive_id: archive_index_id,
      batch_id: archiveIndex.batch_id,
      source_description: archiveIndex.source_description,
      total_records: records.length,
      rehydrated_count: rehydratedRecords.length,
      skipped_count: skippedRecords.length,
      rehydrated_records: rehydratedRecords,
      skipped_records: skippedRecords,
      message: `Successfully rehydrated ${rehydratedRecords.length} BizDev Sources from archive`
    });
    
  } catch (error) {
    console.error('Archive retrieval error:', error);
    return Response.json({ 
      error: error.message || 'Failed to retrieve archive'
    }, { status: 500 });
  }
});

----------------------------

export default retrieveArchiveFromR2;
