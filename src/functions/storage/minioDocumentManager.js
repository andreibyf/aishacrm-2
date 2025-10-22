/**
 * minioDocumentManager
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';

// Initialize Minio S3 Client
const s3Client = new S3Client({
  endpoint: Deno.env.get('MINIO_ENDPOINT'), // e.g., 'http://your-minio-server:9000'
  region: 'us-east-1', // Minio doesn't care about region, but S3 SDK requires it
  credentials: {
    accessKeyId: Deno.env.get('MINIO_ACCESS_KEY'),
    secretAccessKey: Deno.env.get('MINIO_SECRET_KEY'),
  },
  forcePathStyle: true, // Required for Minio
});

// Helper to ensure tenant bucket exists
async function ensureTenantBucket(tenantId) {
  const bucketName = `tenant-${tenantId}`;
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
    console.log(`Created bucket: ${bucketName}`);
  } catch (error) {
    if (error.name === 'BucketAlreadyExists' || error.name === 'BucketAlreadyOwnedByYou') {
      console.log(`Bucket already exists: ${bucketName}`);
    } else {
      throw error;
    }
  }
  return bucketName;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  if (!(await base44.auth.isAuthenticated())) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const user = await base44.auth.me();
  if (!user.tenant_id) {
    return new Response(JSON.stringify({ error: 'No tenant assigned' }), { status: 400 });
  }

  const { action, fileName, fileData, documentId } = await req.json();

  try {
    const bucketName = await ensureTenantBucket(user.tenant_id);

    switch (action) {
      case 'upload':
        // Upload file to tenant's specific bucket
        const uploadKey = `documents/${documentId}/${fileName}`;
        
        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: uploadKey,
          Body: new Uint8Array(fileData),
          ContentType: 'application/octet-stream',
        }));

        const fileUrl = `${Deno.env.get('MINIO_ENDPOINT')}/${bucketName}/${uploadKey}`;
        
        return new Response(JSON.stringify({
          success: true,
          file_url: fileUrl,
          bucket: bucketName,
          key: uploadKey
        }));

      case 'get_signed_url':
        // Generate pre-signed URL for secure file access
        const getCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: `documents/${documentId}/${fileName}`,
        });
        
        const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 }); // 1 hour
        
        return new Response(JSON.stringify({
          success: true,
          signed_url: signedUrl
        }));

      case 'delete':
        // Delete file from tenant's bucket
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key: `documents/${documentId}/${fileName}`,
        }));
        
        return new Response(JSON.stringify({
          success: true,
          message: 'File deleted successfully'
        }));

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

  } catch (error) {
    console.error('Minio operation failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500 });
  }
});

----------------------------

export default minioDocumentManager;
