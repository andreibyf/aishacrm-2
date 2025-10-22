/**
 * createTenantWithBucket
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';
import { S3Client, CreateBucketCommand } from 'npm:@aws-sdk/client-s3';

// Initialize Minio S3 Client from environment variables
const s3Client = new S3Client({
  endpoint: Deno.env.get('MINIO_ENDPOINT'),
  region: 'us-east-1',
  credentials: {
    accessKeyId: Deno.env.get('MINIO_ACCESS_KEY'),
    secretAccessKey: Deno.env.get('MINIO_SECRET_KEY'),
  },
  forcePathStyle: true,
});

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // Ensure the user is an admin
    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    const user = await base44.auth.me();
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    // Get tenant details from the request body
    const { name, domain, industry, business_model, geographic_focus } = await req.json();

    if (!name || !industry) {
        return new Response(JSON.stringify({ error: 'Tenant name and industry are required' }), { status: 400 });
    }

    try {
        // Step 1: Create the Tenant record in the database
        const newTenant = await base44.asServiceRole.entities.Tenant.create({
            name,
            domain,
            industry,
            business_model,
            geographic_focus,
        });

        const tenantId = newTenant.id;
        console.log(`Successfully created tenant record with ID: ${tenantId}`);

        // Step 2: Create the corresponding S3 bucket
        const bucketName = `tenant-${tenantId}`;
        await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
        console.log(`Successfully created S3 bucket: ${bucketName}`);

        // Step 3: Return the successful result
        return new Response(JSON.stringify({
            status: 'success',
            message: `Tenant "${name}" and S3 bucket "${bucketName}" created successfully.`,
            tenant: newTenant,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    } catch (error) {
        console.error('Tenant provisioning failed:', error);
        // Note: In a production system, you might want to add logic here to delete the tenant record
        // if the bucket creation fails, to avoid orphaned records.
        return new Response(JSON.stringify({
            status: 'error',
            message: `Tenant provisioning failed: ${error.message}`
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

----------------------------

export default createTenantWithBucket;
