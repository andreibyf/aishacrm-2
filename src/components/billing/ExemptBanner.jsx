/**
 * ExemptBanner
 *
 * Displayed at the top of the tenant Payment Portal when
 * billing_account.billing_exempt === true. Replaces the plan selector
 * so exempt tenants don't see pricing UX.
 *
 * Props:
 *   reason -- free-text explanation set by the superadmin
 *   setAt  -- ISO timestamp when exemption was applied
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck } from 'lucide-react';
import { formatDate } from './billingFormatters';

export default function ExemptBanner({ reason, setAt }) {
  return (
    <Alert
      role="status"
      data-testid="exempt-banner"
      className="bg-indigo-900/30 border-indigo-700/50"
    >
      <ShieldCheck className="h-5 w-5 text-indigo-300" />
      <AlertTitle className="text-indigo-100">Billing is waived for your account</AlertTitle>
      <AlertDescription className="text-indigo-200 space-y-1">
        <p>
          This tenant is marked billing-exempt, so no invoices or charges will
          be generated. Contact your account manager if you have questions.
        </p>
        {reason ? (
          <p className="text-sm">
            <span className="text-indigo-300">Reason:</span> {reason}
          </p>
        ) : null}
        {setAt ? (
          <p className="text-xs text-indigo-300/80">Applied {formatDate(setAt)}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
