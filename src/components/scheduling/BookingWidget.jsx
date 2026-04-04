/**
 * BookingWidget.jsx
 * Shows booking history and embeds the Cal.com scheduling widget for a contact/lead.
 *
 * Props:
 *   contactName  — Pre-fill name on Cal.com booking form
 *   contactEmail — Pre-fill email on Cal.com booking form (locks the attendee identity)
 *   contactId    - CRM contact UUID
 *   leadId       - CRM lead UUID
 *   tenantId     - CRM tenant UUID
 *   assignedTo   - Employee UUID; resolves that employee's personal booking link
 *   fallbackLinkedUserId - Current CRM user ID; used when the record is unassigned
 *   fallbackUserEmail - Current CRM user email fallback when no linked_user_id is available
 */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CalendarCheck, Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getBackendUrl } from '@/api/backendUrl';
import { formatDate } from '@/utils/dateFormatting';

const BACKEND_URL = getBackendUrl();

const STATUS_COLORS = {
  confirmed: 'default',
  pending: 'secondary',
  cancelled: 'destructive',
  completed: 'outline',
  no_show: 'destructive',
};

async function apiFetch(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

export default function BookingWidget({
  contactId,
  leadId,
  tenantId,
  assignedTo, // employee UUID (lead.assigned_to / contact.assigned_to)
  contactEmail, // pre-fill attendee email on Cal.com form
  contactName, // pre-fill attendee name on Cal.com form
  fallbackLinkedUserId,
  fallbackUserEmail,
}) {
  const [calLink, setCalLink] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shortLink, setShortLink] = useState(null);
  const [bookingUnavailable, setBookingUnavailable] = useState(false);

  const calOrigin = import.meta.env.VITE_CALCOM_URL || 'http://localhost:3002';

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        setShortLink(null);
        setBookingUnavailable(false);
        const entityParam = contactId
          ? `contact_id=${contactId}`
          : leadId
            ? `lead_id=${leadId}`
            : null;

        const requests = [
          apiFetch(`/api/calcom-sync/resolve-link?tenant_id=${tenantId}`),
          entityParam
            ? apiFetch(`/api/session-credits/bookings?tenant_id=${tenantId}&${entityParam}`)
            : Promise.resolve(null),
          // assignedTo is an employee UUID — fetch directly by ID
          assignedTo
            ? apiFetch(`/api/employees/${assignedTo}?tenant_id=${tenantId}`)
            : Promise.resolve(null),
          !assignedTo && fallbackLinkedUserId
            ? apiFetch(
                `/api/employees?tenant_id=${tenantId}&linked_user_id=${encodeURIComponent(fallbackLinkedUserId)}`,
              )
            : !assignedTo && fallbackUserEmail
              ? apiFetch(`/api/employees?email=${encodeURIComponent(fallbackUserEmail)}`)
              : Promise.resolve(null),
        ];

        const [linkRes, bookingsRes, employeeRes, fallbackEmployeeRes] =
          await Promise.all(requests);

        const linkJson = await linkRes.json();
        let link = linkRes.ok && linkJson.status === 'success' ? linkJson.data.cal_link : null;

        // Prefer the assigned employee's personal booking link
        if (employeeRes && employeeRes.ok) {
          const empJson = await employeeRes.json();
          const emp = empJson?.data?.employee || null;
          const empLink = emp?.metadata?.calcom_cal_link || emp?.calcom_cal_link || null;
          if (empLink) link = empLink;
        }

        if (!assignedTo && fallbackEmployeeRes && fallbackEmployeeRes.ok) {
          const fallbackJson = await fallbackEmployeeRes.json();
          const fallbackEmployee = Array.isArray(fallbackJson?.data)
            ? fallbackJson.data[0] || null
            : Array.isArray(fallbackJson)
              ? fallbackJson[0] || null
              : null;
          const fallbackLink =
            fallbackEmployee?.metadata?.calcom_cal_link ||
            fallbackEmployee?.calcom_cal_link ||
            null;
          if (fallbackLink) link = fallbackLink;
        }

        if (link) {
          try {
            const validationRes = await apiFetch(
              `/api/calcom-sync/validate-link?cal_link=${encodeURIComponent(link)}`,
            );
            const validationJson = await validationRes.json().catch(() => ({}));
            if (validationRes.ok) {
              if (validationJson.valid !== true) {
                link = null;
              }
            } else if (![401, 403].includes(validationRes.status)) {
              link = null;
            }
          } catch {
            // Validation is best-effort here; do not disable booking on transient failures.
          }
        }

        if (cancelled) return;
        setCalLink(link);
        setBookingUnavailable(!link);
        if (bookingsRes) {
          const bookingsJson = await bookingsRes.json();
          setBookings(bookingsJson.data || []);
        }

        if (link && contactEmail) {
          const params = new URLSearchParams();
          if (contactEmail) params.set('email', contactEmail);
          if (contactName) params.set('name', contactName);
          if (contactId) params.set('metadata[crm_contact_id]', contactId);
          if (leadId) params.set('metadata[crm_lead_id]', leadId);
          if (tenantId) params.set('metadata[crm_tenant_id]', tenantId);
          const fullUrl = `${calOrigin}/${link}${params.toString() ? '?' + params.toString() : ''}`;

          try {
            const slRes = await apiFetch('/api/scheduling/shortlink', {
              method: 'POST',
              body: JSON.stringify({ url: fullUrl }),
            });
            if (slRes.ok) {
              const slJson = await slRes.json();
              if (slJson.token) {
                setShortLink(`${BACKEND_URL}/book/${slJson.token}`);
              }
            }
          } catch {
            // Short link generation is best-effort; fall back to the full Cal.com link
          }
        }
      } catch {
        setBookingUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [
    tenantId,
    contactId,
    leadId,
    assignedTo,
    fallbackLinkedUserId,
    fallbackUserEmail,
    contactEmail,
    contactName,
  ]);

  const handleCopyLink = () => {
    if (!calLink) return;
    navigator.clipboard.writeText(shortLink || fullLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!calLink) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="font-medium">Booking not configured</p>
        <p className="mt-1">
          {bookingUnavailable
            ? 'The saved Cal.com booking page is missing or invalid.'
            : 'Assign an employee with a booking calendar to enable this.'}
        </p>
      </div>
    );
  }

  if (!contactEmail) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium">Client email required</p>
          <p className="mt-1">Add an email address before sending a booking link.</p>
        </div>
        {bookings.length > 0 ? (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1 text-slate-300">
              <CalendarCheck className="h-4 w-4" /> Booking History
            </h4>
            <div className="space-y-1.5">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="rounded border border-slate-700 px-3 py-2 text-sm flex items-center justify-between"
                >
                  <div className="text-slate-300">
                    {formatDate(b.scheduled_start, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  <Badge variant={STATUS_COLORS[b.status] || 'secondary'} className="capitalize">
                    {b.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 text-center py-2">No bookings yet</p>
        )}
      </div>
    );
  }

  // Build pre-filled link.
  // Cal.com passes ?metadata[key]=value through to the webhook payload unchanged,
  // so we embed CRM entity IDs here — the webhook handler uses these to
  // identify the lead/contact without relying on the attendee email.
  const prefillParams = new URLSearchParams();
  if (contactEmail) prefillParams.set('email', contactEmail);
  if (contactName) prefillParams.set('name', contactName);
  if (contactId) prefillParams.set('metadata[crm_contact_id]', contactId);
  if (leadId) prefillParams.set('metadata[crm_lead_id]', leadId);
  if (tenantId) prefillParams.set('metadata[crm_tenant_id]', tenantId);
  const paramString = prefillParams.toString();
  const fullLink = `${calOrigin}/${calLink}${paramString ? '?' + paramString : ''}`;

  return (
    <div className="space-y-4">
      {/* Booking link row */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2">
        <span className="text-xs font-mono text-slate-400 truncate flex-1">
          {shortLink || fullLink}
        </span>
        <a
          href={shortLink || fullLink}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-slate-400 hover:text-slate-200 transition-colors"
          title="Open booking page"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <button
          onClick={handleCopyLink}
          className="shrink-0 text-slate-400 hover:text-slate-200 transition-colors"
          title="Copy booking link"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>

      {/* Booking history */}
      {bookings.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1 text-slate-300">
            <CalendarCheck className="h-4 w-4" /> Booking History
          </h4>
          <div className="space-y-1.5">
            {bookings.map((b) => (
              <div
                key={b.id}
                className="rounded border border-slate-700 px-3 py-2 text-sm flex items-center justify-between"
              >
                <div className="text-slate-300">
                  {formatDate(b.scheduled_start, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
                <Badge variant={STATUS_COLORS[b.status] || 'secondary'} className="capitalize">
                  {b.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 text-center py-2">No bookings yet</p>
      )}
    </div>
  );
}
