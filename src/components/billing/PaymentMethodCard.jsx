/**
 * PaymentMethodCard
 *
 * Shows the tenant's default payment method (last4 + brand) with a
 * link out to Stripe's Billing Portal for updates. When no method is
 * on file, shows a setup CTA that starts a Checkout session.
 *
 * Props:
 *   paymentMethod -- { brand, last4, exp_month, exp_year } or null
 *   onManage      -- callback() that creates a portal session and redirects
 *   onAdd         -- callback() that creates a checkout session (no plan change)
 *   loading       -- disables both buttons while true
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, Plus, ExternalLink } from 'lucide-react';

export default function PaymentMethodCard({ paymentMethod, onManage, onAdd, loading = false }) {
  const hasMethod = paymentMethod && paymentMethod.last4;

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <CreditCard className="w-5 h-5 text-indigo-400" />
          Payment method
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasMethod ? (
          <div className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2">
            <div>
              <p className="text-sm text-slate-200">
                {paymentMethod.brand ? `${paymentMethod.brand} ` : ''}
                ending in {paymentMethod.last4}
              </p>
              {paymentMethod.exp_month && paymentMethod.exp_year ? (
                <p className="text-xs text-slate-500">
                  Expires {String(paymentMethod.exp_month).padStart(2, '0')}/
                  {String(paymentMethod.exp_year).slice(-2)}
                </p>
              ) : null}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onManage}
              disabled={loading || typeof onManage !== 'function'}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="w-4 h-4 mr-2" />
              )}
              Update
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-700 bg-slate-900/30 px-4 py-6 text-center">
            <p className="text-sm text-slate-400 mb-3">
              No payment method on file.
            </p>
            <Button
              onClick={onAdd}
              disabled={loading || typeof onAdd !== 'function'}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add payment method
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
