import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { downloadCsv, financeExportFilename } from './financeCsv';

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
      onClick={() => downloadCsv(records, financeExportFilename(area, tenantId))}
      data-testid={`finance-export-${area}`}
      aria-label={`Export ${area} as CSV`}
      className={`border-border bg-muted text-foreground hover:bg-accent ${className}`.trim()}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="ml-1.5 text-xs">Export CSV</span>
    </Button>
  );
}
