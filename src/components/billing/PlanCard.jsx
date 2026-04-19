/**
 * PlanCard
 *
 * Visual tile for a single billing plan. Used in:
 *   - Tenant PaymentPortal (PlanSelector) for plan selection
 *   - Superadmin BillingAdminConsole for plan assignment dialogs
 *
 * Props:
 *   plan         -- { code, name, description, interval, currency, amount_cents, features? }
 *   isCurrent    -- highlight as the active plan
 *   onSelect     -- callback(plan); when provided, a "Select" button renders
 *   selectLabel  -- override the CTA label (default "Select plan")
 *   disabled     -- disable the CTA
 *   compact      -- render a smaller variant for dialogs
 */

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Crown } from 'lucide-react';
import { formatCents } from './billingFormatters';

export default function PlanCard({
  plan,
  isCurrent = false,
  onSelect,
  selectLabel = 'Select plan',
  disabled = false,
  compact = false,
}) {
  if (!plan) return null;
  const { code, name, description, interval, currency, amount_cents, features } = plan;
  const featureList = Array.isArray(features) ? features : [];

  return (
    <Card
      data-testid={`plan-card-${code}`}
      data-current={isCurrent ? 'true' : 'false'}
      className={`flex flex-col bg-slate-800 transition-colors ${
        isCurrent ? 'border-indigo-500 ring-1 ring-indigo-500/40' : 'border-slate-700'
      }`}
    >
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">{name}</h3>
            {description ? (
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            ) : null}
          </div>
          {isCurrent ? (
            <Badge className="bg-indigo-900/40 text-indigo-300 border border-indigo-700/50">
              <Crown className="w-3 h-3 mr-1" />
              Current
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="mb-4 flex items-baseline gap-1">
          <span className="text-3xl font-bold text-slate-100">
            {formatCents(amount_cents, currency)}
          </span>
          {interval ? (
            <span className="text-sm text-slate-400">/ {interval}</span>
          ) : null}
        </div>

        {featureList.length > 0 && !compact ? (
          <ul className="space-y-2">
            {featureList.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                <Check className="w-4 h-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>

      {onSelect ? (
        <CardFooter>
          <Button
            onClick={() => onSelect(plan)}
            disabled={disabled || isCurrent}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700"
          >
            {isCurrent ? 'Current plan' : selectLabel}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
