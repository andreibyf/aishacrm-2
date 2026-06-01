import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const mockFinance = { getJournalEntries: vi.fn() };
vi.mock('@/api/finance', async () => {
  const actual = await vi.importActual('@/api/finance');
  return { ...actual, getJournalEntries: (...a) => mockFinance.getJournalEntries(...a) };
});

import JournalEntriesList from '../JournalEntriesList';

const TENANT = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

beforeEach(() => mockFinance.getJournalEntries.mockReset());
afterEach(() => cleanup());

describe('JournalEntriesList — CSV export', () => {
  it('shows an enabled export button when entries load', async () => {
    mockFinance.getJournalEntries.mockResolvedValue({
      journal_entries: [
        { id: 'journal_1', aggregate_id: 'journal_1', status: 'posted', created_at: 'now' },
      ],
    });
    render(<JournalEntriesList tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-export-journal-entries')).not.toBeDisabled(),
    );
  });

  it('disables export when there are no entries', async () => {
    mockFinance.getJournalEntries.mockResolvedValue({ journal_entries: [] });
    render(<JournalEntriesList tenantId={TENANT} />);
    await waitFor(() =>
      expect(screen.getByTestId('finance-export-journal-entries')).toBeDisabled(),
    );
  });
});
