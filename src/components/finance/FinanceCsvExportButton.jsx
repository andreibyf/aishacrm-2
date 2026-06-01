/**
 * FinanceCsvExportButton (Beta Exports slice).
 *
 * Read-only CSV export control for a Finance Ops panel. Takes precomputed
 * labeled `records` (built from the panel's displayed columns) and downloads
 * them as `<area>_<tenant>_<date>.csv`. Disabled with an operator-facing
 * tooltip when there is nothing to export. No mutation, no provider behavior.
 */
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import * as financeCsv from './financeCsv';

export default function FinanceCsvExportButton({ records, area, tenantId, className = '' }) {
  const empty = !Array.isArray(records) || records.length === 0;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={empty}
      title={
        empty ? 'Nothing to export — this panel has no rows for the current tenant.' : undefined
      }
      onClick={() =>
        financeCsv.downloadCsv(records, financeCsv.financeExportFilename(area, tenantId))
      }
      data-testid={`finance-export-${area}`}
      aria-label={`Export ${area} as CSV`}
      className={`border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700 ${className}`}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="ml-1.5 text-xs">Export CSV</span>
    </Button>
  );
}
