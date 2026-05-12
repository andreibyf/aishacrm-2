import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import LeadTable from '../LeadTable.jsx';

// Lightweight stubs for child components and context-bound deps
vi.mock('../../shared/AssignedToDisplay', () => ({
  __esModule: true,
  default: () => <span data-testid="assigned-to">unassigned</span>,
}));
vi.mock('../../shared/RowOperationIndicator', () => ({
  __esModule: true,
  default: () => <span>…</span>,
}));

const baseProps = {
  selectedLeads: new Set(),
  selectAllMode: false,
  toggleSelectAll: vi.fn(),
  toggleSelection: vi.fn(),
  calculateLeadAge: () => 3,
  getLeadAgeBucket: () => ({ value: '0-7' }),
  getAssociatedAccountName: () => null,
  employeesMap: {},
  usersMap: {},
  setDetailLead: vi.fn(),
  setIsDetailOpen: vi.fn(),
  setEditingLead: vi.fn(),
  setIsFormOpen: vi.fn(),
  handleConvert: vi.fn(),
  handleDelete: vi.fn(),
  leadLabel: 'Prospect',
};

// Helper: format expected display the same way the component does (Intl-based)
function expectedFormatted(iso) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

describe('LeadTable — Last Updated column', () => {
  it('renders formatted date from `updated_at` (canonical DB column)', () => {
    const updatedIso = '2026-05-06T10:30:00.000Z';
    const leads = [
      {
        id: 'lead-1',
        first_name: 'UT',
        last_name: 'Unit TestA',
        email: 'lead-test-1@example.com',
        company: 'UT',
        status: 'new',
        updated_at: updatedIso,
      },
    ];

    render(<LeadTable {...baseProps} leads={leads} />);

    const row = screen.getByTestId('lead-row-lead-test-1@example.com');
    expect(within(row).getByText(expectedFormatted(updatedIso))).toBeInTheDocument();
  });

  it('falls back to legacy `updated_date` when `updated_at` is absent', () => {
    const updatedIso = '2026-04-01T08:00:00.000Z';
    const leads = [
      {
        id: 'lead-2',
        first_name: 'Legacy',
        last_name: 'Row',
        email: 'legacy@example.com',
        status: 'new',
        // No updated_at; only legacy field surfaced via metadata expansion
        updated_date: updatedIso,
      },
    ];

    render(<LeadTable {...baseProps} leads={leads} />);

    const row = screen.getByTestId('lead-row-legacy@example.com');
    expect(within(row).getByText(expectedFormatted(updatedIso))).toBeInTheDocument();
  });

  it('renders an em-dash when neither timestamp is present', () => {
    const leads = [
      {
        id: 'lead-3',
        first_name: 'Name',
        last_name: 'Change',
        email: 'testlead@example.com',
        status: 'new',
        // No updated_at, no updated_date
      },
    ];

    render(<LeadTable {...baseProps} leads={leads} />);

    const row = screen.getByTestId('lead-row-testlead@example.com');
    // Multiple "—" exist in the row (phone, company, etc). Scope to the
    // Last Updated cell: it's the 10th <td> (0-based: select cells[9]).
    const cells = row.querySelectorAll('td');
    expect(cells[9]).toHaveTextContent('—');
  });

  it('prefers `updated_at` over `updated_date` when both are present', () => {
    const newer = '2026-05-09T12:00:00.000Z';
    const older = '2026-01-01T00:00:00.000Z';
    const leads = [
      {
        id: 'lead-4',
        first_name: 'Both',
        last_name: 'Fields',
        email: 'both@example.com',
        status: 'new',
        updated_at: newer,
        updated_date: older,
      },
    ];

    render(<LeadTable {...baseProps} leads={leads} />);

    const row = screen.getByTestId('lead-row-both@example.com');
    expect(within(row).getByText(expectedFormatted(newer))).toBeInTheDocument();
    expect(within(row).queryByText(expectedFormatted(older))).not.toBeInTheDocument();
  });
});
