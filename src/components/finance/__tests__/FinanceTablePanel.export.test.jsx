import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import FinanceTablePanel from '../FinanceTablePanel';
import * as csv from '../financeCsv';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const columns = [
  { key: 'id', label: 'ID' },
  { key: 'amount_cents', label: 'Amount (cents)' },
];

describe('FinanceTablePanel — CSV export', () => {
  it('shows an enabled export button when rows load', async () => {
    render(
      <FinanceTablePanel
        tenantId="t"
        testId="x"
        title="X"
        emptyText="none"
        columns={columns}
        exportArea="draft-invoices"
        fetcher={() => Promise.resolve({ invoices: [{ id: 'a', amount_cents: 5 }] })}
        selectRows={(d) => d.invoices}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('finance-export-draft-invoices')).not.toBeDisabled(),
    );
  });

  it('export button is disabled when no rows', async () => {
    render(
      <FinanceTablePanel
        tenantId="t"
        testId="x"
        title="X"
        emptyText="none"
        columns={columns}
        exportArea="draft-invoices"
        fetcher={() => Promise.resolve({ invoices: [] })}
        selectRows={(d) => d.invoices}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('finance-export-draft-invoices')).toBeDisabled());
  });

  it('exports the same — placeholder the table shows for an empty cell (parity)', async () => {
    const spy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
    render(
      <FinanceTablePanel
        tenantId="t"
        testId="x"
        title="X"
        emptyText="none"
        columns={columns}
        exportArea="draft-invoices"
        fetcher={() => Promise.resolve({ invoices: [{ id: 'a', amount_cents: null }] })}
        selectRows={(d) => d.invoices}
      />,
    );
    // The displayed cell shows the em-dash placeholder…
    await waitFor(() => expect(screen.getByTestId('x-table')).toBeInTheDocument());
    expect(screen.getByTestId('x-row-a')).toHaveTextContent('—');
    // …and the exported record carries the same glyph, not a blank.
    fireEvent.click(screen.getByTestId('finance-export-draft-invoices'));
    expect(spy.mock.calls[0][0]).toEqual([{ ID: 'a', 'Amount (cents)': '—' }]);
  });

  it('renders no export button when exportArea is not provided', async () => {
    render(
      <FinanceTablePanel
        tenantId="t"
        testId="x"
        title="X"
        emptyText="none"
        columns={columns}
        fetcher={() => Promise.resolve({ invoices: [{ id: 'a', amount_cents: 5 }] })}
        selectRows={(d) => d.invoices}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('x-table')).toBeInTheDocument());
    expect(screen.queryByTestId('finance-export-draft-invoices')).not.toBeInTheDocument();
  });
});
