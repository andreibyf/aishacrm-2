/**
 * createAuditLog
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        if (!(await base44.auth.isAuthenticated())) {
            return new Response(JSON.stringify({ error: 'Not authenticated' }), 
                { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        
        const user = await base44.auth.me();
        const data = await req.json();
        
        // Create audit log entry
        const auditEntry = {
            user_email: user.email,
            user_role: user.role,
            user_display_role: user.permissions?.intended_role || user.role,
            action_type: data.action_type,
            entity_type: data.entity_type,
            entity_id: data.entity_id,
            description: data.description,
            old_values: data.old_values || null,
            new_values: data.new_values || null,
            ip_address: req.headers.get('x-forwarded-for') || 'unknown',
            user_agent: req.headers.get('user-agent') || 'unknown'
        };

        const auditLog = await base44.asServiceRole.entities.AuditLog.create(auditEntry);
        
        return new Response(JSON.stringify({
            status: 'success',
            audit_log_id: auditLog.id
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        
    } catch (error) {
        console.error('Error creating audit log:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message || 'Failed to create audit log'
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});

----------------------------

export default createAuditLog;
