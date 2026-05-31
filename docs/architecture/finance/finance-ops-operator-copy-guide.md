# Finance Ops Operator Copy Guide (Track C)

**Status:** Design / documentation only. No code change, no UI change, no engineering identifiers reintroduced into operator-facing surfaces.
**Branch:** `docs/finance-ops-operator-copy-guide` (cut from `main`).
**Companion to:** `finance-ui-slice-1-read-only-console-design.md` (the read-only console design) and `finance-ux-preview-usability-test-plan.md` (the UI-1D usability plan; this guide consumes its screen catalog).
**Live-execution posture:** None across the board (see §2).

---

## 1. Purpose and scope

The Finance Operations console (UI Slice 1) was designed by engineers for engineers — its visible copy still leaks file paths (e.g. `backend/routes/finance.v2.js:48`, `erpnextSandboxAdapter.js:89-128`), env-var names (`ENABLE_FINANCE_PERSISTENT_EVENTS`, `FINANCE_PROVIDER_WRITES_ENABLED`), backend identifiers (`mock_read_only`, `in_memory`, `provider_sync`), design-freeze section numbers (`§8.2.1`, `§7.9`), and untranslated state tokens (`pending_approval`, `draft`, `posted`, `reversed`). Operators and finance admins do not have the context to act on those phrasings, and the engineering text incentivises false-positive support tickets (e.g. "is the system degraded?" when the system is just configured fail-closed by design).

This packet is the design freeze for the operator/admin copy used across the read-only Finance Operations console. It is the single source of truth for:

- The vocabulary that maps engineering terms to plain operator language (§4).
- The copy rules for the system states that drive nearly every screen — demo/preview data, unsupported/API-gap panels, read-only mode, disabled provider writes, production-not-authorized state, the three top-level error states, and the four guardrail banners (§5).
- The actual before/after copy for every screen of the Finance Ops console (§6).
- The anti-patterns that this guide is meant to prevent (§7).

**Scope:**

- Documentation only — a copy reference that downstream UI changes will draw from.
- Applies to the read-only Finance Ops console (`src/components/finance/*.jsx`) and the panels surfaced behind it.
- Applies to the operator-facing strings only. The Slice 1 client (`src/api/finance.js`), the guardrail-banner identifiers / `data-testid` values, and the four backend gates remain unchanged at the code level.

**Scope-boundary — explicit non-goals:**

- No code change. No `src/components/finance/*.jsx` or `src/api/finance.js` edits in this packet.
- No UI structural change. Tabs, layouts, testids, route paths, and panel testids are unchanged.
- No new vocabulary that implies the persistent-events route lift has occurred, that provider writes are enabled, that a migration has been applied, or that the pilot has been activated. Every state phrase that exists today as fail-closed / default-closed / not-authorized continues to read that way after this guide is applied.
- No removal of engineering trace. The `Technical details (engineering)` block on each gap card and the secondary technical line on the projection / sandbox notes (introduced in the UI-1D polish on `feat/finance-ops-ux-preview`) MUST continue to be retained. This guide governs the **leading** copy only.
- No content for not-yet-built screens, no fake projections, no inferred state, no fabricated rows.
- No push without Andrei's explicit authorisation.

---

## 2. Live-execution posture

| What                                                                | Status                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Code change                                                         | None.                                                       |
| UI structural change                                                | None.                                                       |
| Backend semantic change                                             | None.                                                       |
| New POST / PATCH / DELETE helper                                    | None.                                                       |
| Approve / reject / reverse / replay / sync / retry / cancel control | None.                                                       |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` flip                             | None — fail-closed guard preserved.                         |
| `FINANCE_PROVIDER_WRITES_ENABLED` flip                              | None — default-closed kill switch preserved.                |
| `ENABLE_FINANCE_OPS` flip                                           | None — process-level mount gate unchanged.                  |
| Migration application                                               | None.                                                       |
| Staging / Coolify / Doppler mutation                                | None.                                                       |
| Provider write (ERPNext / any tier)                                 | None — sandbox-only URL guard unaffected.                   |
| Production / staging action                                         | None.                                                       |
| Implies persistent mode / provider writes / activation in copy      | No (this guide is the rule that prevents that implication). |

All 16 Phase 3-13 §7 safety guardrails are preserved end-to-end by this packet.

---

## 3. Prerequisites and audience

### 3.1 Personas this guide applies to

Per Slice 1 design freeze §4:

- **Finance admin** (primary). Customer-side. Reads and uses Finance Ops for day-to-day work. No engineering vocabulary.
- **Operator / support engineer** (secondary). 4VD-side. Investigates incidents. Needs honest signal, not jargon — but is comfortable with status tokens once translated.
- **Implementation engineer** (tertiary). 4VD-side. Reads the live console while wiring backend gaps. Continues to need the technical refs in the demoted "Technical details" block on every gap / partial panel. This guide does **not** remove that engineering trace; it governs the leading operator copy only.

### 3.2 Screens this guide applies to

Per Slice 1 §7 + UI-1D usability plan §4, the ten read-only screens + one placeholder + the top-level page chrome:

1. Runtime overview (§6.1)
2. Ledger summary (§6.2)
3. Journal entries (§6.3)
4. Draft invoices — live read-only (§6.4)
5. Journal drafts — live read-only (§6.5)
6. Approval queue — live read-only (§6.6)
7. Adapter queue — live read-only (§6.7)
8. Audit timeline — live read-only (§6.8)
9. Projection / degraded status — partial / remaining gap (§6.9)
10. Sandbox adapter status — live read-only metadata (§6.10)
11. Evidence / audit pack — live read-only, on-demand build (§6.11)
12. Four guardrail banners (§6.12)
13. Three top-level error states — route-disabled, tenant-not-enrolled, generic-error (§6.13)

### 3.3 What's on `main` vs on `feat/finance-ops-ux-preview`

This guide is cut from `main` (HEAD `13312d1d`) and so reads the pre-UI-1D-polish strings as its **engineering baseline**. The UI-1D polish work (operator-leading copy on `GapStateCard`, plain-language projection / sandbox notes, journal-entries all-status phrasing) is on `feat/finance-ops-ux-preview` (commit `7deb03ac`) and aligns with this guide; when that branch merges, the strings already there are the realisation of this guide and do not need to be re-derived.

---

## 4. Term mapping

Each row gives: engineering term → operator term → one-sentence operator explanation → which screen(s) it appears on. **The engineering term column is for translator reference; it must NOT appear in operator-leading copy. It may appear inside the demoted "Technical details (engineering)" block on a gap card or partial panel.**

| #   | Engineering term                                                  | Operator term                         | One-sentence operator explanation                                                                             | Where it shows up                                         |
| --- | ----------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | `in_memory` / `persistence: in_memory`                            | Temporary in-memory data              | Finance data is held only in the running server's memory and resets if the server restarts.                   | Runtime overview, Projection / degraded                   |
| 2   | `postgres-projection`                                             | Persistent finance data               | Finance data is being stored durably and survives a server restart.                                           | Runtime overview, Projection / degraded                   |
| 3   | `mock_read_only` (the `runtime.mode` placeholder)                 | Read-only preview                     | The view is read-only and no buttons here change anything.                                                    | Runtime overview                                          |
| 4   | `provider_sync: disabled`                                         | Provider sync is off                  | We are not sending any data to ERPNext or any other accounting provider from this view.                       | Runtime overview, Sandbox adapter, Provider-writes banner |
| 5   | `provider_sync: enabled`                                          | Provider sync is on                   | We would send data to a configured sandbox provider; production providers are still blocked.                  | Runtime overview, Sandbox adapter                         |
| 6   | `governance: enabled`                                             | Governance checks are on              | The usual approval and audit rules continue to apply.                                                         | Runtime overview                                          |
| 7   | `persistent events` (the `ENABLE_FINANCE_PERSISTENT_EVENTS` flag) | Durable event recording               | When this is on, every finance change is written down so it can be replayed; today it is off.                 | Persistent-events banner, Projection / degraded           |
| 8   | `projection`                                                      | Live finance summary                  | A summary view of journal entries, the ledger, and approvals kept fresh as events happen.                     | Projection / degraded                                     |
| 9   | `projection state: degraded`                                      | Finance summary is behind             | The live summary is not keeping up with new events right now.                                                 | Projection / degraded                                     |
| 10  | `cursor` / `lag`                                                  | Catch-up progress / how far behind    | Where the live summary is in the event stream, and how many seconds behind it currently sits.                 | Projection / degraded                                     |
| 11  | `replay`                                                          | Rebuild from history                  | Re-reading the recorded history to recompute the live summary; not available from this view.                  | Projection / degraded (deferred affordance, never shown)  |
| 12  | `adapter job`                                                     | Provider task                         | One outgoing piece of work to a finance provider (e.g. ERPNext sandbox), e.g. "push draft invoice".           | Adapter queue, Sandbox adapter                            |
| 13  | `adapter queue` / `adapter_jobs`                                  | Provider task history                 | The list of recent provider tasks, with status (waiting, succeeded, failed).                                  | Adapter queue                                             |
| 14  | `adapter_job.status: queued`                                      | Waiting to send                       | The task is queued and has not yet been picked up.                                                            | Adapter queue                                             |
| 15  | `adapter_job.status: succeeded`                                   | Sent                                  | The task completed at the provider.                                                                           | Adapter queue                                             |
| 16  | `adapter_job.status: failed`                                      | Failed                                | The task did not succeed; the system did not retry on its own.                                                | Adapter queue                                             |
| 17  | `evidence pack`                                                   | Audit pack                            | A bundle of audit records and proof artifacts that can be reviewed or exported (later).                       | Evidence placeholder                                      |
| 18  | `journal_entries.status: draft`                                   | Draft                                 | A journal entry that has been created but not yet sent for approval.                                          | Journal entries, Journal drafts                           |
| 19  | `journal_entries.status: pending_approval`                        | Pending approval                      | A journal entry that has been sent for approval and is awaiting a decision.                                   | Journal entries, Journal drafts, Approval queue           |
| 20  | `journal_entries.status: posted`                                  | Posted                                | A journal entry that has been approved and recorded against the ledger.                                       | Journal entries                                           |
| 21  | `journal_entries.status: reversed`                                | Reversed                              | A previously posted journal entry that has been reversed; the ledger reflects the reversal.                   | Journal entries                                           |
| 22  | `audit_events` / `audit timeline`                                 | Activity log                          | The chronological list of what happened in Finance Ops.                                                       | Audit timeline                                            |
| 23  | `module gate` / `financeOps` module setting                       | Finance module enablement             | A per-tenant on/off switch that controls whether this tenant can see Finance Operations at all.               | Tenant-not-enrolled state, Module Settings                |
| 24  | `tenant enrollment` / `enrolled tenant`                           | This tenant is set up for Finance Ops | The customer's account has been opted in to the Finance Ops module.                                           | Tenant-not-enrolled state, Module Settings                |
| 25  | Canonical `financeOps` vs legacy `enterpriseFinance`              | (Hidden from operator copy)           | A backend implementation detail; never surfaced to the operator. Engineering provenance only.                 | Engineering provenance only                               |
| 26  | `sandbox adapter`                                                 | Sandbox provider connection           | A safe practice connection to ERPNext that cannot reach a production provider.                                | Sandbox adapter                                           |
| 27  | `production activation`                                           | Pilot go-live                         | The decision to start using Finance Ops with real customer data and real provider writes; not yet authorised. | Production-activation-not-authorized banner               |

---

## 5. Copy rules per state

Each rule names the state, the rule the operator copy must follow, and the engineering identifiers that may continue to appear in the demoted "Technical details" sub-block but must NOT appear in the leading operator copy.

### 5.1 Demo / preview data

- **Rule:** Make it unmistakable, in a single sentence, that the data on screen is sample data and not from a real tenant. Use the word "sample" or "preview" in the leading line.
- **Operator phrasing:** "This is sample finance data for usability testing — it is not real ledger or invoice data."
- **Engineering identifiers allowed only in Technical details:** `PREVIEW_TENANT_ID`, `notYetBackedByApi: true`, `PREVIEW_SCENARIO`. None in the operator-leading copy.

### 5.2 Unsupported / API-gap panels

- **Rule:** The leading copy says what the operator will see in this section once it is built; the demoted Technical details block still names the missing endpoint and the natural backing source so engineering can act on it.
- **Operator phrasing template:** "<Section name> are not available in this preview yet. This section will show <read-only thing> once the backend read endpoint is added."
- **Engineering identifiers allowed only in Technical details:** `GET /api/v2/finance/<resource>`, `naturalBackingSource`, `§8.2.<n>`, "Read-API not yet implemented", `src/api/finance.js`.

### 5.3 Read-only mode

- **Rule:** Make the read-only nature visible on every screen header. Do not imply that any control on the page changes state.
- **Operator phrasing:** "Read-only — no action on this page changes data."
- **Engineering identifiers:** `mock_read_only` MUST NOT appear in the operator-leading copy. It may appear in the operator-friendly translation "read-only preview" or in the demoted Technical details when the placeholder runtime mode is being surfaced honestly.

### 5.4 Disabled provider writes

- **Rule:** The leading copy must say what cannot happen, in plain language, not which env var is off.
- **Operator phrasing:** "Provider sync is off. This view cannot send any data to ERPNext or any other accounting provider."
- **Engineering identifiers allowed only in Technical details:** `FINANCE_PROVIDER_WRITES_ENABLED`, `adapterJobProcessor.js:332-345`, `erpnextSandboxAdapter.js:89-128`.

### 5.5 Production-not-authorized

- **Rule:** Frame as "not authorised yet," not as "will never happen." Do not name the activation gate's packet number.
- **Operator phrasing:** "Production use of Finance Ops has not been authorised for this tenant yet. Any production write would be blocked structurally."
- **Engineering identifiers allowed only in Technical details:** Phase 4-20, Phase 4-21, Phase 3-14 posture.

### 5.6 Top-level "Route disabled" state (HTTP 404)

- **Rule:** Frame as an environment-level configuration, not a tenant problem; the user should not contact the tenant admin, they should contact their deploy owner.
- **Operator phrasing:** "Finance Operations is not enabled in this environment. Contact your deploy owner if it should be available here. Retrying will not help — this is a server-level setting, not a per-tenant one."
- **Engineering identifiers allowed only in Technical details:** `ENABLE_FINANCE_OPS`, `backend/lib/finance/financeRuntimeGate.js`.

### 5.7 Top-level "Tenant not enrolled" state (HTTP 403, exact module-gate message)

- **Rule:** Tell the operator what to do, not where the row lives. Direct them to the admin and to Module Settings.
- **Operator phrasing:** "This tenant is not set up for Finance Operations. Ask your administrator to turn on the Finance Operations module in Module Settings."
- **Engineering identifiers allowed only in Technical details:** `modulesettings`, `module_name = 'financeOps'`, `is_enabled = true`, the alias `enterpriseFinance`.

### 5.8 Top-level "Generic error" state (HTTP 5xx)

- **Rule:** Plain language; preserve the Retry affordance; do not surface the HTTP status code as the leading line.
- **Operator phrasing:** "Finance Operations did not load. Please try again. If it keeps happening, contact support."
- **Engineering identifiers allowed only in Technical details:** the HTTP status code and the structured error message.

### 5.9 The four guardrail banners

Each banner uses a leading single-line operator headline plus a one-sentence operator body. The technical sub-line lives behind the existing dismiss control and is shown only in the demoted "Technical details" sub-block when applicable.

- **Persistent-events fail-closed banner:** "Finance event recording is off. Counts and lists reset when the server restarts. Turning this on is a coordinated change handled by engineering — there is nothing to flip from this page."
- **Provider-writes default-closed banner:** "Provider sync is off. The system drafts what it would send to ERPNext / QuickBooks / Xero / NetSuite, but does not send it. Turning this on is a coordinated change handled by engineering — there is nothing to flip from this page."
- **Sandbox-only adapter banner:** "Only the practice (sandbox) provider connection is allowed. Production provider endpoints are blocked at the system level regardless of any control on this page."
- **Production-activation-not-authorized banner:** "Production use of Finance Operations has not been authorised yet. Any production write would be blocked at the system level."

### 5.10 Status pills and small chips

- **Rule:** Use the operator term from §4, not the snake_case engineering token. `pending_approval` chip reads "Pending approval"; `posted` reads "Posted"; `reversed` reads "Reversed"; `draft` reads "Draft". Adapter job pills: "Waiting", "Sent", "Failed".
- **Engineering identifiers allowed only in Technical details:** the raw status string.

---

## 6. Screen-by-screen examples

Each subsection gives the engineering baseline (current `main` strings) and the operator copy this guide locks. Engineering provenance lines name the source file but always live below the operator-leading copy, never above it.

### 6.1 Runtime overview

- **Engineering baseline (`src/components/finance/RuntimeOverview.jsx`):**
  - Title: "Runtime overview".
  - Subtitle: "Live view of the Finance v2 runtime posture for this tenant. Read-only — no mutating affordance exists on this card."
  - Posture rows render the raw token values: `Mode: mock_read_only`, `Persistence: in_memory`, `Provider sync: disabled`, `Governance: enabled`. The mode-placeholder note ends with "see gap §8.2.9".
- **Operator copy:**
  - Title: "Finance runtime".
  - Subtitle: "Read-only summary of what Finance Operations is doing for this tenant right now. Nothing on this card changes data."
  - Posture rows: "Mode — Read-only preview", "Where the data lives — Temporary in-memory data" (or "Persistent finance data"), "Provider sync — Off" (or "On (sandbox only)"), "Governance — On".
  - Replace the "see gap §8.2.9" mode-placeholder note with: "This 'mode' label is a placeholder while engineering wires a more accurate value. It is not authoritative." Keep the design-ref attribute (`data-design-ref="§8.2.9"`) but do not surface it in operator-visible text.
- **Engineering provenance:** `src/components/finance/RuntimeOverview.jsx:78-175`; `FINANCE_API_GAPS.runtimeMode` (`src/api/finance.js:258-271`).

### 6.2 Ledger summary

- **Engineering baseline (`src/components/finance/LedgerSummary.jsx`):** A generic key/value table rendering `currency`, `total_debits`, `total_credits`, `revenue`, `cost_of_goods_sold`, `net_income`, `assets`, `liabilities`, `equity`, etc. Section subtitle: "Read-only ledger / P&L / balance-sheet snapshots from the Finance v2 in-memory domain service. Field shapes are forwarded as-is." Empty-state copy: "Ledger is empty for this tenant.", "No P&L data for this tenant yet.", "No balance-sheet data for this tenant yet."
- **Operator copy (the UI-1D polish on `feat/finance-ops-ux-preview` already realises this):**
  - Section subtitle: "Read-only ledger, profit & loss, and balance-sheet snapshots for this tenant. Amounts are shown in USD."
  - Empty-state copy per section: "No ledger accounts available for this tenant yet.", "No revenue or expense accounts available yet.", "No assets, liabilities, or equity accounts available yet."
  - Currency-format every `*_cents` value as `$X,XXX.XX`; do not surface the raw `*_cents` field names.
  - Balance-sheet "balanced" row reads "Balanced — Yes" / "Balanced — No", not `is_balanced: true`.
- **Engineering provenance:** `backend/lib/finance/accountingEngine.js` (`buildLedger` / `buildProfitAndLoss` / `buildBalanceSheet`) for the cents-and-account-array shapes.

### 6.3 Journal entries

- **Engineering baseline (`src/components/finance/JournalEntriesList.jsx`):** "Read-only list of posted journal entries for this tenant. Newest first. Row-level detail and reverse actions are deferred to a later slice." Empty state: "No journal entries posted for this tenant yet." Status column shows raw `pending_approval`.
- **Operator copy (already on the ux-preview branch):**
  - Subtitle: "Read-only list of journal entries for this tenant across draft, pending approval, posted, and reversed states. Newest first. Row-level detail and reverse actions are deferred to a later slice."
  - Empty state: "No journal entries are available for this tenant yet."
  - Status pills: "Draft", "Pending approval", "Posted", "Reversed" (no underscores).
- **Engineering provenance:** Phase 4-1 design freeze locks the full-status contract.

> **Status update (post #623/#624):** §6.4–§6.8, §6.10, and §6.11 are now **live read-only** screens — the Read API Slice 1 implemented their endpoints and the panels fetch real data (no `GapStateCard`). The §5.2 "unsupported / API-gap" copy rule now applies **only** to the one remaining gap, §6.9 (projection cursors). Do **not** regress these screens back to gap copy.

### 6.4 Draft invoices (live read-only)

- **State:** Live read-only list via `GET /api/v2/finance/draft-invoices` (`DraftInvoicesPanel` → `FinanceTablePanel`). No create / edit / send affordance.
- **Operator copy — populated:** plain-language column headers (ID, Status, Customer, Currency, Amount, Created, Updated); the amount is shown as a formatted figure, never the raw `amount_cents`/`total_cents` token. A Refresh control is the only action.
- **Operator copy — empty:** "No draft invoices for this tenant yet."
- **Engineering provenance** (Technical details only): endpoint `GET /api/v2/finance/draft-invoices`; read-API design §6.1.

### 6.5 Journal drafts (live read-only)

- **State:** Live via `GET /api/v2/finance/journal-drafts` (the draft + pending-approval slice of journal entries). No create / post / approve affordance.
- **Operator copy — empty:** "No journal drafts for this tenant yet."
- **Engineering provenance:** `GET /api/v2/finance/journal-drafts`; read-API design §6.2.

### 6.6 Approval queue (live read-only)

- **State:** Live via `GET /api/v2/finance/approvals` (pending by default). Read-only — **no approve / reject / claim** affordance.
- **Operator copy — empty:** "No pending approvals for this tenant."
- **Engineering provenance:** `GET /api/v2/finance/approvals`; read-API design §6.3.

### 6.7 Adapter queue (live read-only)

- **State:** Live via `GET /api/v2/finance/adapter-jobs`. Read-only — **no retry / cancel / provider-sync** affordance.
- **Operator copy — empty:** "No adapter jobs for this tenant yet."
- **Engineering provenance:** `GET /api/v2/finance/adapter-jobs`; read-API design §6.4.

### 6.8 Audit timeline (live read-only)

- **State:** Live via `GET /api/v2/finance/audit-events` — cursor-paginated, newest first, with a "Load more" control. No export / mutation.
- **Operator copy — empty:** "No audit events for this tenant yet."
- **Engineering provenance:** `GET /api/v2/finance/audit-events`; read-API design §6.5.

### 6.9 Projection / degraded status (partial-live panel)

- **Engineering baseline (`src/components/finance/ProjectionStatusPanel.jsx`):** Degraded note reads "In-memory persistence is the only supported Slice 1 backend mode. ENABLE_FINANCE_PERSISTENT_EVENTS is fail-closed at the route level (backend/routes/finance.v2.js:48). Persistent-events activation requires a separate route lift coordinated with backend Phase 4 planning."
- **Operator copy (already on the ux-preview branch):**
  - Leading degraded-note line: "This tenant is currently using temporary in-memory finance data. Persistent projection history is not enabled yet."
  - Demoted technical sub-line: "Technical: in-memory is the only supported Slice 1 mode; ENABLE_FINANCE_PERSISTENT_EVENTS is fail-closed at the route level (backend/routes/finance.v2.js:48). Persistent-events activation requires a separate route lift coordinated with backend Phase 4 planning."
  - Operator phrasing for the persistence row label: "Where the data lives" (not "Persistence").
- **Engineering provenance:** as above.

### 6.10 Sandbox adapter status (live read-only metadata)

- **State:** Live via `GET /api/v2/finance/adapters` — a read-only declarative metadata registry (capability / status / posture discovery only). **No** provider-sync / retry / cancel / credential / connection-test affordance; it never sends data to any provider.
- **Operator copy:**
  - Provider-sync row label: "Provider sync"; value reads "Off" / "On (sandbox only)" rather than `disabled` / `enabled`.
  - Per-adapter rows show the adapter name, mode (draft-only), declared capabilities, provider-writes (Disabled), and production-allowed (No) — in plain language; no credential material is shown (`credentials_resolved` is a boolean only).
  - Leading posture line retained: "Provider sync is disabled — this console can only describe sandbox adapter status and cannot send data to ERPNext or any production provider."
  - Demoted technical sub-line: sandbox-only enforcement is structural at `erpnextSandboxAdapter.js:89-128`; `FINANCE_PROVIDER_WRITES_ENABLED` default-closed posture preserved.
- **Engineering provenance:** `GET /api/v2/finance/adapters`; read-API design §6.7; registry module `backend/lib/finance/financeAdapterRegistry.js`.

### 6.11 Evidence / audit pack (live read-only, on-demand build)

- **State:** Live via `GET /api/v2/finance/evidence-packs` — builds a single tamper-evident evidence pack on demand from the tenant's event stream and shows its metadata + integrity hashes. Building a pack is a pure read; **no** generate / download / share mutation, and there is no stored pack registry.
- **Operator copy — populated:** plain-language rows (Pack ID, Generated at, Artifact count, integrity hashes); a Refresh control rebuilds for the current scope.
- **Operator copy — empty scope:** an honest empty pack (artifact count 0), e.g. "No finance activity to package for this range yet."
- **Engineering provenance:** `GET /api/v2/finance/evidence-packs`; read-API design §6.8; builder `backend/lib/finance/auditEvidenceBuilder.js`.

### 6.12 Guardrail banners

See §5.9 for the four leading-line copies. The existing `data-testid` values and the four-banner structural inventory in `src/components/finance/GuardrailBanners.jsx` are unchanged. The technical body lines remain available behind the dismiss control as demoted Technical details.

### 6.13 Three top-level states

- **Route-disabled (HTTP 404) state.** Operator copy per §5.6. The existing `finance-ops-route-disabled` testid and structural card remain. Engineering provenance (`ENABLE_FINANCE_OPS`) lives in Technical details, not in the leading copy.
- **Tenant-not-enrolled (HTTP 403 with the exact module-gate message) state.** Operator copy per §5.7. The exact backend message "Finance Ops is not enabled for this tenant" continues to be the gate matcher used by the page (`src/pages/FinanceOps.jsx`), but the operator-visible card reads the new sentence. The testid `finance-ops-tenant-not-enrolled` is unchanged.
- **Generic-error (HTTP 5xx) state.** Operator copy per §5.8. The Retry affordance (`finance-ops-generic-error-retry` testid) is preserved. Status code and backend message live in Technical details.

### 6.14 Module Settings — Finance Operations toggle (companion surface)

- **Operator copy for the Finance Operations card in Module Settings:** "Finance Operations — Read-only Finance Ops console. Off by default for each tenant; an administrator turns it on per tenant."
- **Engineering provenance:** `ModuleManager.jsx` `moduleKey: 'financeOps'` (on `feat/finance-ops-ux-preview`); `MODULE_ALIASES = { financeOps: ['enterpriseFinance'] }` for the canonical-wins resolution.

### 6.15 Module Settings — alias-enrolled tenant nuance (operator-invisible)

- **Operator copy:** the toggle continues to read the same way regardless of whether the tenant is enrolled via the canonical row or a legacy alias row. The operator should never need to know the difference.
- **Engineering provenance:** the alias-aware `computeMissingModules` / `selectMissingDefaultRows` rule on `feat/finance-ops-ux-preview` (the Codex P1 fix) prevents alias-enrolled tenants from being silently revoked; this guide locks that behaviour as operator-invisible — no copy explains it because no operator needs to know.

---

## 7. Anti-patterns

These are the copy choices this guide is meant to prevent. Each carries the rule it violates.

1. **"Read-API not yet implemented (design freeze §8.2.x)."** as a leading line. Violates §5.2: the leading copy must be plain-language; the design-freeze ref belongs in Technical details.
2. **"`mock_read_only`"** rendered as the value of the Mode row. Violates §5.3 + §4 row 3: use "Read-only preview" as the operator term.
3. **"ENABLE_FINANCE_PERSISTENT_EVENTS is fail-closed at the route level (backend/routes/finance.v2.js:48)."** as the leading degraded-note line. Violates §5.4 + §5.9: the leading copy must say what the operator sees (temporary in-memory finance data; provider sync off), not which env var is off.
4. **"Field shapes are forwarded as-is."** as a subtitle. Violates §5.1 + §5.3: it implies the operator should read API field names; the operator should never need to.
5. **"No journal entries posted for this tenant yet."** when the route surfaces drafts, pending-approval, and reversed rows too. Violates §6.3: implies posted-only semantics that contradict the route contract (Phase 4-1).
6. **Raw `pending_approval` chip text.** Violates §5.10: status pills use the operator term.
7. **"Contact your administrator to enable it in Module Settings. (Backend expects a row in `modulesettings` with `module_name = 'financeOps'` and `is_enabled = true`.)"** as the leading tenant-not-enrolled card body. Violates §5.7: backend table names belong in Technical details, not in the message the customer reads.
8. **"This panel will be replaced with a live data view in the same commit."** referencing `src/api/finance.js` in operator-leading copy. Violates §5.2: client-wrapper and commit-graph references are not operator concerns.
9. **A "load demo data" button anywhere in the production console.** Violates §5.1 and the UI-1D Slice constraint: it would imply production behaviour exists by wiring fixtures into the live fetch path.
10. **"Persistent mode is enabled."** anywhere, ever, while the fail-closed guard is still active. Violates §2 and §5.9: copy must never imply the persistent-events route lift has occurred. Same rule for any wording that implies provider writes are enabled, that a migration has been applied, or that the pilot has been activated.

---

## 8. Hard constraints (explicit restatement)

- No code change. No `src/components/finance/*.jsx` edits in this packet.
- No UI structural change. Testids, route paths, panel structure, and the four-banner inventory are unchanged.
- The demoted "Technical details (engineering)" block on each gap card and the secondary technical line on the projection / sandbox notes continue to be retained. This guide governs the **leading** copy only.
- No copy that implies the persistent-events route lift has occurred, that provider writes are enabled, that a migration has been applied, or that the pilot has been activated.
- No `ENABLE_FINANCE_PERSISTENT_EVENTS` flip. No `FINANCE_PROVIDER_WRITES_ENABLED` flip. No `ENABLE_FINANCE_OPS` flip. No migration application. No staging / Coolify / Doppler mutation. No provider writes. No production action.
- No push without Andrei's explicit authorisation.

---

## 9. Acceptance for this packet

- §4 supplies ≥ 27 engineering-term → operator-term rows covering every token an operator might see on the read-only Finance Ops console, with a one-sentence operator explanation per term.
- §5 supplies a copy rule for each of: demo / preview data, unsupported / API-gap panels, read-only mode, disabled provider writes, production-not-authorized, the three top-level error states, the four guardrail banners, and status pills.
- §6 supplies a before / after operator copy block for every read-only screen in the console + the Module Settings companion surface.
- §7 enumerates the anti-patterns this guide prevents and quotes the engineering baselines that violate them.
- The engineering provenance on each example points at the file (and optionally line range) where the engineering baseline lives — but no engineering identifier appears in the operator-leading copy of §6, only in the engineering-provenance sub-block.
- §8 restates every guardrail.
- No code is changed.

---

## 10. Sign-off / posture

- Fail-closed `ENABLE_FINANCE_PERSISTENT_EVENTS` is preserved end-to-end.
- Default-closed `FINANCE_PROVIDER_WRITES_ENABLED` is preserved end-to-end.
- Sandbox-only ERPNext URL guard at `erpnextSandboxAdapter.js:89-128` is preserved.
- No production action; no provider writes; no migration application; no env-var change; no staging / Coolify / Doppler mutation by this packet.
- The 16 Phase 3-13 §7 safety guardrails are preserved end-to-end.
- The six mutating Finance v2 endpoints remain absent from `src/api/finance.js`.
- The Slice 1 read-only constraint (no approve / reject / reverse / replay / retry / cancel / provider-sync affordance) is preserved; this guide adds no affordance and reframes none of those as available.
- This guide and the UI-1D polish on `feat/finance-ops-ux-preview` align — when that branch merges, the strings in `src/components/finance/*.jsx` already match this guide.

Anchored on `main` (HEAD `13312d1d`); branch `docs/finance-ops-operator-copy-guide`.
