/**
 * JournalEntriesList (UI-1C) — live data panel for posted journal entries.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mockFinance = {
  getJournalEntries: vi.fn(),
};
vi.mock('@/api/finance', async () => {
  const actual = await vi.importActual('@/api/finance');
  return {
    ...actual,
    getJournalEntries: (...a) => mockFinance.getJournalEntries(...a),
  };
});

import JournalEntriesList from '../JournalEntriesList';

const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

beforeEach(() => {
  mockFinance.getJournalEntries.mockReset();
  mockFinance.getJournalEntries.mockResolvedValue({ journal_entries: [] });
});

afterEach(() => cleanup());

describe('JournalEntriesList', () => {
  it('fetches on mount and renders the empty state when no entries exist', async () => {
    render(<JournalEntriesList tenantId={TENANT_ID} />);
    await waitFor(() => {
      expect(mockFinance.getJournalEntries).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ signal: expect.anything() }),
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('finance-journal-entries-empty')).toBeInTheDocument();
    });
  });

  it('renders rows in descending created_at order', async () => {
    mockFinance.getJournalEntries.mockResolvedValue({
      journal_entries: [
        { id: 'je_old', aggregate_id: 'agg', status: 'posted', created_at: '2026-01-01T00:00:00Z' },
        { id: 'je_new', aggregate_id: 'agg', status: 'posted', created_at: '2026-05-01T00:00:00Z' },
      ],
    });

    render(<JournalEntriesList tenantId={TENANT_ID} />);

    await waitFor(() => {
      expect(screen.getByTestId('finance-journal-entries-table')).toBeInTheDocument();
    });
    const rows = screen.getAllByTestId(/^finance-journal-entries-row-/);
    expect(rows[0]).toHaveTextContent('je_new');
    expect(rows[1]).toHaveTextContent('je_old');
  });

  it('renders the inline error block on fetch failure', async () => {
    mockFinance.getJournalEntries.mockRejectedValueOnce(
      Object.assign(new Error('Boom'), { status: 502, code: null }),
    );
    render(<JournalEntriesList tenantId={TENANT_ID} />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-journal-entries-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('finance-journal-entries-error')).toHaveTextContent('Boom');
  });

  it('refresh re-issues the fetch', async () => {
    render(<JournalEntriesList tenantId={TENANT_ID} />);
    await waitFor(() => expect(mockFinance.getJournalEntries).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByTestId('finance-journal-entries-refresh'));
    await waitFor(() => expect(mockFinance.getJournalEntries).toHaveBeenCalledTimes(2));
  });

  it('exposes no mutating-style button (only Refresh)', async () => {
    mockFinance.getJournalEntries.mockResolvedValue({
      journal_entries: [{ id: 'je_1', aggregate_id: 'agg', status: 'posted', created_at: 'now' }],
    });
    render(<JournalEntriesList tenantId={TENANT_ID} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-journal-entries-table')).toBeInTheDocument(),
    );
    const buttons = screen.getAllByRole('button');
    const mutating = /reverse|approve|reject|post|delete|edit/i;
    for (const btn of buttons) {
      const label = (btn.textContent || btn.getAttribute('aria-label') || '').trim();
      expect(label).not.toMatch(mutating);
    }
  });
});
