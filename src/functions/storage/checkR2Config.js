/**
 * checkR2Config
 * Server-side function for your backend
 */

// Let me check what R2 config values might be referenced
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

        // Check what R2 environment variables are currently set
        const r2Config = {
            CLOUDFLARE_ACCOUNT_ID: Deno.env.get('CLOUDFLARE_ACCOUNT_ID') ? 'SET' : 'MISSING',
            R2_ACCESS_KEY_ID: Deno.env.get('R2_ACCESS_KEY_ID') ? 'SET' : 'MISSING', 
            R2_SECRET_ACCESS_KEY: Deno.env.get('R2_SECRET_ACCESS_KEY') ? 'SET' : 'MISSING',
            // Check if there are alternative environment variable names
            CLOUDFLARE_ACCOUNT_ID_alt: Deno.env.get('CF_ACCOUNT_ID') ? 'SET' : 'MISSING',
            R2_ACCESS_KEY_alt: Deno.env.get('R2_ACCESS_KEY') ? 'SET' : 'MISSING'
        };

        // Also check what's in the existing functions that use R2
        const existingR2Functions = [
            'createTenantWithR2Bucket',
            'r2DocumentManager', 
            'diagnoseR2Upload'
        ];

        return new Response(JSON.stringify({
            success: true,
            current_env_status: r2Config,
            message: 'Check your Base44 dashboard Environment Variables section to set missing values',
            r2_functions_using_config: existingR2Functions
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default checkR2Config;
