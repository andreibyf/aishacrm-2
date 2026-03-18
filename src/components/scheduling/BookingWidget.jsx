/**
 * BookingWidget.jsx
 * Embeds the Cal.com booking widget into contact/lead detail views.
 *
 * Props:
 *   calLink    — Cal.com link slug, e.g. "tenant-slug/30min-consultation"
 *   contactName  — Prefill name
 *   contactEmail — Prefill email
 *   contactId    — CRM contact UUID (passed as metadata to Cal.com)
 *   leadId       — CRM lead UUID (passed as metadata to Cal.com)
 *   tenantId     — CRM tenant UUID (passed as metadata to Cal.com)
 *   creditsRemaining — number; show CTA to buy package if 0
 *   onBuyCredits — callback when "Buy Package" is clicked
 *
 * Rendered when:
 *   - Cal.com integration is configured for this tenant (calLink is truthy)
 *   - creditsRemaining > 0 OR allowNoCredits is true
 */

import { useEffect, useState } from 'react';
import Cal, { getCalApi } from '@calcom/embed-react';
import { Button } from '@/components/ui/button';
import { CalendarCheck, ShoppingCart, AlertCircle, Loader2 } from 'lucide-react';

export default function BookingWidget({
  calLink,
  contactName,
  contactEmail,
  contactId,
  leadId,
  tenantId,
  creditsRemaining = 0,
  onBuyCredits,
}) {
  const [calReady, setCalReady] = useState(false);
  const [calError, setCalError] = useState(false);

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
