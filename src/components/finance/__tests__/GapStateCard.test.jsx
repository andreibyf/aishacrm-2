/**
 * GapStateCard (UI-1C) — shared gap-state surface.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import GapStateCard from '../GapStateCard';
import { FINANCE_API_GAPS } from '@/api/finance';

afterEach(() => cleanup());

describe('GapStateCard', () => {
  it('renders the descriptor fields verbatim with stable testid', () => {
    render(<GapStateCard title="Draft invoices" gap={FINANCE_API_GAPS.draftInvoices} />);
    const card = screen.getByTestId('finance-gap-card-821');
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('data-design-ref', '§8.2.1');
    expect(card).toHaveAttribute('data-endpoint', 'GET /api/v2/finance/draft-invoices');
    expect(card).toHaveTextContent('Draft invoices');
    expect(card).toHaveTextContent('GET /api/v2/finance/draft-invoices');
    expect(card).toHaveTextContent(FINANCE_API_GAPS.draftInvoices.naturalBackingSource);
  });

  it('frames the state as "Read-API not yet implemented", not an error', () => {
    render(<GapStateCard title="Approvals" gap={FINANCE_API_GAPS.approvals} />);
    expect(screen.getByText(/Read-API not yet implemented/i)).toBeInTheDocument();
  });

  it('exposes no button — read-only surface', () => {
    render(<GapStateCard title="Adapter queue" gap={FINANCE_API_GAPS.adapterJobs} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
