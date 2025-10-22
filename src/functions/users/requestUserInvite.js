/**
 * requestUserInvite
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

function buildHtmlEmail({
  tenantName, tenantId,
  requestedUserName, requestedUserEmail,
  requestedRole, requestedTier,
  requesterName, requesterEmail, requesterRole, requesterTier,
  canUseSoftphone
}) {
  const softphoneRow = typeof canUseSoftphone === 'boolean'
    ? `<tr><td style="color:#475569;padding:6px 8px;">Softphone</td><td style="padding:6px 8px;">${canUseSoftphone ? 'Yes' : 'No'}</td></tr>`
    : '';
  return `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:#0f172a; padding:18px;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #06b6d4, #6366f1); padding:16px 20px;">
        <h1 style="margin:0;color:#ffffff;font-size:18px;letter-spacing:0.3px;">Ai-SHA CRM — New User Access Request</h1>
      </div>
      <div style="padding:16px 20px;">
        <p style="color:#0f172a;">A new user access request was submitted from the Employees page.</p>
        <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#f8fafc;margin-top:12px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#0f172a;">
            <tr><td style="width:180px;color:#475569;padding:6px 8px;">Requested User</td><td style="padding:6px 8px;font-weight:600;">${requestedUserName} &lt;${requestedUserEmail}&gt;</td></tr>
            <tr><td style="color:#475569;padding:6px 8px;">Role (requested)</td><td style="padding:6px 8px;">${requestedRole || 'Not provided'}</td></tr>
            <tr><td style="color:#475569;padding:6px 8px;">Tier (requested)</td><td style="padding:6px 8px;">${requestedTier || 'Not provided'}</td></tr>
            <tr><td style="color:#475569;padding:6px 8px;">Tenant (origin)</td><td style="padding:6px 8px;">${tenantName ? `${tenantName} (${tenantId || ''})` : (tenantId || 'Unknown')}</td></tr>
            <tr><td style="color:#475569;padding:6px 8px;">Requested by</td><td style="padding:6px 8px;">${requesterName} &lt;${requesterEmail}&gt;</td></tr>
            <tr><td style="color:#475569;padding:6px 8px;">Requester authorization</td><td style="padding:6px 8px;">Role: <strong>${requesterRole}</strong> • Tier: <strong>${requesterTier}</strong></td></tr>
            ${softphoneRow}
          </table>
        </div>
      </div>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  const started = Date.now();
  let status = 'error';
  let errorMessage = null;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Allow Tier3/Tier4 to request access for others
    if (me.tier !== 'Tier3' && me.tier !== 'Tier4' && me.role !== 'admin' && me.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const body = await readJson(req);
    const email = String(body?.email || body?.invitee_email || '').trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400 });
    }

    const fullNameRaw = body?.full_name ?? body?.fullName ?? body?.name ?? '';
    const fullName = String(fullNameRaw || email.split('@')[0]).trim();
    const phone = body?.phone ? String(body.phone).trim() : null;
    const requestedPermissions = (body?.permissions && typeof body.permissions === 'object') ? body.permissions : null;

    let requested_role = normalizeRole(body?.requested_role ?? body?.role ?? body?.requestedRole, requestedPermissions) || 'power-user';
    let requested_tier = normalizeTier(body?.requested_tier ?? body?.tier ?? body?.requestedTier);

    // Smart defaults
    if (!requested_role) {
      requested_role = 'power-user';
    }
    if (!requested_tier) {
      if (me.tier === 'Tier4') requested_tier = 'Tier4';
      else if (me.tier === 'Tier3') requested_tier = 'Tier3';
      else requested_tier = 'Tier4';
    }

    const tenant_id = body?.tenant_id ?? body?.tenantId ?? me.tenant_id ?? null;
    const can_use_softphone = typeof body?.can_use_softphone === 'boolean' ? body.can_use_softphone : undefined;

    // Store invitation record
    try {
      await base44.asServiceRole.entities.UserInvitation.create({
        email,
        full_name: fullName,
        role: requested_role || 'user',
        tenant_id,
        invited_by: me.email,
        invitation_token: (crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`),
        is_used: false,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        requested_tier: requested_tier || undefined,
        requested_access: body?.requested_access || undefined,
        can_use_softphone: can_use_softphone,
        requested_permissions: requestedPermissions || undefined
      });
    } catch (e) {
      console.warn('requestUserInvite: failed to persist UserInvitation:', e?.message || e);
    }

    // Get tenant name
    let tenantName = null;
    if (tenant_id) {
      try {
        const t = await base44.asServiceRole.entities.Tenant.get(tenant_id);
        tenantName = t?.name || null;
      } catch (e) {
        console.warn('requestUserInvite: failed to fetch tenant name:', e?.message || e);
      }
    }

    const html = buildHtmlEmail({
      tenantName,
      tenantId: tenant_id,
      requestedUserName: fullName,
      requestedUserEmail: email,
      requestedRole: requested_role,
      requestedTier: requested_tier,
      requesterName: me.full_name || me.display_name || me.email,
      requesterEmail: me.email,
      requesterRole: me.role || 'user',
      requesterTier: me.tier || 'Tier1',
      canUseSoftphone: can_use_softphone
    });

    // Send to requesting user (confirmation)
    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: me.email,
        from_name: 'Ai-SHA CRM',
        subject: `Access Request Submitted: ${fullName} (${requested_tier || 'Tier?'})`,
        body: html
      });
    } catch (e) {
      console.warn('requestUserInvite: requester confirmation email failed:', e?.message || e);
    }

    // Send to admins/superadmins for approval
    try {
      const admins = await base44.asServiceRole.entities.User.filter({
        $or: [{ role: 'admin' }, { role: 'superadmin' }]
      });
      for (const admin of (admins || [])) {
        if (admin.email && admin.email !== me.email) {
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: admin.email,
              from_name: 'Ai-SHA CRM',
              subject: `New Access Request: ${fullName} (${requested_tier || 'Tier?'})`,
              body: html
            });
          } catch (e2) {
            console.warn(`requestUserInvite: admin email to ${admin.email} failed:`, e2?.message || e2);
          }
        }
      }
    } catch (e) {
      console.warn('requestUserInvite: failed to notify admins:', e?.message || e);
    }

    // NEW: Send SMS to invitee if phone provided
    let smsSent = false;
    if (phone) {
      try {
        const smsMessage = `Hello ${fullName}! You've been invited to join ${tenantName || 'Ai-SHA CRM'}. Check your email (${email}) for details.`;
        const smsResp = await base44.asServiceRole.functions.invoke('sendSms', {
          to: phone,
          message: smsMessage
        });
        if (smsResp?.status === 200 && !smsResp?.data?.error) {
          smsSent = true;
        }
      } catch (e) {
        console.warn('requestUserInvite: SMS failed:', e?.message || e);
      }
    }

    status = 'success';

    // Log performance
    try {
      await base44.asServiceRole.entities.PerformanceLog.create({
        function_name: 'requestUserInvite',
        response_time_ms: Date.now() - started,
        status: status,
        error_message: null,
        payload: { email, fullName, tenant_id, requested_role, requested_tier, smsAttempt: Boolean(phone) },
        response: { success: true, sms_sent: smsSent }
      });
    } catch (_e) {
      console.warn('requestUserInvite: failed to log performance (success)');
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Access request submitted for ${email}. Admins will review and approve.`,
      requested_tier: requested_tier,
      requested_role: requested_role,
      sms_sent: smsSent
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    errorMessage = error?.message || 'Internal error';
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.PerformanceLog.create({
        function_name: 'requestUserInvite',
        response_time_ms: Date.now() - started,
        status: 'error',
        error_message: errorMessage,
        payload: null,
        response: null
      });
    } catch (_e) {
      console.warn('requestUserInvite: failed to log performance (error)');
    }

    return new Response(JSON.stringify({ error: errorMessage }), { status: 500 });
  }
});


----------------------------

export default requestUserInvite;
