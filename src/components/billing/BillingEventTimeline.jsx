/**
 * BillingEventTimeline
 *
 * Vertical audit feed of billing_events for a tenant. Icons and colors
 * vary by event_type; source (webhook, manual, system) shown as badge.
 *
 * Props:
 *   events  -- array of billing_event rows (most-recent first)
 *   loading -- skeleton placeholders while true
 *   onLoadMore -- optional callback for pagination CTA
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  AlertCircle,
  CreditCard,
  FileText,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { humanizeEventType, formatDate } from './billingFormatters';

const ICON_MAP = {
  'subscription.assigned': UserPlus,
  'subscription.changed': RefreshCcw,
  'subscription.canceled': XCircle,
  'subscription.status_changed': Activity,
  'subscription.renewed': RefreshCcw,
  'exemption.set': ShieldCheck,
  'exemption.removed': ShieldOff,
  'invoice.created': FileText,
  'invoice.issued': FileText,
  'invoice.paid': CreditCard,
  'invoice.voided': XCircle,
  'payment.received': CreditCard,
  'payment.failed': AlertCircle,
};

function EventIcon({ eventType }) {
  const Icon = ICON_MAP[eventType] || Activity;
  return <Icon className="w-4 h-4 text-indigo-300" />;
}

function sourceBadge(source) {
  const map = {
    webhook: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    manual: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
    system: 'bg-slate-700 text-slate-300 border-slate-600',
  };
  return map[source] || map.system;
}

export default function BillingEventTimeline({ events, loading = false, onLoadMore }) {
  if (loading && (!events || events.length === 0)) {
    return (
      <ul className="space-y-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex gap-3">
            <Skeleton className="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40 bg-slate-700" />
              <Skeleton className="h-3 w-64 bg-slate-700" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (!events || events.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-6 text-center">No billing events yet.</p>
    );
  }

  return (
    <>
      <ul className="space-y-4">
        {events.map((ev) => (
          <li key={ev.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center flex-shrink-0">
              <EventIcon eventType={ev.event_type} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-200">
                  {humanizeEventType(ev.event_type)}
                </span>
                <Badge className={`${sourceBadge(ev.source)} border text-xs`}>
                  {ev.source || 'system'}
                </Badge>
              </div>
              {ev.actor_email ? (
                <p className="text-xs text-slate-500">By {ev.actor_email}</p>
              ) : null}
              {ev.payload_json ? (
                <pre className="mt-1 text-xs text-slate-400 bg-slate-900/60 border border-slate-700 rounded px-2 py-1 overflow-x-auto max-w-full">
                  {JSON.stringify(ev.payload_json, null, 0)}
                </pre>
              ) : null}
              <p className="text-xs text-slate-600 mt-1">{formatDate(ev.created_at)}</p>
            </div>
          </li>
        ))}
      </ul>

      {typeof onLoadMore === 'function' ? (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            onClick={onLoadMore}
            className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
          >
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}
