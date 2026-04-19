/**
 * CurrentSubscriptionCard
 *
 * Displays the tenant's active subscription: plan name, price, status,
 * renewal date, and optional actions (Change plan / Cancel).
 *
 * Props:
 *   subscription -- { id, status, plan: {code, name, amount_cents, currency, interval},
 *                     current_period_end, cancel_at_period_end }
 *   onChangePlan -- callback() for "Change plan" CTA (hidden if not provided)
 *   onCancel     -- callback() for "Cancel" CTA (hidden if not provided)
 *   readOnly     -- hides both action buttons
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, XCircle, CreditCard } from 'lucide-react';
import { formatCents, formatDate, statusBadgeClass } from './billingFormatters';

export default function CurrentSubscriptionCard({
  subscription,
  onChangePlan,
  onCancel,
  readOnly = false,
}) {
  if (!subscription) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <CreditCard className="w-5 h-5 text-indigo-400" />
            No active subscription
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">
            Choose a plan below to activate your account.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { status, plan, current_period_end, cancel_at_period_end } = subscription;
  const showChange = !readOnly && typeof onChangePlan === 'function';
  const showCancel = !readOnly && typeof onCancel === 'function' && status !== 'canceled';

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-slate-100">
          <span className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-400" />
            {plan?.name || 'Current subscription'}
          </span>
          <Badge className={`${statusBadgeClass(status)} border`}>
            {status || 'unknown'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-slate-100">
            {formatCents(plan?.amount_cents, plan?.currency || 'USD')}
          </span>
          {plan?.interval ? (
            <span className="text-sm text-slate-400">/ {plan.interval}</span>
          ) : null}
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">
              {cancel_at_period_end ? 'Ends on' : 'Renews on'}
            </dt>
            <dd className="text-slate-200 mt-0.5">{formatDate(current_period_end)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Plan</dt>
            <dd className="text-slate-200 mt-0.5">{plan?.code || '—'}</dd>
          </div>
        </dl>

        {cancel_at_period_end ? (
          <p className="rounded-md border border-amber-700/50 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
            Subscription will end at the current period close. You retain access
            until {formatDate(current_period_end)}.
          </p>
        ) : null}

        {(showChange || showCancel) && (
          <div className="flex flex-wrap gap-2 pt-2">
            {showChange ? (
              <Button
                variant="outline"
                onClick={onChangePlan}
                className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
              >
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Change plan
              </Button>
            ) : null}
            {showCancel ? (
              <Button
                variant="outline"
                onClick={onCancel}
                className="bg-slate-700 border-slate-600 text-rose-300 hover:bg-rose-900/30 hover:text-rose-200"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
