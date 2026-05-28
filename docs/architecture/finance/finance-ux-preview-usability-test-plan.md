# Finance Ops — UX Preview Usability Test Plan (UI Slice 1D)

**Finance UI Slice 1D — usability-testable read-only Finance Ops console preview.**
**Branch:** `feat/finance-ops-ux-preview`.
**Status:** Preview tooling + plan. **No backend semantic change, no env-var change, no migration application, no Coolify/Doppler mutation, no provider write, no production action.** Adds safe demo fixtures + a render proof + this plan so Andrei can evaluate the operator/end-user experience of the already-cleared read-only console (UI-1A/1B/1C).
**Date:** 2026-05-28
**Related:**
[`finance-ui-slice-1-read-only-console-design.md`](./finance-ui-slice-1-read-only-console-design.md) — the read-only console design this preview exercises ·
[`phase-4-1-persistent-events-projection-reads-design.md`](./phase-4-1-persistent-events-projection-reads-design.md) — the persistent-events route lift this preview deliberately does NOT pretend exists ·
[`phase-3-activation-evidence-pack.md`](./phase-3-activation-evidence-pack.md) §7 (16 safety guardrails the preview preserves)

---

## 1. Purpose and scope

Slice 1D gives Andrei — as the end user / operator — a realistic, clickable-equivalent way to evaluate the read-only Finance Operations console **before** any persistent-events route lift, provider writes, staging operation, or production activation. The goal is comprehension feedback: are the labels, navigation, statuses, guardrails, and empty/gap states clear, honest, and operator-ready?

This packet ships three things:

1. **`src/api/finance.previewFixtures.js`** — frozen, read-only demo fixtures for every representative console state. Pure data; no network calls; no mutation affordance. It imports exactly one thing from `src/api/finance.js` — the read-only `FINANCE_API_GAPS` constant (a frozen data table kept as the single source of truth for the API-gap refs) — and never modifies the client, calls any of its fetch helpers, or wires fixtures into the production fetch path. It touches no backend file.
2. **`src/components/finance/__tests__/FinanceOps.usability-preview.test.jsx`** — renders the **real** console with the finance API mocked to the preview fixtures, proving every representative state renders through the real components and that the read-only / no-mutation guarantees hold on every tab.
3. **This plan** — the local preview path, the representative-state catalog, the usability checklist, and the feedback capture table.

Out of scope (explicitly): authoring new backend endpoints, wiring fixtures into the production fetch path, any mutation control, and any environment/migration/provider/production action.

---

## 2. Live-execution posture

| What                                    | Status this task                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| New runtime code (app behavior change)  | None — fixtures are test/eval data; the live console is unchanged.             |
| Backend semantic change                 | None.                                                                          |
| `src/api/finance.js` change             | None — the live client is untouched; fixtures are a separate module.           |
| New POST/PATCH/DELETE helper            | None.                                                                          |
| Doppler env var changed                 | None.                                                                          |
| `ENABLE_FINANCE_PERSISTENT_EVENTS` flip | None — fail-closed guard at `backend/routes/finance.v2.js:48` preserved.       |
| `FINANCE_PROVIDER_WRITES_ENABLED` flip  | None — default-closed kill switch preserved.                                   |
| Migration application                   | None.                                                                          |
| Coolify mutation                        | None.                                                                          |
| Provider write (ERPNext / any tier)     | None — sandbox-only URL guard preserved.                                       |
| Production / staging action             | None.                                                                          |
| `vitest.config.ts` include list         | One line added so the new pure-data fixtures test is discovered by the runner. |

---

## 3. What the preview is — and what it deliberately is not

**It is honest about data provenance.** Each console screen is one of three kinds:

- **live** — backed by a real Finance v2 GET endpoint today (`runtime/status`, `journal-entries`, `ledger`, `profit-loss`, `balance-sheet`). The preview feeds these real shapes, so the real panels render them.
- **partial** — some fields are live (read from `runtime/status`), deeper detail is a backend gap. The live field renders; the gap renders an honest gap card.
- **gap** — no backend read endpoint exists yet (`FINANCE_API_GAPS`). The real tab renders the honest `GapStateCard` / placeholder regardless of any data.

**It does NOT pretend the persistent-events lift or projection-backed reads already exist.** The default runtime fixture keeps `persistence: in_memory` and `provider_sync: disabled`, so all four guardrail banners stay on. A `persistentProjectionFuture` fixture exists strictly as a **labeled mock-up** for evaluating the future "healthy projection" note — it never flips a real flag, and even it keeps provider writes disabled (a separate, later gate).

**It does NOT fabricate live data for gap screens.** The gap tabs render the honest "Read-API not yet implemented" card. The `futureStateFixtures` (draft invoices, journal drafts, approval queue, adapter queue, audit timeline) are mock-ups of proposed columns/labels for when those endpoints land — every one is tagged `notYetBackedByApi: true` with its gap ref, and is presented in §6 as a wording mock-up, never as live behavior.

---

## 4. Representative-state catalog

Drawn from `PREVIEW_STATE_CATALOG` in `finance.previewFixtures.js` (the test asserts this catalog covers every tab).

| Screen                | Tab id             | Data source | Representative states evaluated                                                                           |
| --------------------- | ------------------ | ----------- | --------------------------------------------------------------------------------------------------------- |
| Runtime overview      | `runtime-overview` | live        | healthy in-memory · empty tenant · persistent (future mock-up)                                            |
| Ledger summary        | `ledger`           | live        | populated ledger / P&L / balance-sheet · empty sections                                                   |
| Draft invoices        | `invoices`         | gap         | honest gap card (no `GET /draft-invoices` yet)                                                            |
| Journal drafts        | `journal-drafts`   | gap         | honest gap card (no `GET /journal-drafts` yet)                                                            |
| Journal entries       | `journal-entries`  | live        | draft · pending_approval · posted · reversed · empty                                                      |
| Approval queue        | `approvals`        | gap         | honest gap card (no `GET /approvals` yet)                                                                 |
| Adapter queue         | `adapter-queue`    | gap         | honest gap card (no `GET /adapter-jobs` yet)                                                              |
| Audit timeline        | `audit`            | gap         | honest gap card (no `GET /audit-events` yet)                                                              |
| Projection / degraded | `projection`       | partial     | in-memory degraded note (live persistence) + cursor gap card                                              |
| Sandbox adapter       | `sandbox-adapter`  | partial     | provider_sync posture (live) + registered-adapters gap card                                               |
| Evidence              | `evidence`         | gap         | honest placeholder (no `GET /evidence-packs` yet)                                                         |
| Guardrail banners     | —                  | live        | persistent-events fail-closed · provider-writes default-closed · sandbox-only · production-not-authorized |
| Top-level states      | —                  | live        | route disabled (404) · tenant not enrolled (403) · generic error (500)                                    |

---

## 5. Local preview path for Andrei

There are two complementary ways to view the preview. Neither touches a backend, an env var, a migration, a provider, or production.

### Path A — Rendered-state inspection via Vitest UI (no backend needed)

This renders the **real** console components with the preview fixtures and lets you inspect each representative state's DOM.

```bash
npm run test:ui
```

In the Vitest UI, open `FinanceOps.usability-preview.test.jsx`. Each test renders a specific console state through the real components: runtime overview (healthy + empty-tenant zero-count variants), journal entries with all four statuses (and the empty-list variant), ledger (populated + the three empty sections), projection, sandbox adapter, the gap tabs, the three top-level states (route-disabled 404, tenant-not-enrolled 403, generic-error 500 with Retry), the persistent-projection mock-up (persistent-events banner off, provider-writes on), and the read-only sweep. Use the test's rendered output to evaluate labels, statuses, and wording. This is the fastest path and requires no backend.

### Path B — Live local console with an enrolled demo tenant (fully clickable)

For an end-to-end clickthrough of the real page at `/FinanceOps`:

```bash
# Frontend (Vite HMR on 5173)
npm run dev
# Backend (nodemon on 3001) — in a second shell
cd backend && npm run dev
```

Operator-side prerequisites (these are existing config, not changed by this slice):

- `ENABLE_FINANCE_OPS=true` must be set for the backend env so the route surface mounts (otherwise the console correctly shows the "Route disabled" state — itself a representative state worth evaluating).
- The selected tenant must be enrolled: a `modulesettings` row with `module_name = 'financeOps'` and `is_enabled = true` (otherwise the console correctly shows "Tenant not enrolled").

In live mode the five live screens show real tenant data (which may be empty on a fresh tenant) and the gap screens show their honest gap cards. Use `finance.previewFixtures.js` as the reference for the representative states the live data may not naturally exhibit (e.g. a reversed journal entry).

> **Why there is no in-app "load demo data" button.** Wiring fixtures into the live fetch path would make the running app _pretend_ data/behavior exists that the backend does not provide — exactly the "fake production behavior" this slice forbids. The fixtures are therefore never wired into the live fetch path (the module imports only the read-only `FINANCE_API_GAPS` constant from the client, never a fetch helper); Path A is the safe way to see them rendered by the real components.

---

## 6. Usability checklist

For each screen, evaluate and record: **Clear?** (labels/statuses understandable) · **Confusing?** · **Missing?** (something an operator expects) · **Risky/scary?** (reads as dangerous or implies an action that isn't there) · **Wording?** (better copy).

| Screen                | Clear? | Confusing? | Missing? | Risky/scary? | Wording change? |
| --------------------- | ------ | ---------- | -------- | ------------ | --------------- |
| Runtime overview      |        |            |          |              |                 |
| Guardrail banners     |        |            |          |              |                 |
| Ledger summary        |        |            |          |              |                 |
| Journal entries       |        |            |          |              |                 |
| Draft invoices (gap)  |        |            |          |              |                 |
| Journal drafts (gap)  |        |            |          |              |                 |
| Approval queue (gap)  |        |            |          |              |                 |
| Adapter queue (gap)   |        |            |          |              |                 |
| Audit timeline (gap)  |        |            |          |              |                 |
| Projection / degraded |        |            |          |              |                 |
| Sandbox adapter       |        |            |          |              |                 |
| Evidence (gap)        |        |            |          |              |                 |
| Route-disabled state  |        |            |          |              |                 |
| Tenant-not-enrolled   |        |            |          |              |                 |

Prompts to keep in mind while reviewing:

- Do the **gap cards** read as "not built yet" rather than "broken / degraded"? (They must not prompt a support ticket.)
- Do the **guardrail banners** make the safe posture obvious without sounding alarming?
- Is the `mock_read_only` mode annotation understood as a placeholder, not a live signal?
- Are the journal-entry **statuses** (draft / pending_approval / posted / reversed) self-explanatory?
- Is it obvious that **nothing on the page can change data** (no approve/reject/reverse/etc.)?

---

## 7. Feedback capture table

Record findings here as you go. Severity: P1 (blocks pilot usability) · P2 (should fix before pilot) · P3 (nice-to-have / wording).

| #   | Screen | Observation | Severity | Decision | Follow-up ticket / task |
| --- | ------ | ----------- | -------- | -------- | ----------------------- |
|     |        |             |          |          |                         |
|     |        |             |          |          |                         |
|     |        |             |          |          |                         |

---

## 8. Hard constraints (restated for the reviewer)

- No backend semantic change. No new POST/PATCH/DELETE helper. No approve / reject / reverse / replay / adapter retry-cancel / provider-sync control anywhere.
- No persistent-events route lift. No `ENABLE_FINANCE_PERSISTENT_EVENTS` flip. No `FINANCE_PROVIDER_WRITES_ENABLED` flip.
- No migration application. No staging / Coolify / Doppler mutation. No provider write. No production action.
- `src/api/finance.js` is unchanged; the fixtures module imports only its read-only `FINANCE_API_GAPS` constant (never a fetch helper) and the preview fixtures never enter the production fetch path.
- The 16 Phase 3-13 §7 safety guardrails are preserved end-to-end.
- The branch is not pushed without Andrei's explicit authorization.

---

## 9. Acceptance

- [ ] `finance.previewFixtures.js` exports only frozen, read-only data with no mutation affordance (asserted by `finance.preview-fixtures.test.js`).
- [ ] Live-endpoint fixtures match the real `src/api/finance.js` return shapes; journal entries cover all four statuses; adapter-queue mock-up covers queued/succeeded/failed within the migration-172 operation enum.
- [ ] The usability-preview render test renders every representative state through the real console — the live screens (incl. their empty variants), the gap tabs, the three top-level states (route-disabled / tenant-not-enrolled / generic-error), and the persistent-projection mock-up — and proves no mutation control exists on any tab.
- [ ] Gap tabs render honest gap cards, not fabricated live data.
- [ ] This plan documents a local preview path, the representative-state catalog, the usability checklist, and the feedback capture table.
- [ ] CHANGELOG updated.
- [ ] No env / migration / provider / staging / production action taken.
