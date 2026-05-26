/**
 * ProjectionStatusPanel (UI Slice 1 / UI-1C)
 *
 * Renders the §7.9 Projection / degraded status tab. Partial-live panel:
 *
 *   - The runtime.persistence value comes from the shared runtime status
 *     payload (passed down from FinanceOps.jsx — design freeze §14 cross-
 *     packet contract: single RuntimeStatusContext).
 *   - The deeper per-projection cursor / store-type / lag view is a backend
 *     gap (§8.2.6) and is rendered via GapStateCard.
 *
 * No mutation. No replay / advance-cursor / drop-and-rebuild affordance
 * anywhere (design freeze §7.9 "Out of scope").
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database } from 'lucide-react';
import { FINANCE_API_GAPS } from '@/api/finance';
import GapStateCard from './GapStateCard';

export default function ProjectionStatusPanel({ status }) {
  const persistence = status?.runtime?.persistence;
  const isDegradedFromInMemory = persistence === 'in_memory' || persistence == null;

  return (
    <div className="space-y-3" data-testid="finance-projection-status-panel">
      <Card className="border-slate-700/40 bg-slate-900/60 text-slate-100">
        <CardHeader className="flex flex-row items-start gap-3 pb-3">
          <Database className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" aria-hidden="true" />
          <div>
            <CardTitle className="text-base font-semibold text-slate-100">
              Projection / degraded status
            </CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Persistence-store mode published by the Finance v2 runtime today. Per-projection
              cursor / store-type / lag is a backend gap.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-200">
          <div
            data-testid="finance-projection-status-persistence"
            data-persistence={persistence || 'unknown'}
            className="flex items-center justify-between rounded-md border border-slate-700/40 bg-slate-800/40 px-3 py-2"
          >
            <span className="text-xs uppercase tracking-wide text-slate-400">Persistence</span>
            <span className="text-sm font-medium text-slate-100">
              {persistence || <span className="text-slate-500">unknown</span>}
            </span>
          </div>
          {isDegradedFromInMemory ? (
            <p
              className="rounded-md border border-amber-700/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-100"
              data-testid="finance-projection-status-degraded-note"
            >
              In-memory persistence is the only supported Slice 1 backend mode.
              ENABLE_FINANCE_PERSISTENT_EVENTS is fail-closed at the route level
              (backend/routes/finance.v2.js:48). Persistent-events activation requires a separate
              route lift coordinated with backend Phase 4 planning.
            </p>
          ) : (
            <p
              className="rounded-md border border-emerald-700/40 bg-emerald-900/20 px-3 py-2 text-xs text-emerald-100"
              data-testid="finance-projection-status-healthy-note"
            >
              Persistence is reported as {persistence}. Projection-backed reads are active — the
              cursor / lag detail still requires the backend gap below to land for full
              observability.
            </p>
          )}
        </CardContent>
      </Card>

      <GapStateCard
        title="Per-projection cursor / store-type / lag"
        gap={FINANCE_API_GAPS.projectionCursors}
      />
    </div>
  );
}
