/**
 * SandboxAdapterPanel (UI Slice 1 / UI-1C)
 *
 * Renders the §7.10 Sandbox adapter status tab. Partial-live panel:
 *
 *   - runtime.provider_sync from the shared runtime status payload
 *   - A persistent informational note that sandbox-only is structurally
 *     enforced at erpnextSandboxAdapter.js:89-128
 *   - GapStateCard for the deeper registered-adapter list (§8.2.7)
 *
 * No mutation. No credentials view, no rotate-credentials affordance,
 * no test-connection / add-adapter / provider-sync-trigger button.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wrench } from 'lucide-react';
import { FINANCE_API_GAPS } from '@/api/finance';
import GapStateCard from './GapStateCard';

export default function SandboxAdapterPanel({ status }) {
  const providerSync = status?.runtime?.provider_sync;

  return (
    <div className="space-y-3" data-testid="finance-sandbox-adapter-panel">
      <Card className="border-slate-700/40 bg-slate-900/60 text-slate-100">
        <CardHeader className="flex flex-row items-start gap-3 pb-3">
          <Wrench className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" aria-hidden="true" />
          <div>
            <CardTitle className="text-base font-semibold text-slate-100">
              Sandbox adapter
            </CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Provider-write posture published by the Finance v2 runtime today. Registered-adapter
              list + capabilities echo is a backend gap.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-200">
          <div
            data-testid="finance-sandbox-adapter-provider-sync"
            data-provider-sync={providerSync || 'unknown'}
            className="flex items-center justify-between rounded-md border border-slate-700/40 bg-slate-800/40 px-3 py-2"
          >
            <span className="text-xs uppercase tracking-wide text-slate-400">Provider sync</span>
            <span className="text-sm font-medium text-slate-100">
              {providerSync || <span className="text-slate-500">unknown</span>}
            </span>
          </div>
          <div
            className="rounded-md border border-slate-700/40 bg-slate-800/30 px-3 py-2 text-xs text-slate-300"
            data-testid="finance-sandbox-adapter-posture-note"
          >
            Provider sync is disabled. This preview can only describe sandbox adapter status and
            cannot send data to ERPNext or any production provider.
            <span className="mt-1 block text-[10px] leading-relaxed text-slate-400">
              Technical: ERPNext sandbox is the only configured adapter; sandbox-only enforcement is
              structural at{' '}
              <code className="rounded bg-slate-900/60 px-1">erpnextSandboxAdapter.js:89-128</code>{' '}
              — production endpoints are blocked at the URL guard regardless of any UI state.
              FINANCE_PROVIDER_WRITES_ENABLED default-closed posture is preserved.
            </span>
          </div>
        </CardContent>
      </Card>

      <GapStateCard
        title="Registered adapters + capabilities echo"
        gap={FINANCE_API_GAPS.registeredAdapters}
      />
    </div>
  );
}
