/**
 * inviteUser
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

function jsonSafe(v, fallback = null) {
  try {
    return JSON.stringify(v);
  } catch (_e) {
    return fallback;
  }
}

async function readJson(req) {
  try {
    return await req.json();
  } catch (_e) {
    return {};
  }
}

function normalizeTier(input) {
  if (input === undefined || input === null) return null;
  const s = String(input).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  if (s === 'tier1' || s === '1') return 'Tier1';
  if (s === 'tier2' || s === '2') return 'Tier2';
  if (s === 'tier3' || s === '3') return 'Tier3';
  if (s === 'tier4' || s === '4') return 'Tier4';
  return null;
}

function normalizeRole(input, permissions) {
  let role = input ?? (permissions && permissions.intended_role) ?? null;
  if (!role) return null;
  const s = String(role).trim().toLowerCase().replace(/\s+/g, '-').replace(/_+/g, '-');
  if (['power-user', 'poweruser', 'power'].includes(s)) return 'power-user';
  if (['admin', 'administrator'].includes(s)) return 'admin';
  if (['superadmin', 'super-admin'].includes(s)) return 'superadmin';
  if (['user', 'standard', 'member'].includes(s)) return 'user';
  return 'user';
}

function resolveAppUrl(req) {
  try {
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
  } catch (_e) {
    return 'https://app.base44.com';
  }
}

function buildInviteeEmail({ appUrl, inviteeName, tenantName, requestedRole, requestedTier }) {
  return `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#0f172a; padding:18px;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #06b6d4, #6366f1); padding:16px 20px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;letter-spacing:0.3px;">You're invited to Ai-SHA CRM</h1>
      </div>
      <div style="padding:16px 20px;color:#0f172a;">
        <p>Hello ${inviteeName || ''},</p>
        <p>You’ve been invited to join ${tenantName || 'Ai-SHA CRM'}.</p>
        <ul>
          <li>Requested Role: <strong>${requestedRole || 'user'}</strong></li>
          <li>Requested Tier: <strong>${requestedTier || 'Tier4'}</strong></li>
        </ul>
        <p>Click the button below to sign in and complete your setup:</p>
        <p>
          <a href="${appUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;">
            Open Ai-SHA CRM
          </a>
        </p>
        <p style="color:#475569;font-size:12px;margin-top:12px;">
          If the button doesn’t work, copy and paste this link into your browser: ${appUrl}
        </p>
      </div>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  const started = Date.now();
  let inviteeEmailSent = false;
  let smsSent = false;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const invitingUser = await base44.auth.me();
    if (!invitingUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const isAdmin = invitingUser.role === 'admin' || invitingUser.role === 'superadmin';
    const canInvite = isAdmin || invitingUser.tier === 'Tier3' || invitingUser.tier === 'Tier4';

    if (!canInvite) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions to invite users' }), { status: 403 });
    }

    const body = await readJson(req);
    const email = String(body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), { status: 400 });
    }

    const fullName = String(body?.full_name || body?.fullName || email.split('@')[0]).trim();
    const phone = body?.phone ? String(body.phone).trim() : null;
    const tenantId = body?.tenant_id || invitingUser.tenant_id || null;
    const requestedPermissions = (body?.permissions && typeof body.permissions === 'object') ? body.permissions : {};

    let requestedRole = normalizeRole(body?.role, requestedPermissions) || 'user';
    let requestedTier = normalizeTier(body?.requested_tier || body?.tier) || 'Tier1';
    const requestedAccess = body?.requested_access || 'read_write';
    const canUseSoftphone = typeof body?.can_use_softphone === 'boolean' ? body.can_use_softphone : false;

    // Store invitation metadata for admin reference
    try {
      await base44.asServiceRole.entities.UserInvitation.create({
        email,
        full_name: fullName,
        role: requestedRole,
        tenant_id: tenantId,
        invited_by: invitingUser.email,
        invitation_token: crypto.randomUUID(),
        is_used: false,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        requested_tier: requestedTier,
        requested_access: requestedAccess,
        can_use_softphone: canUseSoftphone,
        requested_permissions: requestedPermissions
      });
    } catch (e) {
      console.warn('inviteUser: failed to store UserInvitation:', e?.message || e);
    }

    // Get tenant name
    let tenantName = null;
    if (tenantId) {
      try {
        const t = await base44.asServiceRole.entities.Tenant.get(tenantId);
        tenantName = t?.name || null;
      } catch (e) {
        console.warn('inviteUser: failed to fetch tenant name:', e?.message || e);
      }
    }

    // Send admin notification with instructions
    try {
      const adminHtml = `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#0f172a; padding:18px;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #06b6d4, #6366f1); padding:16px 20px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;letter-spacing:0.3px;">Ai-SHA CRM — Action Required: Complete User Invite</h1>
      </div>
      <div style="padding:16px 20px;">
        <p style="color:#0f172a;"><strong>New user invitation requested:</strong></p>
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#f8fafc;margin:12px 0;">
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#0f172a;">
            <tr><td style="width:180px;color:#475569;padding:6px 8px;">User</td><td style="padding:6px 8px;font-weight:600;">${fullName} &lt;${email}&gt;</td></tr>
            <tr><td style="color:#475569;padding:6px 8px;">Role</td><td style="padding:6px 8px;">${requestedRole}</td></tr>
            <tr><td style="color:#475569;padding:6px 8px;">Tier</td><td style="padding:6px 8px;">${requestedTier}</td></tr>
            <tr><td style="color:#475569;padding:6px 8px;">Tenant</td><td style="padding:6px 8px;">${tenantName || tenantId || 'Unknown'}</td></tr>
            <tr><td style="color:#475569;padding:6px 8px;">Requested by</td><td style="padding:6px 8px;">${invitingUser.full_name || invitingUser.email}</td></tr>
          </table>
        </div>
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin:12px 0;">
          <p style="margin:0;color:#92400e;font-weight:600;">⚠️ Manual Action Required</p>
          <p style="margin:8px 0 0 0;color:#92400e;font-size:13px;">Please complete the invite via the base44 platform dashboard:</p>
          <ol style="margin:8px 0 0 20px;color:#92400e;font-size:13px;">
            <li>Go to <a href="https://app.base44.com" style="color:#2563eb;">app.base44.com</a></li>
            <li>Navigate to Dashboard → Users</li>
            <li>Click "Invite User" and enter: <strong>${email}</strong></li>
            <li>Assign role: <strong>${requestedRole === 'power-user' ? 'user' : requestedRole}</strong></li>
          </ol>
        </div>
      </div>
    </div>
  </div>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: invitingUser.email,
        from_name: 'Ai-SHA CRM',
        subject: `Action Required: Complete invite for ${fullName}`,
        body: adminHtml
      });

      // Send to superadmins too
      const admins = await base44.asServiceRole.entities.User.filter({
        $or: [{ role: 'admin' }, { role: 'superadmin' }]
      });
      for (const admin of (admins || [])) {
        if (admin.email && admin.email !== invitingUser.email) {
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: admin.email,
              from_name: 'Ai-SHA CRM',
              subject: `Action Required: Complete invite for ${fullName}`,
              body: adminHtml
            });
          } catch (e2) {
            console.warn('inviteUser: admin notification failed');
          }
        }
      }
    } catch (e) {
      console.warn('inviteUser: admin email failed:', e?.message || e);
    }

    // Send welcome email to invitee
    try {
      const appUrl = resolveAppUrl(req);
      const inviteeHtml = buildInviteeEmail({
        appUrl,
        inviteeName: fullName,
        tenantName: tenantName || 'Ai-SHA CRM',
        requestedRole,
        requestedTier
      });

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        from_name: 'Ai-SHA CRM',
        subject: 'You\'re invited to Ai-SHA CRM',
        body: inviteeHtml
      });
      inviteeEmailSent = true;
    } catch (e) {
      console.warn('inviteUser: invitee email failed:', e?.message || e);
    }

    // Send SMS if phone provided
    if (phone) {
      try {
        const smsMessage = `You've been invited to Ai-SHA CRM. Check your email (${email}) for login details.`;
        const smsResponse = await base44.asServiceRole.functions.invoke('sendSms', {
          to: phone,
          message: smsMessage
        });
        if (smsResponse?.data?.success) {
          smsSent = true;
        }
      } catch (e) {
        console.warn('inviteUser: SMS failed:', e?.message || e);
      }
    }

    // Log performance
    try {
      await base44.asServiceRole.entities.PerformanceLog.create({
        function_name: 'inviteUser',
        response_time_ms: Date.now() - started,
        status: 'success',
        error_message: null,
        payload: { email, fullName, tenantId, requestedRole, requestedTier, phone: Boolean(phone) },
        response: { invitee_email_sent: inviteeEmailSent, sms_sent: smsSent, requires_manual_platform_invite: true }
      });
    } catch (_e) {
      console.warn('inviteUser: failed to log performance');
    }

    return new Response(JSON.stringify({
      success: true,
      requires_manual_invite: true,
      invitee_email_sent: inviteeEmailSent,
      sms_sent: smsSent,
      message: `Invitation request recorded. Please complete the invite via the base44 platform (Dashboard → Users → Invite User). ${inviteeEmailSent ? 'Welcome email sent to user.' : ''}`,
      requested_tier: requestedTier,
      requested_role: requestedRole
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    const errorMessage = error?.message || 'Internal error';
    console.error('inviteUser error:', errorMessage);
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.PerformanceLog.create({
        function_name: 'inviteUser',
        response_time_ms: Date.now() - started,
        status: 'error',
        error_message: errorMessage,
        payload: null,
        response: null
      });
    } catch (_e) {
      console.warn('inviteUser: failed to log performance (error)');
    }

    return new Response(JSON.stringify({ success: false, error: errorMessage }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});


----------------------------

export default inviteUser;
