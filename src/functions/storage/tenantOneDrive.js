/**
 * tenantOneDrive
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 401, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    const user = await base44.auth.me();
    if (!user.tenant_id) {
        return new Response(JSON.stringify({ error: 'User must be assigned to a tenant' }), { 
            status: 403, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    try {
        const integrations = await base44.entities.TenantIntegration.filter({
            tenant_id: user.tenant_id,
            integration_type: 'onedrive',
            is_active: true
        });

        if (integrations.length === 0) {
            return new Response(JSON.stringify({ 
                error: 'OneDrive integration not configured for this tenant' 
            }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const integration = integrations[0];
        // Placeholder for credentials - would come from integration.api_credentials
        // const { client_id, client_secret, folder_id } = integration.api_credentials;

        const { action, file_name, record_type, record_id } = await req.json();

        switch (action) {
            case 'create_folder':
                const folderName = `${record_type}_${record_id}_${file_name || 'documents'}`;
                // This is a simplified example - you would implement actual Microsoft Graph API calls here
                return new Response(JSON.stringify({
                    success: true,
                    message: `Folder "${folderName}" created successfully in OneDrive.`,
                    folder_url: `https://onedrive.live.com/redir?resid=EXAMPLE_ID`
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            case 'upload_file':
                return new Response(JSON.stringify({
                    success: true,
                    message: 'File uploaded successfully to OneDrive.',
                    file_url: `https://onedrive.live.com/redir?resid=EXAMPLE_FILE_ID`
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            case 'list_files':
                return new Response(JSON.stringify({
                    success: true,
                    files: [
                        {
                            name: 'Project_Proposal.docx',
                            url: 'https://onedrive.live.com/redir?resid=EXAMPLE_FILE_ID',
                            created_date: new Date().toISOString()
                        }
                    ]
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            default:
                return new Response(JSON.stringify({ error: 'Invalid action' }), { 
                    status: 400, 
                    headers: { 'Content-Type': 'application/json' } 
                });
        }

    } catch (error) {
        console.error('Error in tenant OneDrive integration:', error);
        return new Response(JSON.stringify({ 
            error: 'Internal server error',
            details: error.message 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
});

----------------------------

export default tenantOneDrive;
