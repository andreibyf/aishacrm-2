/**
 * SandboxAdapterPanel (Finance Read API Slice 1 / UI-1C)
 *
 * §7.10 Sandbox adapter status tab — now live via GET /api/v2/finance/adapters
 * (design freeze §6.7), a read-only declarative metadata registry. Renders:
 *
 *   - runtime.provider_sync from the shared runtime status payload
 *   - the known adapters with capabilities / mode / sandbox posture
 *
 * Metadata / status / capability discovery ONLY. No mutation, no credentials
 * view, no rotate-credentials / test-connection / add-adapter / provider-sync
 * -trigger affordance. provider_writes_enabled is surfaced as a posture flag,
 * never a toggle.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw, Wrench } from 'lucide-react';
import * as finance from '@/api/finance';

export default function SandboxAdapterPanel({ status, tenantId }) {
  const providerSync = status?.runtime?.provider_sync;
  const [state, setState] = useState({ adapters: [], loading: false, error: null });

  const load = useCallback(
    async (signal) => {
      if (!tenantId) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await finance.getAdapters(tenantId, { signal });
        if (signal?.aborted) return;
        setState({
          adapters: Array.isArray(data?.adapters) ? data.adapters : [],
          loading: false,
          error: null,
        });
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        setState({ adapters: [], loading: false, error: err });
      }
    },
    [tenantId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  return (
    <div className="space-y-3" data-testid="finance-sandbox-adapter-panel">
      <Card className="border-border bg-card text-foreground">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div className="flex flex-row items-start gap-3">
            <Wrench
              className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Sandbox adapter
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Read-only metadata for the accounting adapters the runtime knows about. Capability /
                status / posture discovery only — no provider-write, sync, or credential action.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={state.loading}
            data-testid="finance-sandbox-adapter-refresh"
            aria-label="Refresh adapters"
            className="border-border bg-muted text-foreground hover:bg-accent"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="ml-1.5 text-xs">Refresh</span>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground">
          <div
            data-testid="finance-sandbox-adapter-provider-sync"
            data-provider-sync={providerSync || 'unknown'}
            className="flex items-center justify-between rounded-md border border-border bg-muted px-3 py-2"
          >
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Provider sync
            </span>
            <span className="text-sm font-medium text-foreground">
              {providerSync || <span className="text-muted-foreground">unknown</span>}
            </span>
          </div>

          {state.error ? (
            <div
              data-testid="finance-sandbox-adapter-error"
              className="rounded-md border border-red-300 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-100"
            >
              <div className="font-medium">Could not load adapters.</div>
              <p className="mt-1 text-xs text-red-700/80 dark:text-red-200/80">
                {state.error.message || 'Unknown error.'} (status {state.error.status ?? '—'})
              </p>
            </div>
          ) : state.adapters.length === 0 ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="finance-sandbox-adapter-empty"
            >
              {state.loading ? 'Loading…' : 'No adapters registered.'}
            </p>
          ) : (
            <ul className="space-y-2" data-testid="finance-sandbox-adapter-list">
              {state.adapters.map((a) => (
                <li
                  key={a.name}
                  data-testid={`finance-sandbox-adapter-item-${a.name}`}
                  className="rounded-md border border-border bg-muted px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{a.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {a.kind} · {a.status}
                    </span>
                  </div>
                  <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <div>
                      <dt className="inline text-muted-foreground">Mode: </dt>
                      <dd className="inline">{a.mode}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Provider writes: </dt>
                      <dd
                        className="inline"
                        data-testid={`finance-sandbox-adapter-writes-${a.name}`}
                      >
                        {a.provider_writes_enabled ? 'enabled' : 'disabled'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Production allowed: </dt>
                      <dd className="inline">{a.production_allowed ? 'yes' : 'no'}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Guarded to: </dt>
                      <dd className="inline">{a.base_url_guarded_to}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="inline text-muted-foreground">Capabilities: </dt>
                      <dd className="inline">{(a.capabilities || []).join(', ') || '—'}</dd>
                    </div>
                    {Array.isArray(a.unsupported) && a.unsupported.length > 0 ? (
                      <div className="col-span-2">
                        <dt className="inline text-muted-foreground">Unsupported: </dt>
                        <dd className="inline">{a.unsupported.join(', ')}</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              ))}
            </ul>
          )}

          <p
            className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
            data-testid="finance-sandbox-adapter-posture-note"
          >
            Sandbox-only enforcement is structural at{' '}
            <code className="rounded bg-card px-1">erpnextSandboxAdapter.js:89-128</code> —
            production endpoints are blocked at the URL guard regardless of any UI state.
            FINANCE_PROVIDER_WRITES_ENABLED default-closed posture is preserved.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
