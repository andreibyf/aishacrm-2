/**
 * r2DocumentManager
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3.583.0';

// Initialize the S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://\${Deno.env.get("CLOUDFLARE_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID"),
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY"),
  },
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { action, file_uri, file_name, file_content_base64, tenant_id } = await req.json();

    const bucketName = `tenant-\${tenant_id || user.tenant_id}`;

    if (action === 'upload') {
      if (!file_name || !file_content_base64 || !tenant_id) {
        return new Response(JSON.stringify({ error: 'Missing parameters for upload' }), { status: 400 });
      }

      const key = `uploads/\${Date.now()}-\${file_name}`;
      const decodedBody = new Uint8Array(atob(file_content_base64).split('').map(c => c.charCodeAt(0)));

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: decodedBody,
      });

      await s3Client.send(command);
      
      const newFileUri = `r2://\${bucketName}/\${key}`;

      return new Response(JSON.stringify({ message: 'File uploaded successfully', file_uri: newFileUri }), { status: 200 });

    } else if (action === 'delete') {
      if (!file_uri) {
        return new Response(JSON.stringify({ error: 'Missing file_uri for delete' }), { status: 400 });
      }

      // Extract bucket and key from URI
      const uriParts = file_uri.replace('r2://', '').split('/');
      const bucketFromUri = uriParts[0];
      const key = uriParts.slice(1).join('/');

      // Security check: ensure the user belongs to the tenant whose bucket is targeted
      if (bucketFromUri !== `tenant-\${user.tenant_id}` && user.role !== 'superadmin' && user.role !== 'admin') {
         return new Response(JSON.stringify({ error: 'Permission denied for this resource' }), { status: 403 });
      }

      const command = new DeleteObjectCommand({
        Bucket: bucketFromUri,
        Key: key,
      });

      await s3Client.send(command);
      return new Response(JSON.stringify({ message: 'File deleted successfully' }), { status: 200 });

    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

  } catch (error) {
    console.error('r2DocumentManager Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

----------------------------

export default r2DocumentManager;
