import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import FinanceTablePanel from '../FinanceTablePanel';
import * as csv from '../financeCsv';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'amount_cents', label: 'Amount (cents)' },
];

describe('FinanceTablePanel export', () => {
  it('shows an enabled export button when rows load', async () => {
    render(
      <FinanceTablePanel
        tenantId="00000000-0000-4000-8000-000000000011"
        testId="finance-table-panel"
        title="Draft invoices"
        emptyText="None"
        columns={COLUMNS}
        exportArea="draft-invoices"
        fetcher={() => Promise.resolve({ invoices: [{ id: 'a', amount_cents: 5 }] })}
        selectRows={(data) => data.invoices}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('finance-export-draft-invoices')).not.toBeDisabled(),
    );
  });

  it('disables the export button when there are no rows', async () => {
    render(
      <FinanceTablePanel
        tenantId="00000000-0000-4000-8000-000000000011"
        testId="finance-table-panel"
        title="Draft invoices"
        emptyText="None"
        columns={COLUMNS}
        exportArea="draft-invoices"
        fetcher={() => Promise.resolve({ invoices: [] })}
        selectRows={(data) => data.invoices}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('finance-export-draft-invoices')).toBeDisabled());
  });

  it('exports the same em-dash placeholder the table shows for an empty cell (parity)', async () => {
    const spy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
    render(
      <FinanceTablePanel
        tenantId="00000000-0000-4000-8000-000000000011"
        testId="finance-table-panel"
        title="Draft invoices"
        emptyText="None"
        columns={COLUMNS}
        exportArea="draft-invoices"
        fetcher={() => Promise.resolve({ invoices: [{ id: 'a', amount_cents: null }] })}
        selectRows={(data) => data.invoices}
      />,
    );

    // The displayed cell shows the em-dash placeholder…
    await waitFor(() =>
      expect(screen.getByTestId('finance-table-panel-table')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('finance-table-panel-row-a')).toHaveTextContent('—');

    // …and the exported record carries the SAME glyph, not a blank (table↔CSV parity).
    fireEvent.click(screen.getByTestId('finance-export-draft-invoices'));
    expect(spy.mock.calls[0][0]).toEqual([{ ID: 'a', 'Amount (cents)': '—' }]);
  });

  it('renders no export button when exportArea is not provided', async () => {
    render(
      <FinanceTablePanel
        tenantId="00000000-0000-4000-8000-000000000011"
        testId="finance-table-panel"
        title="Draft invoices"
        emptyText="None"
        columns={COLUMNS}
        fetcher={() => Promise.resolve({ invoices: [{ id: 'a', amount_cents: 5 }] })}
        selectRows={(data) => data.invoices}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('finance-table-panel-table')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('finance-export-draft-invoices')).not.toBeInTheDocument();
  });
});
