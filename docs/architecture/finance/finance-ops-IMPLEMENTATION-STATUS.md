# Finance Ops — Implementation Status (living document)

> **Purpose:** the single authoritative "what is actually implemented" reference for the Finance Ops module, for anyone (incl. external reviewers like Codex/GPT) getting up to speed. The per-slice design docs in this folder describe *intended* designs; **this doc describes what is merged and running.** When they disagree, code + this doc win.
>
> **Maintenance:** update this file in the same PR as any finance change. It complements — does not replace — `CHANGELOG.md` (detailed per-change log) and the Slack "Finance Ops Canvas" (ChatGPT-maintained coordination view).
>
> **Last updated:** 2026-06-05 (through PR #642 merged; PR #643 open as design-only).

---

## 1. TL;DR — current posture

- **Read-only Finance Ops console is live** (`/FinanceOps`) — 11 tabs, all read-only, behind the per-tenant `financeOps` module gate + RBAC.
- **The event-sourced accounting core is implemented** (double-entry journals, projections, audit trail, approvals, adapter jobs) and runs in **in-memory mode by default**.
- **Persistent durability is built but OFF by default.** `ENABLE_FINANCE_PERSISTENT_EVENTS=false` everywhere → ephemeral in-memory event store. Setting it `true` requires a Postgres pool **and** migrations 172–179 applied (the route fail-closes otherwise).
- **No provider writes.** `FINANCE_PROVIDER_WRITES_ENABLED=false` (dominant kill switch); the ERPNext adapter is sandbox/draft-only.
- **AI cannot move money.** `ai_agent` actors are draft/read-only and unconditionally blocked from approving or posting (`finance.ai.no_money_movement`).
- **No production action taken.** No staging/Coolify/Doppler mutation, no migration applied to staging/prod, no env flips — across the entire arc.

## 2. What is MERGED to `main`

| PR | Title (short) | What it delivered |
|----|---------------|-------------------|
| #618 | Finance Ops runtime + adapter lifecycle + read-only UI baseline | Event-sourced core, adapter lifecycle, the read-only console shell. |
| #621 | Phase 4 production-pilot planning baseline | Phase-4 design-freeze docs (planning only). |
| #623 | Read API slice 1 | Wired the read endpoints (`/runtime/status`, ledger/P&L/balance-sheet, drafts, approvals, adapter-jobs, audit-events, …). |
| #625 | Operator Copy Guide (design freeze) | Operator-facing copy/labels design. |
| #626 | RBAC & Access Matrix (design freeze) | Per-role access matrix design. |
| #627 | Beta integrity slice | Number-parity tests + ledger balance hardening. |
| #628 | Beta CSV exports | Read-only CSV export on the console panels. |
| #631 / #632 | Phase 4-1 route lift | Read-adapter selection (`InMemory` vs `ProjectionBacked`) chosen once at construction; fail-closed when persistent + no pool. |
| **#633** | **Phase 4-1 persistent reads+writes migration** | `ENABLE_FINANCE_PERSISTENT_EVENTS=true` is durable end-to-end (read-your-write); projections back the reads; adapter jobs materialize. Adds migrations 172–179. Removed the #632 boot guard. |
| **#634** | **Per-tenant Test/Live data mode** | Superadmin-controlled `finance_data_mode` (test\|live) in `modulesettings`; `is_test_data` partition; default-closed to `test`; in-memory clamped to `test`. |
| #635 | Superadmin gate on cleanup-test-data | `POST /api/testing/cleanup-test-data` now requires superadmin (was unauthenticated). |
| #636 / #640 | User-mgmt fixes | `nav_permissions` save fix + bearer auth on raw fetches (landed in the same arc; not finance-core). |
| #641 | CI cleanup | Retired the never-passing `api-schema-tests.yml`; schema-validation runs via `e2e.yml`; fixed migration 030 `log_type`→`level`. |
| #642 | Amount display | Finance tables show `2,500.00` instead of raw `250000` cents (storage stays in cents). |
| **#643** | COA wiring + Chart-of-Accounts tab + Cash Flow bridge | **DESIGN ONLY (open, not implemented).** See §7. |

## 3. Architecture (implemented)

**Event-sourced + CQRS.** Every finance action is an immutable event on `finance.audit_events` (append-only, enforced by triggers). Read models are **projections** rebuilt from the event stream.

- **Event stores (dual):** `financeEventStore.js` (in-memory, default) and `financeEventStore.pg.js` (Postgres, gated). Both share the same interface; replay order is `(created_at, seq)`.
- **Projections** (`backend/lib/finance/projections/`): `ledgerProjection`, `journalEntriesProjection`, `invoiceProjection`, `approvalQueueProjection`, `adapterQueueProjection`, `auditTimelineProjection`, driven by `projectionRunner`. Projection store is `projectionStore.memory.js` or `projectionStore.pg.js` (`finance.projection_state`).
- **Read adapters** (`backend/lib/finance/readAdapters/`): `inMemoryFinanceReadAdapter` (default) and `projectionBackedFinanceReadAdapter` (persistent). Selected once at route construction (deploy-time, no per-request swap). Persistent read failure → 503, never silent in-memory fallback.
- **Persistent write path:** `persistentWriteRunner.js` (hydrate → run command → advance/rebuild affected projections for read-your-write), `persistentAdapterJobWriter.js` (materializes draft adapter jobs), `financeDomainReplay.js` (rebuild bucket from events).
- **Domain service:** `financeDomainService.js` exposes the commands: `createDraftInvoice`, `updateDraftInvoice`, `createJournalDraft`, `simulateDealWon`, `reverseJournalEntry`, `approveFinanceAction`, plus reads.
- **Accounting engine:** `accountingEngine.js` derives trial balance / P&L / balance sheet **purely from line `classification` + balances**.
- **Governance:** `financeGovernanceDecision.js` evaluates each command (risk level, approval requirement, AI-actor block) and records provenance (`prompt_hash`, `braid_trace_id`).
- **Adapters:** `accountingAdapters/erpnextSandboxAdapter.js` (sandbox/draft-only), `adapterJobProcessor.js` (drains `finance.adapter_jobs`; provider writes default-closed).

### 3.1 Data model (schema — migrations 172–179, NOT auto-applied)

| Migration | Adds |
|-----------|------|
| 172 | `finance.accounts` (**chart of accounts — see §7 gap**), `journal_entries`, `journal_lines`, `invoices`, `invoice_lines`, `approvals`, `audit_events`, `adapter_jobs`. |
| 173 | `audit_events` append-only immutability triggers. |
| 174 | `projection_state` (CQRS read-model store). |
| 175 | RLS policies across all finance tables. |
| 176 | `is_test_data` partition column on `audit_events` (Test/Live). |
| 177 | Widen `adapter_jobs.id`/`aggregate_id` to `text` (prefixed string IDs). |
| 178 | Allow DELETE of **test** audit events (clear-test-data path); LIVE stays append-only. |
| 179 | Monotonic `seq` column + replay index (append-order tie-break). |

> ⚠️ **Migrations 172–179 are committed but not auto-applied.** They must be run against the target DB before enabling persistent mode. In-memory mode needs none of them.

## 4. Endpoint surface (`/api/v2/finance`, `backend/routes/finance.v2.js`)

**Reads (GET):** `/runtime/status`, `/journal-entries`, `/ledger`, `/profit-loss`, `/balance-sheet`, `/draft-invoices`, `/journal-drafts`, `/approvals`, `/adapter-jobs`, `/audit-events`, `/adapters`, `/evidence-packs`.

**Config (PUT):** `/settings/data-mode` (superadmin-only Test/Live switch).

**Mutations (POST/PATCH) — exist on the backend, deliberately NOT exposed as general UI controls:** `POST /draft-invoices`, `PATCH /draft-invoices/:id`, `POST /journal-drafts`, `POST /simulate/deal-won`, `POST /journal-entries/:id/reverse`, `POST /approvals/:id/approve`.

**Frontend surface:**
- `src/api/finance.js` — **GET-only** read client (the six mutating endpoints are intentionally absent).
- `src/api/financeWrites.js` — the only write helpers (`simulateDealWon`, `createJournalDraft`, `createDraftInvoice`), used **only** by the test-mode "Create test entries" panel. No approve/reverse/retry/provider-sync helpers exist in the UI.

## 5. Feature flags & guardrails (current defaults)

| Flag / control | Default | Effect |
|----------------|---------|--------|
| `ENABLE_FINANCE_PERSISTENT_EVENTS` | **false** | In-memory ephemeral event store. `true` requires a pg pool + migrations, else route fail-closes at construction. |
| `FINANCE_PROVIDER_WRITES_ENABLED` | **false** | Dominant kill switch — no provider HTTP writes. ERPNext stays sandbox/draft-only. |
| `finance_data_mode` (per tenant) | **test** | Superadmin-only switch; `live` requires persistent mode; in-memory clamped to `test`. |
| AI actor (`ai_agent`) | — | Draft/read-only; **unconditionally blocked** from approve/post (`finance.ai.no_money_movement`). |
| `financeOps` module gate | per tenant | Route + UI gated; RBAC matrix governs role access. |
| `POST /api/testing/cleanup-test-data` | superadmin | Destructive QA clear is superadmin-gated (#635). |

## 6. Frontend console (read-only)

`src/pages/FinanceOps.jsx` + `src/components/finance/`. Tab strip (frozen by design-freeze §6.2): **Runtime overview, Ledger summary, Draft invoices, Journal drafts, Journal entries, Approval queue, Adapter queue, Audit timeline, Projection / degraded, Sandbox adapter, Evidence.** Plus: guardrail banners, the test-mode "Create test entries" panel, per-panel CSV export, and amount formatting (cents → `2,500.00`, #642). Every tab is read-only — no approve/reject/reverse/replay/retry/provider-sync controls.

## 7. Design-only / NOT yet implemented

- **Chart of accounts is NOT wired in.** `finance.accounts` (172) exists with codes/classifications/`account_type`/hierarchy, but is **never populated or referenced** — journal lines key accounts off free-text `account_name` + `classification`, `journal_lines.account_id` left null, so the console shows **ACCOUNT CODE "—"** and accounts are emergent/name-keyed (fragmentation risk). Wiring it is **PR #643 (design only)**.
- **Cash Flow ↔ Finance bridge** — designed (#643, "Bridge B": read-only cash-flow view derived from posted journals). **Not implemented.** The Cash Flow module (`cash_flow` table, `backend/routes/cashflow.js`) is currently **fully separate** from finance (no shared tables/code; cash_flow uses `DECIMAL` dollars, finance uses integer cents).
- **Read-only Chart-of-Accounts tab + `GET /api/v2/finance/accounts`** — designed (#643). Not built. Editable COA manager is a further future slice.
- **ERPNext live / other providers** — sandbox/draft-only today; live provider writes, QuickBooks/Xero, and provider COA mapping are not implemented.
- **Production activation** — Phase 4 production-pilot is *designed* (`phase-4-*` docs) but nothing is activated; persistent events/provider writes remain operator-gated and off.
- **Many `phase-3-*` / `staging-*` docs are runbooks/plans**, not executed actions (each says "no live action performed").

## 8. Known gaps / limitations

- Emergent COA (account codes blank) — see §7.
- Migrations 172–179 not auto-applied; persistent mode is inert until they are.
- In-memory mode is ephemeral (restart loses finance state) and has no Test/Live partition (segregation is a persistent-mode property; in-memory is always `test`).
- See `finance-ops-beta-limitations.md` for the curated beta-limitations list.

## 9. Open items / next slices

1. **PR #643** review → if approved, implement **Slice 1** (COA seed + write-path resolution + read-only Chart-of-Accounts tab + `GET /accounts`).
2. **Slice 2** — Bridge B cash-flow reporting view (depends on COA `account_type`).
3. Future: editable COA manager; provider COA mapping; production-pilot activation gates.

## 10. Code map (where to look)

- **Routes:** `backend/routes/finance.v2.js` (v2 API), `backend/routes/cashflow.js` (separate Cash Flow).
- **Core lib:** `backend/lib/finance/` (domain service, event stores, projections, read adapters, governance, adapters).
- **Schema:** `backend/migrations/172`–`179_finance_*.sql`.
- **Frontend:** `src/pages/FinanceOps.jsx`, `src/components/finance/`, read client `src/api/finance.js`, write helpers `src/api/financeWrites.js`.
- **Designs:** `docs/architecture/finance/` (per-slice/per-phase). Start with `finance-ui-slice-1-read-only-console-design.md`, `phase-4-1-persistent-events-projection-reads-design.md`, `approval-orchestration.md`, and (for the next work) `finance-coa-wiring-and-cashflow-bridge-design.md`.
