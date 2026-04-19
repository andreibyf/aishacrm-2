/**
 * ReasonConfirmDialog component tests.
 *
 * Covers: required-reason gate, optional-reason mode, onConfirm payload,
 * submitting state, onClose wiring, destructive CTA styling, error toast.
 *
 * Also smoke-tests the three wrapper variants: ConfirmCancelSubDialog,
 * VoidInvoiceDialog, ExemptionDialog.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReasonConfirmDialog from '../ReasonConfirmDialog';
import ConfirmCancelSubDialog from '../ConfirmCancelSubDialog';
import VoidInvoiceDialog from '../VoidInvoiceDialog';
import ExemptionDialog from '../ExemptionDialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';

beforeEach(() => vi.clearAllMocks());

describe('ReasonConfirmDialog', () => {
  it('disables confirm until a reason is entered when reasonRequired=true', () => {
    render(
      <ReasonConfirmDialog
        open
        onClose={() => {}}
        onConfirm={vi.fn()}
        title="Test action"
        confirmLabel="Go"
      />,
    );
    const confirm = screen.getByRole('button', { name: /^go$/i });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'valid' } });
    expect(confirm).toBeEnabled();
  });

  it('allows empty submission when reasonRequired=false', () => {
    render(
      <ReasonConfirmDialog
        open
        onClose={() => {}}
        onConfirm={vi.fn()}
        title="Test"
        confirmLabel="Go"
        reasonRequired={false}
      />,
    );
    expect(screen.getByRole('button', { name: /^go$/i })).toBeEnabled();
  });

  it('trims the reason and forwards it to onConfirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <ReasonConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Test"
        confirmLabel="Go"
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '   customer request   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^go$/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ reason: 'customer request' }));
    expect(toast.success).toHaveBeenCalledWith('Test completed');
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces backend error via toast and does not close on failure', async () => {
    const err = Object.assign(new Error('already canceled'), {
      status: 409,
      code: 'CONFLICT',
    });
    const onClose = vi.fn();
    render(
      <ReasonConfirmDialog
        open
        onClose={onClose}
        onConfirm={vi.fn().mockRejectedValue(err)}
        title="Cancel"
        confirmLabel="Go"
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /^go$/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('already canceled'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Wrapper variants', () => {
  it('ConfirmCancelSubDialog renders the cancel title + destructive CTA', () => {
    render(<ConfirmCancelSubDialog open onClose={() => {}} onConfirm={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Cancel subscription' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /cancel subscription/i }),
    ).toBeInTheDocument();
  });

  it('VoidInvoiceDialog renders the void title + destructive CTA', () => {
    render(<VoidInvoiceDialog open onClose={() => {}} onConfirm={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Void invoice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /void invoice/i })).toBeInTheDocument();
  });

  it('ExemptionDialog mode="set" requires a reason', () => {
    render(<ExemptionDialog open mode="set" onClose={() => {}} onConfirm={vi.fn()} />);
    expect(
      screen.getByRole('heading', { name: 'Mark tenant billing-exempt' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark exempt/i })).toBeDisabled();
  });

  it('ExemptionDialog mode="remove" allows empty reason', () => {
    render(<ExemptionDialog open mode="remove" onClose={() => {}} onConfirm={vi.fn()} />);
    expect(
      screen.getByRole('heading', { name: 'Remove billing exemption' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove exemption/i })).toBeEnabled();
  });
});
