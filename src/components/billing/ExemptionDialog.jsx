/**
 * ExemptionDialog
 *
 * Set or remove billing exemption for a tenant.
 *   - mode="set":    reason is REQUIRED and forwarded to billing.setExemption
 *   - mode="remove": reason is OPTIONAL; forwarded to billing.removeExemption
 *                    (backend ignores body for remove, but we pass for UX parity)
 *
 * Props:
 *   open      -- boolean
 *   onClose   -- callback
 *   mode      -- "set" | "remove"
 *   onConfirm -- async ({ reason }) -> void
 */

import ReasonConfirmDialog from './ReasonConfirmDialog';

export default function ExemptionDialog({ open, onClose, mode = 'set', onConfirm }) {
  const isSet = mode === 'set';
  return (
    <ReasonConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={isSet ? 'Mark tenant billing-exempt' : 'Remove billing exemption'}
      description={
        isSet
          ? 'This tenant will no longer be invoiced or charged. Existing open invoices are not voided automatically — handle those separately.'
          : 'Removing exemption resumes normal billing. Future plan assignments will generate invoices as usual.'
      }
      confirmLabel={isSet ? 'Mark exempt' : 'Remove exemption'}
      destructive={!isSet}
      reasonRequired={isSet}
      reasonPlaceholder={
        isSet
          ? 'e.g. internal tenant, enterprise agreement, pilot'
          : 'Optional note for the audit log'
      }
    />
  );
}
