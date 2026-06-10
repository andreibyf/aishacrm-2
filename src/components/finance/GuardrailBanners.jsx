/**
 * GuardrailBanners (UI Slice 1 / UI-1B)
 *
 * Four persistent informational banners stacked above the Finance Operations
 * page tab strip. Each banner makes one of the Finance v2 Slice 1 guardrails
 * visible to operators / admins so degraded / disabled / sandbox-only state
 * cannot be hidden by the UI. None of the banners carry a mutating action
 * affordance — they are observation-only.
 *
 * Banner inventory (design freeze §10):
 *   §10.1  Persistent events fail-closed
 *          Rendered while runtime.persistence === 'in_memory'.
 *   §10.2  Provider writes default-closed
 *          Rendered while runtime.provider_sync === 'disabled'.
 *   §10.3  Sandbox-only adapter
 *          Rendered unconditionally (sandbox-only is a Slice 1 / Phase 3
 *          invariant, structurally enforced in erpnextSandboxAdapter.js:89-128).
 *   §10.4  Production activation not authorized
 *          Rendered unconditionally for all tenants in Slice 1 (the backend
 *          does not yet publish a per-tenant production_authorization signal,
 *          so the conservative default is to surface the posture everywhere).
 *
 * Each banner is dismissible per browser session via sessionStorage. The
 * dismiss state lives entirely in sessionStorage — no server-side
 * persistence, no per-user tracking — matching design freeze §10.5.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Info, Lock, ShieldCheck, X } from 'lucide-react';

const DISMISS_STORAGE_PREFIX = 'aishacrm:finance-ops:banner-dismissed:';
const BANNER_DEFS = [
  {
    id: 'persistent-events-fail-closed',
    designRef: '§10.1',
    icon: Lock,
    title: 'Persistent events are disabled',
    body: 'The finance runtime is using in-memory state per backend process. Counts and lists reset on backend restart. Persistent-events activation requires a separate route lift coordinated with backend Phase 4 planning.',
    isActive: (status) => status?.runtime?.persistence !== 'postgres-projection',
  },
  {
    id: 'provider-writes-default-closed',
    designRef: '§10.2',
    icon: ShieldCheck,
    title: 'Provider writes are disabled by default',
    body: 'The adapter runtime drafts payloads but never sends them to ERPNext / QuickBooks / Xero / NetSuite. Flipping this requires FINANCE_PROVIDER_WRITES_ENABLED=true and is controlled by backend gates only.',
    isActive: (status) => status?.runtime?.provider_sync !== 'enabled',
  },
  {
    id: 'sandbox-only-adapter',
    designRef: '§10.3',
    icon: Info,
    title: 'Adapter is sandbox-only',
    body: 'Only ERPNext sandbox base_url values are allowed. Production endpoints are structurally blocked at erpnextSandboxAdapter.js:89-128 — this banner cannot be made false by any UI action.',
    isActive: () => true,
  },
  {
    id: 'production-activation-not-authorized',
    designRef: '§10.4',
    icon: AlertTriangle,
    title: 'Production activation is not authorized',
    body: 'This tenant is in the staging / pilot-planning posture per Phase 3-14. Any production write attempt would be blocked structurally at the adapter URL guard. Pilot activation is gated separately by Phase 4-20.',
    isActive: () => true,
  },
];

function readDismissed(id) {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage?.getItem(`${DISMISS_STORAGE_PREFIX}${id}`) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(id) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(`${DISMISS_STORAGE_PREFIX}${id}`, '1');
  } catch {
    // sessionStorage may be unavailable in some privacy modes — ignore.
  }
}

function Banner({ def, onDismiss }) {
  const Icon = def.icon;
  return (
    <div
      data-testid={`finance-guardrail-banner-${def.id}`}
      data-design-ref={def.designRef}
      className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-100"
    >
      <Icon
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-300"
        aria-hidden="true"
      />
      <div className="flex-1">
        <div className="font-medium text-amber-900 dark:text-amber-100">
          {def.title}{' '}
          <span className="text-xs font-normal text-amber-700/80 dark:text-amber-300/80">
            ({def.designRef})
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          {def.body}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(def.id)}
        aria-label={`Dismiss ${def.title} for this session`}
        className="rounded p-1 text-amber-700/70 transition hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200/70 dark:hover:bg-amber-900/30 dark:hover:text-amber-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * GuardrailBanners renders the four-banner stack above the Finance Ops page
 * tabs. Banner visibility is driven by:
 *   1. The banner's `isActive(status)` predicate against the runtime status
 *   2. The per-session dismiss state in sessionStorage
 *
 * Props:
 *   - status: the runtime status response from finance.getRuntimeStatus(),
 *             may be null while loading or after an error. Banners whose
 *             isActive predicate evaluates to true for null status are still
 *             shown so the conservative posture remains visible even before
 *             the runtime status request completes.
 */
export default function GuardrailBanners({ status = null }) {
  // Track which banners the user has dismissed this session. Initial state
  // is read synchronously from sessionStorage to avoid a one-frame flash of
  // the previously-dismissed banners on re-mount.
  const [dismissed, setDismissed] = useState(() => {
    const initial = {};
    for (const def of BANNER_DEFS) {
      initial[def.id] = readDismissed(def.id);
    }
    return initial;
  });

  // Re-read on mount in case sessionStorage was updated by another tab in the
  // same session (e.g. user opened Finance Ops in two tabs and dismissed in
  // one). useEffect is safe because the initial state above already populated
  // from sessionStorage; this only adjusts for cross-tab updates.
  useEffect(() => {
    setDismissed((prev) => {
      const next = { ...prev };
      for (const def of BANNER_DEFS) {
        const stored = readDismissed(def.id);
        if (next[def.id] !== stored) {
          next[def.id] = stored;
        }
      }
      return next;
    });
  }, []);

  const handleDismiss = (id) => {
    writeDismissed(id);
    setDismissed((prev) => ({ ...prev, [id]: true }));
  };

  const visible = BANNER_DEFS.filter((def) => def.isActive(status) && !dismissed[def.id]);

  if (visible.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="finance-guardrail-banners"
      className="flex flex-col gap-2"
      aria-label="Finance Operations guardrail status"
    >
      {visible.map((def) => (
        <Banner key={def.id} def={def} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}

// Exported for tests so they can assert against the full definition set
// without re-deriving it from rendered DOM. Keeping it as a named export
// prevents the default-export shape from leaking implementation details.
export { BANNER_DEFS as __BANNER_DEFS_FOR_TESTS };
