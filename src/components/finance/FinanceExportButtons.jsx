import FinanceCsvExportButton from './FinanceCsvExportButton';
import FinancePdfExportButton from './FinancePdfExportButton';

// Renders the CSV + PDF export pair for a panel. Both serialize the SAME precomputed
// `records` (the panel's displayed columns) — read-only, displayed-page only.
export default function FinanceExportButtons({ records, area, tenantId, title, className = '' }) {
  return (
    <div className="flex items-center gap-2">
      <FinanceCsvExportButton
        records={records}
        area={area}
        tenantId={tenantId}
        className={className}
      />
      <FinancePdfExportButton
        records={records}
        area={area}
        tenantId={tenantId}
        title={title}
        className={className}
      />
    </div>
  );
}
