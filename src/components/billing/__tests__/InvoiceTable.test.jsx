/**
 * InvoiceTable component tests.
 *
 * Covers: rendering data rows, row-click callback, skeleton loading,
 * empty state, action-column rendering + click isolation.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import InvoiceTable from '../InvoiceTable';

const INVOICES = [
  {
    id: 'inv1',
    invoice_number: 'INV-2026-001',
    status: 'paid',
    issued_at: '2026-04-01T00:00:00Z',
    due_at: '2026-04-15T00:00:00Z',
    total_cents: 4900,
    currency: 'USD',
  },
  {
    id: 'inv2',
    invoice_number: 'INV-2026-002',
    status: 'open',
    issued_at: '2026-04-10T00:00:00Z',
    due_at: '2026-04-24T00:00:00Z',
    total_cents: 14900,
    currency: 'USD',
  },
];

describe('InvoiceTable', () => {
  it('renders headers + a row for each invoice', () => {
    render(<InvoiceTable invoices={INVOICES} />);
    expect(screen.getByText('Invoice')).toBeInTheDocument();
    expect(screen.getByText('Issued')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
    expect(screen.getByText('INV-2026-002')).toBeInTheDocument();
    expect(screen.getByText('$49.00')).toBeInTheDocument();
    expect(screen.getByText('$149.00')).toBeInTheDocument();
    expect(screen.getByText('paid')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('renders skeleton rows when loading=true', () => {
    const { container } = render(<InvoiceTable invoices={[]} loading />);
    // Skeletons have role=status via shadcn <Skeleton> (animate-pulse div)
    // There should be 3 skeleton rows x 5 cells = 15 Skeleton divs
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(15);
  });

  it('renders empty state when no invoices and not loading', () => {
    render(<InvoiceTable invoices={[]} />);
    expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument();
  });

  it('does NOT render the Actions column when renderActions is not provided', () => {
    render(<InvoiceTable invoices={INVOICES} />);
    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });

  it('renders the Actions column and calls renderActions per row', () => {
    const renderActions = vi.fn(() => <button>Void</button>);
    render(<InvoiceTable invoices={INVOICES} renderActions={renderActions} />);
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(renderActions).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('button', { name: /void/i })).toHaveLength(2);
  });

  it('calls onRowClick with the invoice when a data row is clicked', () => {
    const onRowClick = vi.fn();
    render(<InvoiceTable invoices={INVOICES} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByTestId('invoice-row-INV-2026-001'));
    expect(onRowClick).toHaveBeenCalledWith(INVOICES[0]);
  });

  it('does NOT trigger onRowClick when clicking inside the Actions cell', () => {
    const onRowClick = vi.fn();
    const renderActions = () => <button>Void</button>;
    render(
      <InvoiceTable
        invoices={[INVOICES[0]]}
        onRowClick={onRowClick}
        renderActions={renderActions}
      />,
    );
    const row = screen.getByTestId('invoice-row-INV-2026-001');
    const button = within(row).getByRole('button', { name: /void/i });
    fireEvent.click(button);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
