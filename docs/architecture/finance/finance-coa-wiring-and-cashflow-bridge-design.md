# Finance — Chart-of-Accounts wiring, read-only COA tab, and the Cash Flow reporting bridge (design)

**Status:** Design draft (no code). Implementation is gated on review/approval of this shape.
**Author:** Finance Ops
**Date:** 2026-06-05
**Related:** [`finance-ui-slice-1-read-only-console-design.md`](./finance-ui-slice-1-read-only-console-design.md) (tab inventory §6.2, read-only console posture), [`approval-orchestration.md`](./approval-orchestration.md) (AI actor restrictions), [`phase-4-1-persistent-events-projection-reads-design.md`](./phase-4-1-persistent-events-projection-reads-design.md) (persistent vs in-memory).

---

## 1. Goal

Three coherent pieces of one effort:

1. **Wire the chart of accounts (COA) into the write path.** The `finance.accounts` table exists (migration 172: codes, classifications, `account_type`, parent hierarchy, active flag) but is **never populated or referenced** — journal lines identify accounts by free-text `account_name` + `classification`, with the FK `journal_lines.account_id` left null. That is why the console shows **ACCOUNT CODE "—"** and the ledger keys accounts emergently. Wire it so lines resolve to real COA accounts.
2. **Add a read-only Chart-of-Accounts tab** to the Finance Ops console (+ a read endpoint), so the COA master is visible.
3. **Bridge B — a read-only Cash Flow reporting view derived from the finance ledger.** Finance is the source of truth; nothing is written into `cash_flow`, nothing new is written into the ledger.

**Why this ordering:** Bridge B needs to identify *which* accounts are cash/bank to compute cash movement, and `classification` alone can't (Cash and A/R are both `Asset`). The discriminator is the COA's `account_type`. So COA wiring is a soft prerequisite for a correct Bridge B.

## 2. Non-goals (explicitly out of scope)

- **Editable COA manager** (create/rename/deactivate accounts). That is a *write* surface — a separate, admin-gated slice. This design is **read-only** for the COA in the UI.
- **Direction A — Cash Flow → Finance posting.** Rejected earlier: it requires double-entry synthesis, category→account mapping, and mutability→reversal reconciliation, and would force a cash-flow-only tenant into double-entry accounting. We are doing **B only** (finance → read-only cash-flow reporting).
- **Bidirectional sync / reconciliation / dedup** between manual `cash_flow` rows and ledger-derived cash.
- **Provider COA mapping** (QuickBooks/Xero/ERPNext) — an adapter-slice concern, not this design.
- **Backfill** of existing emergent (name-keyed) journal lines into COA account_ids. Finance is in beta with no production ledger data; we start fresh (see §6, open question 5).

## 3. Background — what exists today (verified against code)

- **Schema:** `finance.accounts` (172:7–20) — `account_code` (NOT NULL, `unique(tenant_id, account_code)`), `name`, `classification` CHECK in the five types, `account_type` (NOT NULL), `parent_account_id` self-FK, `is_system`, `is_active`. RLS select/insert/update/delete policies exist (175).
- **Lines:** `finance.journal_lines.account_id uuid references finance.accounts(id)` — **nullable**; `account_name text not null`; `classification … not null check`. So a line *can* reference the COA but isn't required to, and the runtime never populates it.
- **Runtime account identity:** `accountingEngine.js` and `ledgerProjection.js` key each account on `account_id ? \`id:${account_id}\` : \`name:${classification}:${account_name}\``. With `account_id` always null today, identity is the free-text `classification:account_name` — so "Cash" / "cash" / "Cash on Hand" are three distinct accounts.
- **No COA seed** anywhere. `finance.accounts` is empty.
- **Statement derivation** (`accountingEngine.js`) is computed purely from `classification` + balances — that is the irreducible "minimum COA" already enforced (every line must declare one of the five classifications).
- **Console:** read-only tabs frozen by design-freeze §6.2 (Runtime, Ledger summary, Draft invoices, Journal drafts, Journal entries, Approvals, Adapter queue, Audit, Projection, Sandbox, Evidence). No Accounts tab; no `getAccounts` in `src/api/finance.js`.
- **Persistence:** the COA table is persistent (`finance.*`). The default running mode is **in-memory** (`ENABLE_FINANCE_PERSISTENT_EVENTS` off) with no DB — so the design must define in-memory behavior, not just persistent.

## 4. Part A — Wire the COA into the write path

### 4.1 Default COA seed
Introduce a per-tenant **baseline chart** of `is_system = true` accounts, matching the names the existing flows already emit (`simulateDealWon` uses *Accounts Receivable* + *Revenue*; `createJournalDraft` UI uses *Cash* + *Revenue*) plus the minimum needed for balanced books. Proposed baseline (codes illustrative):

| code | name | classification | account_type |
|------|------|----------------|--------------|
| 1000 | Cash | Asset | **Cash** |
| 1100 | Accounts Receivable | Asset | Receivable |
| 2000 | Accounts Payable | Liability | Payable |
| 3000 | Retained Earnings | Equity | Equity |
| 4000 | Revenue | Revenue | Revenue |
| 5000 | Expenses | Expense | Expense |
| 9000 | Uncategorized | Asset | Suspense |

- **`account_type` is the cash discriminator** Bridge B relies on (`Cash`/`Bank`). This is the field that makes §6/Part C robust without name-matching.
- Seed is **idempotent** (keyed on `unique(tenant_id, account_code)`), applied when a tenant first uses finance (persistent mode) and exposed as a **static in-memory default** for in-memory mode.

### 4.2 Account resolution at write time
When `createJournalDraft` / `simulateDealWon` build lines, resolve each line to a COA account:
1. Explicit `account_code` or `account_id` on the input line → use it.
2. Else resolve by (`classification`, `account_name`) against the tenant COA.
3. **On miss** (open question 1, §6): recommended default = **auto-create a non-system account** (`is_system=false`) from the line's name+classification with a generated code, and emit a `finance.account.created` event for traceability — so existing emergent names become real COA rows instead of silently fragmenting. (Alternative strict mode: reject; or map to `Uncategorized`.)
4. Populate `line.account_id` (+ keep the denormalized `account_code` / `account_name` / `classification` on the line for display and audit immutability).

Effect: `ledgerProjection`/`accountingEngine` now key on `id:` → **account fragmentation goes away**, and the **ACCOUNT CODE column fills** in Journal drafts/entries.

### 4.3 Persistence behavior
- **Persistent mode** (`ENABLE_FINANCE_PERSISTENT_EVENTS=true`, migrations applied): COA lives in `finance.accounts`; resolution reads/writes it.
- **In-memory mode** (default): a static in-memory default COA (the §4.1 baseline) backs resolution and the read tab, so the UI is coherent without a DB. Auto-created accounts live only for the process lifetime (consistent with the rest of in-memory finance).

### 4.4 Guardrails unaffected
Defining/seeding accounts is **not money movement** — the `finance.ai.no_money_movement` AI restriction does not apply. Seeding is a `system`-actor / migration action; the auto-create-on-write path inherits the actor of the journal write (and is still subject to the existing approval governance on the *journal*, not the account).

## 5. Part B — Read-only Chart of Accounts tab + endpoint

### 5.1 Backend
`GET /api/v2/finance/accounts` — tenant-scoped, **read-only**, returns `{ accounts: [{ id, account_code, name, classification, account_type, parent_account_id, is_system, is_active }] }`. Honors the same module gate, data-mode (test/live) partition posture, and RLS (`finance_accounts_select`, 175) as the other finance reads. In-memory mode returns the §4.1 static default COA.

### 5.2 Frontend
- Add `getAccounts(tenantId, { signal })` to `src/api/finance.js`.
- New `ChartOfAccountsPanel.jsx` built on the existing `FinanceTablePanel` (read-only chrome, Refresh, CSV export). Columns: **Code**, **Name**, **Classification**, **Type**, **Parent** (shown as parent code/name), **Active**.
- **Tab inventory change (formally extends design-freeze §6.2):** add `{ id: 'accounts', label: 'Chart of accounts' }` to `FINANCE_OPS_TABS`, positioned immediately after **Ledger summary** (it is the master that the ledger aggregates over). This doc records the freeze extension.
- **Read-only:** no create/edit/deactivate affordance — consistent with the console posture (editable manager is a future slice, §2).

## 6. Part C — Bridge B: Finance → read-only Cash Flow reporting view

### 6.1 Principle
Read-only **derivation**. Finance ledger is the source of truth. **No** write into `cash_flow`; **no** new write into the ledger. This preserves the separation-of-duties posture (the reporting view reads the books, it does not write them) and means a **cash-flow-only tenant is never forced into accounting** — if finance isn't enabled for the tenant, this view simply doesn't appear.

### 6.2 Cash account identification
Use the COA **`account_type ∈ {Cash, Bank}`** (Part A) — **not** name-matching. Only **posted** (approved) journal lines on those accounts count. This is the concrete reason Part A precedes Part C.

### 6.3 Derivation
For posted journal lines on cash/bank accounts: **inflow = debits**, **outflow = credits** to those accounts; net = change in cash. Bucket by period; optionally categorize each movement by the *contra* line's classification (cash from Revenue vs cash to Expense) to approximate operating cash flow. Pure read over the existing ledger projection + COA.

### 6.4 Surface (open question 3, §6)
Recommended: surface inside the existing **Cash Flow page** as a clearly-labeled, **read-only "From Finance ledger"** section, kept visually distinct from the manually-entered `cash_flow` rows. So:
- A tenant using **both** sees ledger-derived cash movement without it polluting their manual tracker.
- A **finance-only** tenant gets a real cash view.
- A **cash-flow-only** tenant (finance disabled) never sees it and keeps their simple tracker.

### 6.5 Endpoint
`GET /api/v2/finance/cash-flow` (read-only, tenant-scoped) — derived from posted journals + COA cash accounts, period-bucketed. A dedicated backend derivation endpoint (vs client-side from `getLedger` + `getAccounts`) is preferred for correct posted-only filtering and period math.

### 6.6 Non-goals
No reconciliation/dedup between manual `cash_flow` rows and ledger-derived cash; they are separate views. No writes.

## 7. Cross-cutting constraints

- **Read-only console preserved.** Parts B and C are read-only. The only write change is Part A, and it is to the *existing* journal write path (resolving account_id), not a new user-facing write surface.
- **AI guardrail untouched.** COA definition/seed is admin/system, not AI money movement.
- **Persistence honesty.** Full fidelity needs persistent finance + migrations 172–179 applied; in-memory degrades gracefully (static default COA; Bridge B derives from in-memory posted journals).
- **Data mode (test/live).** COA reads and the derived cash-flow view honor the partition like other finance reads.

## 8. Suggested slicing (each PR-sized)

- **Slice 1 — COA wired + visible:** §4.1 seed + §4.2 resolution into the write path + §5 read endpoint + read-only tab. Acceptance: a posted journal shows real account codes; the Chart-of-Accounts tab lists the COA; ledger groups by `account_id`.
- **Slice 2 — Bridge B:** §6 derived cash-flow endpoint + the read-only "From Finance ledger" section on the Cash Flow page. Acceptance: a finance tenant sees ledger-derived cash inflow/outflow; a cash-flow-only tenant is unaffected.

## 9. Open questions — RESOLVED (review decision, PR #643 comment, 2026-06-05)

All five answered by the review (Codex/GPT) on PR #643 (`#issuecomment-4633419140`); each aligns with the design's recommendation.

1. **Resolution-on-miss policy → AUTO-CREATE.** On a miss, auto-create a tenant-scoped **non-system** account (`is_system=false`) from a **deterministically normalized** `account_name` + `classification`, with a **generated reserved-range code** and traceability/audit metadata where available. Do **not** reject by default; do **not** silently map to `Uncategorized`.
2. **Default seed → LAZY + IDEMPOTENT per tenant.** Persistent mode writes the §4.1 baseline to `finance.accounts`; in-memory mode uses a static ephemeral baseline and **must not pretend persistence exists**.
3. **COA UI → READ-ONLY FIRST.** Implement `GET /api/v2/finance/accounts` + a read-only Chart-of-Accounts tab. Editable COA manager deferred.
4. **Bridge → B ONLY.** Finance → read-only derived cash-flow reporting from posted journals. No `cash_flow` → ledger posting; no bidirectional sync.
5. **Backfill → NONE in Slice 1.** Existing emergent/free-text lines keep fallback display. Any backfill is a **separate reviewed, tenant-scoped, dry-run-capable** packet.

**Beta posture (confirmed):** COA wiring is **not** a read-only-beta blocker now that the gap is disclosed (beta limitation #9) — it is a **production-readiness prerequisite + fast-follow** before persistent/live/provider activation.

**`account_type` vocabulary (carried into Slice 1):** the §4.1 baseline uses `Cash, Receivable, Payable, Equity, Revenue, Expense, Suspense`; `account_type ∈ {Cash, Bank}` is the cash discriminator for Bridge B. The full controlled list is finalized in the Slice 1 implementation plan.

## 10. Acceptance — APPROVED (2026-06-05)

- [x] COA wiring approach (seed + write-path resolution + persistence split) approved.
- [x] Read-only Chart-of-Accounts tab + endpoint placement approved (incl. the §6.2 freeze extension).
- [x] Bridge B read-only derivation + surface placement approved.
- [x] Open questions §9 answered (review decision above).
- [x] Slicing (§8) accepted as the implementation order (Slice 1 = COA seed + resolution + read-only tab; Slice 2 = Bridge B).

> **Design APPROVED.** Next step: an implementation plan (writing-plans) for **Slice 1**, then build. Guardrails hold: no provider writes, no production action, no mutation UI beyond the already-authorized test-mode helpers, no persistent/live/provider activation drift.
