# Finance Ops — Beta Integrity Slice (Verification-First) — Design

**Date:** 2026-05-31
**Branch:** `feat/finance-ops-beta-implementation`
**Packet:** Finance Ops beta-readiness pivot — "Beta Integrity & Export Readiness" (Slack `#development` ts `1780248478.502589`)
**Status:** Design — uncommitted, holding for Codex review + Andrei authorization.

---

## 1. Why this slice

The beta bar was re-pivoted: beta readiness is **not** external accounting-system integration. It is
**accounting integrity** — accuracy, consistency, immutability, accountability (GAAP/SAP-aligned) — plus
export-based recordkeeping as a _follow-up_. Andrei's steer: _"Doesn't make sense to do export first
without knowing if the numbers are being captured correctly. Reports always come afterwards."_

So this slice establishes **trust in the numbers**. It does not add export. It does not add endpoints.

## 2. Audit findings on current `main` (post Read-API Slice 1)

| Area                                 | State                        | Evidence                                                                                                                                                                                                       |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double-entry engine                  | ✅ Correct                   | `backend/lib/finance/accountingEngine.js`: `validateJournalLines` (debits==credits, no both/neither), `buildLedger` counts **only** `posted`/`reversed`, P&L + balance sheet with `is_balanced` equation check |
| Ledger/P&L/balance-sheet UI          | ✅ Formats clearly           | `src/components/finance/LedgerSummary.jsx`: cents→USD, per-account balances, totals, net income, Balanced row                                                                                                  |
| End-to-end number parity             | ⚠️ **Unproven**              | Each layer tested in isolation; nothing locks seed → engine → API → rendered figure agreement                                                                                                                  |
| Error masking                        | ⚠️ **Can hide a calc error** | `LedgerSummary` `is_balanced !== false` defaults to "Balanced: Yes" when the field is absent / sheet failed to load                                                                                            |
| Beta integrity doc + limitations doc | ⚠️ **Missing**               | none under `docs/architecture/finance/`                                                                                                                                                                        |

Conclusion: the math is right; what's missing is **proof** the operator sees the source of truth, a guard so
errors can't be silently shown as healthy, and honest documentation of what is/ isn't covered for beta.

## 3. Scope (Approach A, approved)

In scope:

1. **Number-parity test suite** (backend + frontend).
2. **Small UI integrity hardening** in `LedgerSummary` so an unbalanced/failed sheet is visibly flagged.
3. **Beta-integrity checklist doc** (4 principles → enforcement point → evidence, implemented-vs-deferred honest).
4. **Beta-limitations doc** (explicit deferrals).
5. **CHANGELOG** update.

Out of scope (explicit, deferred follow-ups): CSV export, PDF export, evidence-pack file download,
projection/cursors endpoint, persistent-events route lift, provider writes.

## 4. Components & changes

### 4.1 Tests — accuracy & consistency parity

- **Backend** `backend/__tests__/lib/finance/accountingEngine.integrity.test.js` (new):
  seed a known fixture set of journal entries spanning `draft`, `pending_approval`, `posted`, `reversed`;
  assert `buildLedger`/`buildProfitAndLoss`/`buildBalanceSheet` totals equal hand-computed expected values;
  assert drafts/pending are **excluded** from the ledger; assert the double-entry invariant
  (Σdebit == Σcredit) and the accounting equation (`assets == liabilities + equity`, `is_balanced === true`).
- **Backend** route parity in `backend/__tests__/routes/finance.v2.read-routes.test.js` (extend):
  the `/ledger`, `/profit-loss`, `/balance-sheet` responses for the seeded tenant equal the engine output
  bit-for-bit (no shape drift between engine and route).
- **Frontend** `src/components/finance/__tests__/LedgerSummary.integrity.test.jsx` (new):
  mock the three GETs with the seeded engine output; assert the **rendered** currency strings equal the
  expected formatted figures (e.g. net income, assets, balanced state) — locking UI == API == source.

### 4.2 UI integrity hardening — `LedgerSummary.jsx`

- Distinguish three balance states instead of a binary "Yes/No that defaults to Yes":
  - sheet present and balanced → "Balanced: Yes";
  - sheet present and `is_balanced === false` → a **visible warning** ("Unbalanced — ledger integrity issue");
  - sheet absent/failed → **do not** assert "Balanced: Yes" (show "—" / unknown, error already surfaced).
- Rationale: satisfies the packet blocker "empty states must not hide calculation errors." Pure display
  logic; no data-shape or backend change.

### 4.3 Docs

- `docs/architecture/finance/finance-ops-beta-integrity-checklist.md` (new): the 4 principles
  (accuracy, consistency, immutability, accountability) each mapped to enforcement point(s) + test/code
  evidence + an honest **Implemented / Partial / Deferred** marker. Export listed as Deferred.
- `docs/architecture/finance/finance-ops-beta-limitations.md` (new): in-memory persistence, runtime.mode
  placeholder (§8.2.9), projection cursors deferred, persistent-events route lift deferred, provider writes
  default-closed, export = next slice.
- `CHANGELOG.md`: entry under `[Unreleased]`.

## 5. Data flow (unchanged contracts)

```
journal entries (in-memory domain store)
   └─ accountingEngine.buildLedger/ProfitAndLoss/BalanceSheet   ← single source of truth
        └─ finance.v2 GET /ledger /profit-loss /balance-sheet   ← pass-through, no recompute
             └─ src/api/finance.js get*()                        ← unwrap { status, data }
                  └─ LedgerSummary.jsx formatCents()             ← display only
```

The slice asserts equality at every arrow. No arrow is modified except the final display-state logic in 4.2.

## 6. Error handling

- Per-section error already isolated via `Promise.allSettled` in `LedgerSummary`. The hardening adds an
  explicit "unknown" balance state when the balance-sheet promise rejects or returns null, so a failed load
  is never rendered as "balanced."

## 7. Testing strategy

- TDD: write each parity test first (red), confirm it fails against any injected discrepancy, then keep
  green. The UI hardening is driven by a failing `LedgerSummary.integrity` assertion for the
  absent/unbalanced cases before the component change.
- Run: `cd backend && npm test` (finance route + lib suites) and `npm run test:run` for the frontend finance
  suite. Lint/format on changed files.

## 8. Hard constraints honored

No POST/PATCH/DELETE; no approve/reject/reverse/replay/retry/cancel/provider-sync; no
`ENABLE_FINANCE_PERSISTENT_EVENTS` / `FINANCE_PROVIDER_WRITES_ENABLED` flip; no staging/Coolify/Doppler
mutation; no migration; no provider writes; no production action. **No commit/push without Andrei
authorization; holding for Codex review.**

## 9. Acceptance

- Parity tests prove engine == route == rendered figures for a known multi-status fixture; drafts/pending
  excluded from ledger; double-entry + accounting-equation invariants asserted.
- `LedgerSummary` never displays "Balanced: Yes" for an absent/failed/unbalanced sheet.
- Checklist + limitations docs present and honest; CHANGELOG updated.
- Full finance backend + frontend suites green; lint/format clean.
