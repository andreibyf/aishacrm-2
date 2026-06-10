import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { financeExportFilename } from './financeCsv';
import { downloadPdf } from './financePdf';

export default function FinancePdfExportButton({ records, area, tenantId, title, className = '' }) {
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
      onClick={() => downloadPdf(records, financeExportFilename(area, tenantId), { title })}
      data-testid={`finance-pdf-${area}`}
      aria-label={`Export ${area} as PDF`}
      className={`border-border bg-muted text-foreground hover:bg-accent ${className}`.trim()}
    >
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="ml-1.5 text-xs">Export PDF</span>
    </Button>
  );
}
