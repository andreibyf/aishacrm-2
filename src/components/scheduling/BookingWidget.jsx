/**
 * BookingWidget.jsx
 * Embeds the Cal.com booking widget into contact/lead detail views.
 *
 * Props:
 *   contactName  — Prefill name
 *   contactEmail — Prefill email
 *   contactId    — CRM contact UUID (passed as metadata to Cal.com)
 *   leadId       — CRM lead UUID (passed as metadata to Cal.com)
 *   tenantId     — CRM tenant UUID; used to fetch Cal.com integration config
 *   creditsRemaining — optional override (falls back to self-fetched summary)
 *   onBuyCredits — callback when "Buy Package" is clicked
 *
 * Rendered when:
 *   - Cal.com integration is configured for this tenant (calLink resolves)
 *   - creditsRemaining > 0 OR allowNoCredits is true
 */

import { useEffect, useState } from 'react';
import Cal, { getCalApi } from '@calcom/embed-react';
import { Button } from '@/components/ui/button';
import { CalendarCheck, ShoppingCart, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

async function apiFetch(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

export default function BookingWidget({
  contactName,
  contactEmail,
  contactId,
  leadId,
  tenantId,
  creditsRemaining: creditsRemainingProp,
  onBuyCredits,
}) {
  const [calLink, setCalLink] = useState(null);
  const [creditsRemaining, setCreditsRemaining] = useState(creditsRemainingProp ?? 0);
  const [calReady, setCalReady] = useState(false);
  const [calError, setCalError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch Cal.com integration config + credits summary for this entity
  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const entityParam = contactId
          ? `contact_id=${contactId}`
          : leadId
            ? `lead_id=${leadId}`
            : null;

        const [integRes, creditsRes] = await Promise.all([
          apiFetch(`/api/tenantintegrations?tenant_id=${tenantId}&integration_type=calcom`),
          entityParam
            ? apiFetch(`/api/session-credits?tenant_id=${tenantId}&${entityParam}`)
            : Promise.resolve(null),
        ]);

        const integJson = await integRes.json();
        const integration = integJson.data?.[0] || null;
        const link = integration?.config?.cal_link || null;

        if (!cancelled) {
          setCalLink(link);
          if (creditsRes !== null) {
            const creditsJson = await creditsRes.json();
            setCreditsRemaining(creditsJson.summary?.total_remaining ?? 0);
          }
        }
      } catch {
        // leave defaults (null calLink, 0 credits)
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, contactId, leadId]);

  useEffect(() => {
    if (!calLink) return;

    getCalApi()
      .then((cal) => {
        cal('ui', {
          styles: { branding: { brandColor: '#7c3aed' } },
          hideEventTypeDetails: false,
          layout: 'month_view',
        });
        setCalReady(true);
      })
      .catch(() => {
        setCalError(true);
      });
  }, [calLink]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }


  // No Cal.com integration configured
  if (!calLink) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="font-medium">Cal.com not configured</p>
        <p className="mt-1">Go to Settings → Integrations → Cal.com to connect your account.</p>
      </div>
    );
  }

  // No credits remaining
  if (creditsRemaining <= 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 mx-auto text-amber-500" />
        <div>
          <p className="font-medium text-amber-900">No session credits remaining</p>
          <p className="text-sm text-amber-700 mt-1">
            Purchase a session package to enable booking.
          </p>
        </div>
        {onBuyCredits && (
          <Button onClick={onBuyCredits} size="sm">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Buy Package
          </Button>
        )}
      </div>
    );
  }

  // Cal.com failed to load
  if (calError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Failed to load Cal.com widget. Check your Cal.com integration settings.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Credits badge */}
      <div className="flex items-center gap-2 text-sm">
        <CalendarCheck className="h-4 w-4 text-purple-600" />
        <span className="text-muted-foreground">
          <span className="font-semibold text-purple-700">{creditsRemaining}</span> session
          {creditsRemaining !== 1 ? 's' : ''} available
        </span>
      </div>

      {/* Loading state */}
      {!calReady && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading booking widget…
        </div>
      )}

      {/* Cal.com embed */}
      <Cal
        calLink={calLink}
        style={{ width: '100%', height: '600px', overflow: 'scroll' }}
        config={{
          layout: 'month_view',
          name: contactName || '',
          email: contactEmail || '',
          metadata: JSON.stringify({
            contact_id: contactId || null,
            lead_id: leadId || null,
            tenant_id: tenantId,
          }),
        }}
      />
    </div>
  );
}
