/**
 * ConfirmCancelSubDialog
 *
 * Cancels a tenant's active subscription. Requires a reason which is
 * logged to billing_events as subscription.canceled.
 *
 * Props:
 *   open      -- boolean
 *   onClose   -- callback
 *   onConfirm -- async ({ reason }) -> void (caller calls billing.cancelSubscription)
 */

import ReasonConfirmDialog from './ReasonConfirmDialog';

export default function ConfirmCancelSubDialog({ open, onClose, onConfirm }) {
  return (
    <ReasonConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Cancel subscription"
      description="This cancels the tenant's active subscription immediately. The reason will be recorded in the audit trail."
      confirmLabel="Cancel subscription"
      destructive
      reasonRequired
      reasonPlaceholder="e.g. customer request, non-payment, migration"
    />
  );
}
