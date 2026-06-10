/**
 * GapStateCard (UI Slice 1 / UI-1C)
 *
 * Shared component rendered by every Finance Ops tab whose backing read
 * endpoint does not exist yet. Pulled from the design freeze §14 cross-
 * packet contract so every gap-state tab presents identical chrome and
 * messaging — operators learn the pattern once.
 *
 * Each gap descriptor comes from FINANCE_API_GAPS in src/api/finance.js
 * (UI-1A); the descriptor is the single source of truth for which backend
 * endpoint is missing, why, and where the natural backing source lives.
 *
 * The card is NOT an error state — see design freeze §9.4. It is an
 * informational "this is unimplemented in the backend" notice rendered as
 * a neutral panel so operators do not file support tickets and so admins
 * do not conclude the system is degraded.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Info } from 'lucide-react';

export default function GapStateCard({ title, gap }) {
  return (
    <Card
      data-testid={`finance-gap-card-${gap.designRef.replace(/[§.]/g, '')}`}
      data-design-ref={gap.designRef}
      data-endpoint={gap.endpoint}
      className="border-dashed border-border bg-card text-foreground"
    >
      <CardHeader className="flex flex-row items-start gap-3 pb-3">
        <Info className="mt-1 h-4 w-4 flex-shrink-0 text-sky-400" aria-hidden="true" />
        <div className="flex-1">
          <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
          {/* Operator-facing, plain-language summary leads the card (Codex P3). */}
          <p
            className="mt-1 text-xs leading-relaxed text-muted-foreground"
            data-testid="finance-gap-card-operator-summary"
          >
            {gap.operatorSummary ||
              'This data is not available in this preview yet. It will appear once the backend read endpoint is added.'}
          </p>
        </div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {/* Engineering traceability is preserved but de-emphasized below the
            operator copy — kept so devs can still find the missing endpoint. */}
        <div
          className="rounded border border-border bg-card p-2"
          data-testid="finance-gap-card-technical"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Technical details (engineering)
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Read-API not yet implemented (design freeze {gap.designRef}).
          </p>
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Missing endpoint
            </div>
            <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs text-foreground">
              {gap.endpoint}
            </code>
          </div>
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Natural backing source (backend follow-up)
            </div>
            <p className="mt-1 leading-relaxed text-muted-foreground">{gap.naturalBackingSource}</p>
          </div>
          <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
            UI Slice 1 deliberately does not invent frontend data sources for unimplemented
            endpoints. The backend follow-up slice that closes this gap will land the GET route plus
            the matching client wrapper in{' '}
            <code className="rounded bg-muted px-1">src/api/finance.js</code>, and this panel will
            be replaced with a live data view in the same commit.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
