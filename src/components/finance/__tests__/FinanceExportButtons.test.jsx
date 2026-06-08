import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import FinanceExportButtons from '../FinanceExportButtons';

afterEach(() => cleanup());

describe('FinanceExportButtons', () => {
  it('renders both the CSV and PDF export buttons for an area', () => {
    render(
      <FinanceExportButtons
        records={[{ Code: '1000' }]}
        area="chart-of-accounts"
        tenantId="00000000-0000-4000-8000-000000000011"
        title="Chart of accounts"
      />,
    );
    expect(screen.getByTestId('finance-export-chart-of-accounts')).toBeInTheDocument();
    expect(screen.getByTestId('finance-pdf-chart-of-accounts')).toBeInTheDocument();
  });
});
