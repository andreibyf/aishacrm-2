/**
 * createSysAdminDocs
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ 
                status: 'error',
                message: 'Unauthorized - User not authenticated' 
            }), { 
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const user = await base44.auth.me();
        if (user.role !== 'superadmin' && user.role !== 'admin') {
            return new Response(JSON.stringify({ 
                status: 'error',
                message: 'Forbidden: Admin access required' 
            }), { 
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log('=== Cleaning Up Orphaned Documentation Records ===');

        // Clean up any existing admin documentation records that don't have proper files
        try {
            const existingDocs = await base44.asServiceRole.entities.DocumentationFile.list();
            console.log(`Found ${existingDocs.length} existing documentation records`);
            
            // Find admin/system docs (those without tenant_id or with specific admin titles)
            const adminDocs = existingDocs.filter(doc => 
                !doc.tenant_id || 
                doc.title?.includes('Admin Guide') || 
                doc.title?.includes('User Guide') ||
                doc.title?.includes('Ai-SHA CRM')
            );
            
            console.log(`Found ${adminDocs.length} admin documentation records to clean up`);
            
            // Delete the orphaned records
            for (const doc of adminDocs) {
                console.log(`Deleting orphaned doc: ${doc.title} (ID: ${doc.id})`);
                await base44.asServiceRole.entities.DocumentationFile.delete(doc.id);
            }

            return new Response(JSON.stringify({ 
                status: 'success',
                message: `Successfully cleaned up ${adminDocs.length} orphaned documentation records. Use the PDF download buttons in Settings > SysAdmin Guide to access comprehensive documentation.`,
                cleaned_records: adminDocs.length,
                action_required: 'Navigate to Settings > SysAdmin Guide to download PDF documentation'
            }), { 
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });

        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
            return new Response(JSON.stringify({ 
                status: 'error',
                message: `Cleanup failed: ${cleanupError.message}. Please try again or contact support.`
            }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

    } catch (error) {
        console.error('Error in createSysAdminDocs:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: `Error: ${error.message}`
        }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default createSysAdminDocs;
