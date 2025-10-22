/**
 * sendAIEmail
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { createAuditLog } from './createAuditLog.js';

// Helper function to fetch private file content
async function getFileAttachment(base44, fileUri) {
  try {
    const signedUrlResponse = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri });
    if (!signedUrlResponse.data || !signedUrlResponse.data.signed_url) {
      throw new Error(`Failed to get signed URL for ${fileUri}`);
    }

    const fileResponse = await fetch(signedUrlResponse.data.signed_url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch file content from ${fileUri}`);
    }
    
    const buffer = await fileResponse.arrayBuffer();
    return buffer;
  } catch (error) {
    console.error(`Error fetching attachment ${fileUri}:`, error.message);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const {
      entityType,
      entityId,
      to,
      subject,
      body,
      attachments = [], // [{ filename: string, content: string (base64) }]
      attachment_uris = [], // [string]
    } = await req.json();

    const finalAttachments = [...attachments];

    // Process attachments from CRM URIs
    if (attachment_uris && attachment_uris.length > 0) {
      const crmAttachments = await Promise.all(
        attachment_uris.map(async (uri) => {
          try {
            // We need file name and content. Assume URI contains enough info or we fetch it.
            // Let's assume the file name is the last part of the URI path.
            const filename = uri.split('/').pop();
            const fileBuffer = await getFileAttachment(base44, uri);
            if (fileBuffer) {
              // Convert buffer to base64 string using Deno's standard library
              const base64Content = encode(fileBuffer);
              return { filename, content: base64Content };
            }
          } catch(e) {
             console.error(`Failed to process CRM attachment URI: ${uri}`, e);
          }
          return null;
        })
      );
      finalAttachments.push(...crmAttachments.filter(Boolean));
    }
    
    // The underlying SendEmail integration needs to support an 'attachments' array
    // with { filename, content (base64) } format.
    await base44.asServiceRole.integrations.Core.SendEmail({
      to,
      subject,
      body,
      attachments: finalAttachments,
    });
    
    // Create an activity log for the sent email
    if (entityType && entityId) {
      await base44.entities.Activity.create({
        tenant_id: user.tenant_id,
        assigned_to: user.email,
        type: 'email',
        subject: `Email: ${subject}`,
        description: body,
        status: 'completed',
        due_date: new Date().toISOString().split('T')[0],
        related_to: entityType,
        related_id: entityId,
        outcome: `Email sent to ${to}`
      });
    }

    await createAuditLog({
      action_type: 'update',
      entity_type: entityType || 'System',
      entity_id: entityId || 'N/A',
      description: `Email sent to ${to} with subject "${subject}"`,
      user_email: user.email,
      user_role: user.role,
      new_values: { to, subject, has_attachments: finalAttachments.length > 0 }
    }, { base44 });

    return new Response(JSON.stringify({ success: true, message: 'Email sent and logged.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in sendAIEmail function:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});


----------------------------

export default sendAIEmail;
