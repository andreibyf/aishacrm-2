/**
 * ChartOfAccountsPanel — editable Chart of Accounts manager (design
 * 2026-06-06, Phase 5 / Tasks 17-19). Was read-only (COA Slice 1); now lets an
 * admin create, edit, deactivate and reactivate accounts.
 *
 * AUTHORITY: the SERVER enforces every lock rule (system-locked, posted-history
 * field locks, nonzero-balance, uniqueness, AI-blocked, RBAC) and returns a
 * stable `FINANCE_COA_*` code on failure (design §6). The disabling / hiding
 * here is PRESENTATION ONLY — it mirrors the server rules to guide the operator,
 * never to gate the write. Rejections are surfaced via the mapped error message.
 *
 * Lock rendering (design §2/§4), driven by per-account flags from GET /accounts
 * (is_system, has_posted_history, is_active):
 *   - is_system            → no edit / deactivate affordance at all.
 *   - has_posted_history    → classification + account_code inputs DISABLED;
 *                             name + account_type editable; a reason is required.
 *   - no history            → all fields editable; reason optional.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw, PlusCircle, Loader2 } from 'lucide-react';
import * as finance from '@/api/finance';
import {
  createAccount,
  updateAccount,
  deactivateAccount,
  reactivateAccount,
} from '@/api/financeWrites';

// Curated, closed account_type enum per classification (design §2). KEEP IN SYNC
// with backend/lib/finance/chartOfAccounts.js `ACCOUNT_TYPES_BY_CLASSIFICATION`
// (the server is the authority — `isValidAccountType` re-validates every write).
// The generic per-classification type is listed first so it reads as the default.
const ACCOUNT_TYPES_BY_CLASSIFICATION = {
  Asset: ['Asset', 'Cash', 'Bank', 'Receivable', 'Suspense'],
  Liability: ['Liability', 'Payable'],
  Equity: ['Equity'],
  Revenue: ['Revenue'],
  Expense: ['Expense'],
};

const CLASSIFICATIONS = Object.keys(ACCOUNT_TYPES_BY_CLASSIFICATION);

// Map a backend FINANCE_COA_* code (design §6) to a human message for the panel.
// An unknown code falls back to the backend message (or a generic line).
const COA_ERROR_MESSAGES = {
  FINANCE_COA_ACCOUNT_NOT_FOUND: 'That account no longer exists.',
  FINANCE_COA_INVALID_CLASSIFICATION: 'Pick a valid classification.',
  FINANCE_COA_INVALID_ACCOUNT_TYPE: 'That account type is not valid for the chosen classification.',
  FINANCE_COA_INVALID_NAME: 'Enter an account name.',
  FINANCE_COA_DUPLICATE_NAME: 'An account with that name already exists in this classification.',
  FINANCE_COA_DUPLICATE_CODE: 'That account code is already in use.',
  FINANCE_COA_SYSTEM_ACCOUNT_LOCKED: 'System accounts cannot be changed.',
  FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY:
    'Classification and code are locked once an account has posted history.',
  FINANCE_COA_DEACTIVATE_NONZERO_BALANCE:
    'This account has a nonzero posted balance and cannot be deactivated.',
  FINANCE_COA_REASON_REQUIRED: 'A reason is required for this change.',
  FINANCE_COA_NOT_INACTIVE: 'That account is already active.',
  FINANCE_COA_REACTIVATE_CONFLICT:
    'Reactivation conflicts with an active account on code or name.',
  FINANCE_COA_AI_FORBIDDEN: 'AI assistants cannot manage the chart of accounts.',
  FINANCE_COA_FORBIDDEN: 'You do not have permission to manage the chart of accounts.',
};

function messageForError(err) {
  if (err?.code && COA_ERROR_MESSAGES[err.code]) return COA_ERROR_MESSAGES[err.code];
  return err?.message || 'The change could not be saved.';
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500 disabled:opacity-50';
const yesNo = (v) => (v ? 'Yes' : 'No');

function defaultTypeFor(classification) {
  return (ACCOUNT_TYPES_BY_CLASSIFICATION[classification] || [])[0] || '';
}

export default function ChartOfAccountsPanel({ tenantId }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(
    async (signal) => {
      if (!tenantId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const data = await finance.getAccounts(tenantId, { signal });
        if (signal?.aborted) return;
        setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        setLoadError(err);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Run a mutation, then refresh the list (FinanceCreatePanel pattern). On a
  // rejection, surface the mapped FINANCE_COA_* message and keep the form open.
  async function runMutation(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(messageForError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const visible = showInactive ? accounts : accounts.filter((a) => a.is_active !== false);

  return (
    <div data-testid="finance-chart-of-accounts-panel">
      <Card className="border-slate-700/40 bg-slate-900/60 text-slate-100">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base font-semibold text-slate-100">
              Chart of accounts
            </CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Create, edit and deactivate accounts. System accounts are locked; an account with
              posted history keeps its classification and code. The server enforces every rule.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                data-testid="coa-show-inactive"
              />
              Show inactive
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={loading}
              data-testid="finance-chart-of-accounts-refresh"
              aria-label="Refresh chart of accounts"
              className="border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700"
            >
              <RefreshCcw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="ml-1.5 text-xs">Refresh</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div
              data-testid="coa-error"
              className="rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-200"
            >
              {error}
            </div>
          ) : null}

          <CreateAccountForm
            busy={busy}
            onCreate={(payload) => runMutation(() => createAccount(tenantId, payload))}
          />

          {loadError ? (
            <div
              data-testid="finance-chart-of-accounts-error"
              className="rounded-md border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-100"
            >
              <div className="font-medium">Could not load chart of accounts.</div>
              <p className="mt-1 text-xs text-red-200/80">
                {loadError.message || 'Unknown error.'} (status {loadError.status ?? '—'})
              </p>
            </div>
          ) : loading && accounts.length === 0 ? (
            <p className="text-xs text-slate-400" data-testid="finance-chart-of-accounts-loading">
              Loading…
            </p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-slate-400" data-testid="finance-chart-of-accounts-empty">
              No accounts for this tenant yet.
            </p>
          ) : (
            <table className="w-full text-xs" data-testid="finance-chart-of-accounts-table">
              <thead>
                <tr className="border-b border-slate-700/60 text-left text-slate-400">
                  <th className="py-2 pr-3 font-medium uppercase tracking-wide">Code</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wide">Name</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wide">Classification</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wide">Type</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wide">System</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wide">Active</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <AccountRow
                    key={row.id}
                    account={row}
                    busy={busy}
                    isEditing={editingId === row.id}
                    onEdit={() => {
                      setError(null);
                      setEditingId(row.id);
                    }}
                    onCancel={() => setEditingId(null)}
                    onSave={async (payload) => {
                      const ok = await runMutation(() => updateAccount(tenantId, row.id, payload));
                      if (ok) setEditingId(null);
                    }}
                    onDeactivate={(reason) =>
                      runMutation(() => deactivateAccount(tenantId, row.id, { reason }))
                    }
                    onReactivate={(reason) =>
                      runMutation(() => reactivateAccount(tenantId, row.id, { reason }))
                    }
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateAccountForm({ busy, onCreate }) {
  const [name, setName] = useState('');
  const [classification, setClassification] = useState('Asset');
  const [accountType, setAccountType] = useState(defaultTypeFor('Asset'));

  const types = ACCOUNT_TYPES_BY_CLASSIFICATION[classification] || [];

  function onClassificationChange(value) {
    setClassification(value);
    // Reset the type to the (valid) default for the new classification so the
    // pair can never be submitted invalid.
    setAccountType(defaultTypeFor(value));
  }

  async function onSubmit(e) {
    e.preventDefault();
    const ok = await onCreate({ name, classification, account_type: accountType });
    if (ok) {
      setName('');
      setClassification('Asset');
      setAccountType(defaultTypeFor('Asset'));
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="coa-create-form"
      className="grid grid-cols-1 gap-2 rounded-md border border-slate-700/40 bg-slate-800/30 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
    >
      <label className="text-xs text-slate-400">
        Account name
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Operating Bank"
          data-testid="coa-create-name"
        />
      </label>
      <label className="text-xs text-slate-400">
        Classification
        <select
          className={inputCls}
          value={classification}
          onChange={(e) => onClassificationChange(e.target.value)}
          data-testid="coa-create-classification"
        >
          {CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-400">
        Account type
        <select
          className={inputCls}
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
          data-testid="coa-create-type"
        >
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="submit"
        disabled={busy}
        data-testid="coa-create-submit"
        className="bg-amber-600 text-white hover:bg-amber-700"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <>
            <PlusCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
            New account
          </>
        )}
      </Button>
    </form>
  );
}

function AccountRow({
  account,
  busy,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDeactivate,
  onReactivate,
}) {
  const isSystem = Boolean(account.is_system);
  const hasHistory = Boolean(account.has_posted_history);
  const isActive = account.is_active !== false;

  if (isEditing && !isSystem) {
    return (
      <EditAccountRow
        account={account}
        busy={busy}
        hasHistory={hasHistory}
        onCancel={onCancel}
        onSave={onSave}
      />
    );
  }

  return (
    <tr
      className="border-b border-slate-700/40 last:border-b-0"
      data-testid={`coa-row-${account.id}`}
    >
      <td className="py-1.5 pr-3 text-slate-100">{account.account_code || '—'}</td>
      <td className="py-1.5 pr-3 text-slate-100">{account.name || '—'}</td>
      <td className="py-1.5 pr-3 text-slate-100">{account.classification || '—'}</td>
      <td className="py-1.5 pr-3 text-slate-100">{account.account_type || '—'}</td>
      <td className="py-1.5 pr-3 text-slate-100">{yesNo(isSystem)}</td>
      <td className="py-1.5 pr-3 text-slate-100">{yesNo(isActive)}</td>
      <td className="py-1.5 pr-3 text-slate-100">
        {isSystem ? (
          <span className="text-slate-500" data-testid={`coa-row-locked-${account.id}`}>
            Locked
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              data-testid={`coa-edit-${account.id}`}
              className="text-sky-300 hover:underline disabled:opacity-50"
            >
              Edit
            </button>
            {isActive ? (
              <ReasonAction
                account={account}
                busy={busy}
                action="deactivate"
                label="Deactivate"
                onConfirm={onDeactivate}
              />
            ) : (
              <ReasonAction
                account={account}
                busy={busy}
                action="reactivate"
                label="Reactivate"
                onConfirm={onReactivate}
              />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// Inline edit row. Per design §2: a posted-history account locks classification +
// code (disabled) and requires a reason; a no-history account is fully editable
// with an optional reason. The server re-validates everything.
function EditAccountRow({ account, busy, hasHistory, onCancel, onSave }) {
  const [name, setName] = useState(account.name || '');
  const [classification, setClassification] = useState(account.classification || 'Asset');
  const [accountType, setAccountType] = useState(account.account_type || '');
  const [code, setCode] = useState(account.account_code || '');
  const [reason, setReason] = useState('');

  const types = ACCOUNT_TYPES_BY_CLASSIFICATION[classification] || [];

  function onClassificationChange(value) {
    setClassification(value);
    if (!ACCOUNT_TYPES_BY_CLASSIFICATION[value]?.includes(accountType)) {
      setAccountType(defaultTypeFor(value));
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    const payload = { name, account_type: accountType };
    if (!hasHistory) {
      payload.classification = classification;
      payload.account_code = code;
    }
    if (reason.trim() !== '') payload.reason = reason.trim();
    onSave(payload);
  }

  return (
    <tr
      className="border-b border-slate-700/40 bg-slate-800/40 last:border-b-0"
      data-testid={`coa-edit-row-${account.id}`}
    >
      <td className="py-1.5 pr-3" colSpan={7}>
        <form
          onSubmit={onSubmit}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          data-testid={`coa-edit-form-${account.id}`}
        >
          <label className="text-xs text-slate-400">
            Name
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid={`coa-edit-name-${account.id}`}
            />
          </label>
          <label className="text-xs text-slate-400">
            Classification
            <select
              className={inputCls}
              value={classification}
              onChange={(e) => onClassificationChange(e.target.value)}
              disabled={hasHistory}
              data-testid={`coa-edit-classification-${account.id}`}
            >
              {CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Account type
            <select
              className={inputCls}
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              data-testid={`coa-edit-type-${account.id}`}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Account code
            <input
              className={inputCls}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={hasHistory}
              data-testid={`coa-edit-code-${account.id}`}
            />
          </label>
          {hasHistory ? (
            <label className="text-xs text-slate-400">
              Reason (required)
              <input
                className={inputCls}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you changing this account?"
                data-testid={`coa-edit-reason-${account.id}`}
              />
            </label>
          ) : null}
          <div className="flex items-end gap-2">
            <Button
              type="submit"
              disabled={busy}
              data-testid={`coa-edit-save-${account.id}`}
              className="bg-emerald-700 text-white hover:bg-emerald-800"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={busy}
              data-testid={`coa-edit-cancel-${account.id}`}
              className="border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700"
            >
              Cancel
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

// A deactivate / reactivate control that collects a required reason inline before
// firing. The server requires the reason; this prompts for it client-side.
function ReasonAction({ account, busy, action, label, onConfirm }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        data-testid={`coa-${action}-${account.id}`}
        className="text-amber-300 hover:underline disabled:opacity-50"
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        className="rounded-md border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-100"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        data-testid={`coa-${action}-reason-${account.id}`}
      />
      <button
        type="button"
        disabled={busy || reason.trim() === ''}
        onClick={async () => {
          const ok = await onConfirm(reason.trim());
          if (ok) {
            setOpen(false);
            setReason('');
          }
        }}
        data-testid={`coa-${action}-confirm-${account.id}`}
        className="text-emerald-300 hover:underline disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setReason('');
        }}
        data-testid={`coa-${action}-cancel-${account.id}`}
        className="text-slate-400 hover:underline"
      >
        Cancel
      </button>
    </span>
  );
}
