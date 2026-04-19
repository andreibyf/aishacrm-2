/**
 * ReasonConfirmDialog
 *
 * Shared confirmation dialog used by three superadmin flows:
 *   - Cancel subscription (ConfirmCancelSubDialog)
 *   - Void invoice (VoidInvoiceDialog)
 *   - Set/remove exemption (ExemptionDialog)
 *
 * Collects a free-text reason, runs an async onConfirm, shows a spinner
 * while in flight, and surfaces backend error codes via toast.
 *
 * Props:
 *   open         -- boolean
 *   onClose      -- callback
 *   onConfirm    -- async ({ reason }) -> void
 *   title        -- dialog title text
 *   description  -- short explanation text below title
 *   confirmLabel -- CTA label (default "Confirm")
 *   destructive  -- style CTA as destructive (red)
 *   reasonRequired -- when false, empty reason is allowed
 *   reasonPlaceholder
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ReasonConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  reasonRequired = true,
  reasonPlaceholder = 'Enter a short reason',
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleClose() {
    if (submitting) return;
    setReason('');
    onClose?.();
  }

  const canConfirm = reasonRequired ? reason.trim().length > 0 : true;

  async function handleSubmit() {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({ reason: reason.trim() });
      toast.success(`${title} completed`);
      setReason('');
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-slate-400">{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-slate-300">
            Reason{reasonRequired ? ' *' : ' (optional)'}
          </Label>
          <Textarea
            className="bg-slate-800 border-slate-700"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonPlaceholder}
            disabled={submitting}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
            className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canConfirm || submitting}
            className={
              destructive
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
