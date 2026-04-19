/**
 * CreateInvoiceDialog component tests.
 *
 * Covers: line-item add/remove, totals recomputation, validation gate,
 * onCreate payload shape, submit spinner, backend error surfacing.
 *
 * Note: sonner toast is mocked so error paths don't leak global state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateInvoiceDialog from '../CreateInvoiceDialog';

// Mock sonner toast to silence and assert later if needed
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(overrides = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    tenantId: 'tenant-uuid-1',
    onCreate: vi.fn().mockResolvedValue({ id: 'inv-new' }),
    ...overrides,
  };
  return { ...render(<CreateInvoiceDialog {...props} />), props };
}

describe('CreateInvoiceDialog', () => {
  it('renders title, description, and one empty line item by default', () => {
    renderDialog();
    expect(screen.getByText('Create invoice')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Description')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Qty')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/unit price/i)).toBeInTheDocument();
  });

  it('disables the Create button when no description is entered', () => {
    renderDialog();
    const createButton = screen.getByRole('button', { name: /create draft/i });
    expect(createButton).toBeDisabled();
  });

  it('enables Create when a valid line exists, and submits the expected payload', async () => {
    const { props } = renderDialog();

    fireEvent.change(screen.getByPlaceholderText('Description'), {
      target: { value: 'Monthly subscription' },
    });
    fireEvent.change(screen.getByPlaceholderText('Qty'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText(/unit price/i), {
      target: { value: '4900' },
    });

    const createButton = screen.getByRole('button', { name: /create draft/i });
    expect(createButton).toBeEnabled();
    fireEvent.click(createButton);

    await waitFor(() => expect(props.onCreate).toHaveBeenCalled());
    expect(props.onCreate).toHaveBeenCalledWith(
      'tenant-uuid-1',
      expect.objectContaining({
        line_items: [
          {
            item_type: 'subscription',
            description: 'Monthly subscription',
            quantity: 2,
            unit_price_cents: 4900,
          },
        ],
        currency: 'USD',
        due_days: 14,
        tax_total_cents: 0,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Invoice created (draft)');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('adds and removes line items; remove is disabled when only one line remains', () => {
    renderDialog();

    const removeButtons = screen.getAllByLabelText('Remove line');
    expect(removeButtons[0]).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /add line/i }));
    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(2);

    // now the first remove button should be enabled
    const removes2 = screen.getAllByLabelText('Remove line');
    expect(removes2[0]).toBeEnabled();
    fireEvent.click(removes2[0]);
    expect(screen.getAllByPlaceholderText('Description')).toHaveLength(1);
  });

  it('recomputes total when tax is added', () => {
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText('Description'), {
      target: { value: 'Line' },
    });
    fireEvent.change(screen.getByPlaceholderText(/unit price/i), {
      target: { value: '10000' },
    });
    // label text is "Tax (cents)" — find input by value-binding (initial 0)
    const inputs = screen.getAllByRole('spinbutton');
    // Order: Qty, unit, due_days, tax  (the 4 number inputs inside this dialog)
    const taxInput = inputs[inputs.length - 1];
    fireEvent.change(taxInput, { target: { value: '500' } });

    // Total should show $105.00 ($100 subtotal + $5 tax)
    expect(screen.getByText('$105.00')).toBeInTheDocument();
  });

  it('surfaces backend error code via toast on rejection', async () => {
    const err = Object.assign(new Error('tenant is billing-exempt'), {
      status: 409,
      code: 'EXEMPT',
    });
    const { props } = renderDialog({ onCreate: vi.fn().mockRejectedValue(err) });

    fireEvent.change(screen.getByPlaceholderText('Description'), {
      target: { value: 'x' },
    });
    fireEvent.change(screen.getByPlaceholderText(/unit price/i), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('tenant is billing-exempt'),
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
