/**
 * VoidInvoiceDialog
 *
 * Voids an invoice (open/draft only). Requires a reason, logged as
 * invoice.voided.
 *
 * Props:
 *   open      -- boolean
 *   onClose   -- callback
 *   onConfirm -- async ({ reason }) -> void (caller calls billing.voidInvoice)
 */

import ReasonConfirmDialog from './ReasonConfirmDialog';

export default function VoidInvoiceDialog({ open, onClose, onConfirm }) {
  return (
    <ReasonConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Void invoice"
      description="The invoice will be marked void and excluded from balance calculations. This cannot be undone."
      confirmLabel="Void invoice"
      destructive
      reasonRequired
      reasonPlaceholder="e.g. duplicate, billing error, exempt tenant"
    />
  );
}
