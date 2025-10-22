/**
 * diagnoseR2Upload
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
                status: 403, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const diagnostics = {
            timestamp: new Date().toISOString(),
            environment_check: {},
            r2_config: {},
            test_results: {}
        };

        // Check environment variables
        const requiredEnvVars = [
            'CLOUDFLARE_ACCOUNT_ID',
            'R2_ACCESS_KEY_ID', 
            'R2_SECRET_ACCESS_KEY'
        ];

        for (const envVar of requiredEnvVars) {
            const value = Deno.env.get(envVar);
            diagnostics.environment_check[envVar] = {
                present: !!value,
                length: value ? value.length : 0,
                first_chars: value ? value.substring(0, 4) + '...' : 'NOT_SET'
            };
        }

        // Test R2 configuration
        try {
            const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
            const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
            const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');

            if (!accountId || !accessKeyId || !secretAccessKey) {
                diagnostics.r2_config.status = 'MISSING_CREDENTIALS';
                diagnostics.r2_config.message = 'One or more R2 environment variables are missing';
            } else {
                diagnostics.r2_config.status = 'CREDENTIALS_PRESENT';
                diagnostics.r2_config.endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
            }

            // Test a simple upload to R2
            if (accountId && accessKeyId && secretAccessKey) {
                const testContent = new TextEncoder().encode('R2 test file');
                const testFileName = `test-${Date.now()}.txt`;
                
                const response = await fetch(`https://${accountId}.r2.cloudflarestorage.com/ai-sha-crm-docs/${testFileName}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': await generateR2Authorization('PUT', `ai-sha-crm-docs/${testFileName}`, accessKeyId, secretAccessKey),
                        'Content-Type': 'text/plain',
                        'Content-Length': testContent.length.toString()
                    },
                    body: testContent
                });

                diagnostics.test_results.upload_test = {
                    status: response.status,
                    ok: response.ok,
                    statusText: response.statusText
                };

                if (response.ok) {
                    // Clean up test file
                    try {
                        await fetch(`https://${accountId}.r2.cloudflarestorage.com/ai-sha-crm-docs/${testFileName}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': await generateR2Authorization('DELETE', `ai-sha-crm-docs/${testFileName}`, accessKeyId, secretAccessKey)
                            }
                        });
                    } catch (deleteError) {
                        console.warn('Failed to clean up test file:', deleteError);
                    }
                }
            }

        } catch (r2Error) {
            diagnostics.r2_config.error = r2Error.message;
        }

        // Test UploadPrivateFile integration
        try {
            // Create a simple test file
            const testFile = new File(['Test upload content'], 'test-upload.txt', { type: 'text/plain' });
            const formData = new FormData();
            formData.append('file', testFile);

            const { data: uploadResult, status } = await base44.integrations.Core.UploadPrivateFile({
                file: testFile
            });

            diagnostics.test_results.integration_test = {
                status: status,
                success: status < 400,
                result: uploadResult
            };

        } catch (integrationError) {
            diagnostics.test_results.integration_test = {
                error: integrationError.message,
                success: false
            };
        }

        // Recommendations
        const recommendations = [];
        
        if (!diagnostics.environment_check.CLOUDFLARE_ACCOUNT_ID.present) {
            recommendations.push('Set CLOUDFLARE_ACCOUNT_ID environment variable');
        }
        if (!diagnostics.environment_check.R2_ACCESS_KEY_ID.present) {
            recommendations.push('Set R2_ACCESS_KEY_ID environment variable');
        }
        if (!diagnostics.environment_check.R2_SECRET_ACCESS_KEY.present) {
            recommendations.push('Set R2_SECRET_ACCESS_KEY environment variable');
        }

        if (diagnostics.test_results.upload_test && !diagnostics.test_results.upload_test.ok) {
            recommendations.push('R2 bucket permissions may be incorrect');
            recommendations.push('Verify bucket name "ai-sha-crm-docs" exists and is accessible');
        }

        diagnostics.recommendations = recommendations;

        return new Response(JSON.stringify({
            success: true,
            diagnostics: diagnostics
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('R2 diagnostics error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

// Helper function to generate R2 authorization
async function generateR2Authorization(method, path, accessKeyId, secretAccessKey) {
    const encoder = new TextEncoder();
    const date = new Date().toUTCString();
    const stringToSign = `${method}\n\n\n${date}\n/${path}`;
    
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secretAccessKey),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign));
    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    
    return `AWS ${accessKeyId}:${signatureBase64}`;
}

----------------------------

export default diagnoseR2Upload;
