/**
 * A small per-row action button for the Finance Ops write UI (Submit / Approve /
 * Reverse). Manages its own busy state, optional confirm, success/error toast
 * (sonner — the app's mounted provider), and calls `reload` to refresh the panel
 * after a successful mutation. Used via FinanceTablePanel's `renderRowActions`.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { financeWriteErrorMessage } from './financeWriteErrors';

export default function FinanceRowActionButton({
  label,
  onAct,
  reload,
  confirmMessage,
  successMessage,
  disabled = false,
  testId,
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      await onAct();
      toast.success(successMessage || `${label} succeeded.`);
      reload?.();
    } catch (err) {
      toast.error(financeWriteErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled || busy}
      onClick={handleClick}
      data-testid={testId}
      className="border-border bg-muted text-xs text-foreground hover:bg-accent"
    >
      {busy ? '…' : label}
    </Button>
  );
}
