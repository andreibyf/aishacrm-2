import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { Employee } from '@/api/entities';
import { requestUserInvite } from '@/api/functions';
import { inviteUser } from '@/api/functions';
import { userExistsByEmail } from '@/api/functions';
import { SendEmail } from '@/api/integrations';
import { useUser } from '@/components/shared/useUser.js';

export default function ResendInviteButton({
  employeeId,
  email,
  fullName,
  tier,
  role,
  className = '',
  onDone,
}) {
  const [sending, setSending] = React.useState(false);
  const { user: currentUser } = useUser();

  const handleResend = async () => {
    if (!email || !fullName || !tier || !role || !employeeId) {
      alert(
        'Missing data to resend. Make sure Email, Tier, and Role are set, and save the Employee first.',
      );
      return;
    }
    setSending(true);
    try {
      // Check if user already exists
      let existsResp = null;
      try {
        existsResp = await userExistsByEmail({ email });
      } catch (err) {
        console.error('Error checking if user exists:', err);
      }

      if (existsResp?.data?.exists) {
        alert('A CRM user already exists for this email. No invite sent.');
        onDone && onDone({ ok: false, reason: 'user_exists' });
        setSending(false);
        return;
      }

      const me = currentUser;
      const payload = {
        email,
        full_name: fullName,
        requested_tier: tier,
        requested_role: role,
        tenant_id: me?.tenant_id || null,
      };

      const isAdminLike = me?.role === 'admin' || me?.role === 'superadmin' || me?.tier === 'Tier4';

      let resp = null;
      let inviteError = null;

      try {
        resp = isAdminLike ? await inviteUser(payload) : await requestUserInvite(payload);
      } catch (err) {
        console.error('Function call error:', err);
        inviteError = err;
      }

      // Check if we got a valid response
      const hasValidResponse = resp && typeof resp === 'object';
      const status = hasValidResponse ? resp.status || resp.statusCode || 0 : 0;
      const responseData = hasValidResponse ? resp.data || resp.body || {} : {};
      const ok = status === 200 && !responseData.error;

      const newStatus = ok ? (isAdminLike ? 'invited' : 'requested') : 'failed';

      // Update employee status
      try {
        await Employee.update(employeeId, {
          crm_invite_status: newStatus,
          crm_invite_last_sent: new Date().toISOString(),
        });
      } catch (updateErr) {
        console.error('Failed to update employee status:', updateErr);
      }

      // Frontend fallback email for admins if backend didn't send
      if (ok && isAdminLike && !responseData.invitee_email_sent) {
        const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const body = `
          <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
            <p>Hello ${fullName || ''},</p>
            <p>You've been invited to join Ai-SHA CRM.</p>
            <ul>
              <li>Requested Role: <strong>${role}</strong></li>
              <li>Requested Tier: <strong>${tier}</strong></li>
            </ul>
            <p><a href="${appUrl}" target="_blank">Open Ai-SHA CRM</a></p>
          </div>`;
        try {
          await SendEmail({
            to: email,
            subject: "You're invited to Ai-SHA CRM",
            body,
            from_name: 'Ai-SHA CRM',
          });
        } catch (e) {
          console.warn('ResendInviteButton: frontend fallback email failed:', e?.message || e);
        }
      }

      onDone && onDone({ ok, resp, newStatus });

      if (!ok) {
        if (inviteError) {
          alert(`Invite failed: ${inviteError.message || 'Unknown error'}`);
        } else if (responseData.error) {
          alert(`Invite failed: ${responseData.error}`);
        } else {
          alert('Invite could not be sent automatically.');
        }
      } else {
        alert('Invite reissued.');
      }
    } catch (e) {
      console.error('ResendInviteButton error:', e);
      alert(e?.message || 'Failed to resend invite.');
      onDone && onDone({ ok: false, error: e });
    } finally {
      setSending(false);
    }
  };

  return (
    <Button type="button" onClick={handleResend} disabled={sending} className={className}>
      {sending ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <RefreshCw className="w-4 h-4 mr-2" />
      )}
      <Send className="w-4 h-4 mr-2 hidden" />
      Resend Invite
    </Button>
  );
}
