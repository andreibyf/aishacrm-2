# Finance Operations - User Guide

Finance Operations is a double-entry finance/accounting console for your tenant. Make sure Finance Operations is enabled for your tenant and select a tenant from the dropdown.

## Read-only by design

The Finance Operations console is **read-only except for the Chart of Accounts tab**. You can view ledgers, statements, drafts, approvals, adapter jobs, and the audit timeline, and export any panel — but the console intentionally has **no buttons to approve, post, reverse, or send money**. Money movement stays out of this interface by design, and **AI assistants can never approve or post finance actions**. The one editable area is the Chart of Accounts (admin / superadmin only).

Two controls you may notice:

- **Test vs Live data mode** — a tenant runs in **Test** mode by default; a superadmin can switch it to **Live** (Live requires the durable/persistent backend). Test and Live data are kept separate.
- **Guardrail banners** — shown at the top of panels to flag the current mode and any safety limits.

## Runtime overview

- **Runtime Overview** — system health (Healthy, Projection / degraded, Route disabled). If a panel errors on load, click **Retry**.

## Ledger & statements

- **Ledger Summary** — the financial ledger with key balances. It reflects entries that have been **posted** (see Approval Queue).
- **Cash Flow** — a cash-flow statement built from posted cash/bank journal lines (period inflow / outflow / net), reconciled to the balance sheet's cash line. This is separate from the standalone Cash Flow module.

> Profit & Loss and Balance Sheet figures are derived purely from posted journal lines, so they populate once entries are posted.

## Chart of Accounts (editable)

The **Chart of Accounts** tab is an **editable manager** (admin / superadmin only):

- **Create**, **edit**, **deactivate**, and **reactivate** accounts.
- **System / seeded accounts** can be **renamed** (name + account type, with a reason) — but their classification, account code, and system flag stay locked, and they can't be deactivated.
- Accounts that already have posted history allow only name + type edits (classification and code lock once used).
- All changes are human-only — AI actors are blocked.

## Journal entries, drafts & invoices

- **Journal Entries** — review all recorded entries.
- **Journal Drafts** — review pending journal drafts. New drafts come from the accounting workflow, or from the **Create test entries** panel in Test mode — there is no general "new entry" button in the live console.
- **Draft Invoices** — review draft invoices.

## Approval Queue & Adapter Queue (read-only)

- **Approval Queue** — review finance actions awaiting approval. Approving an action **posts** its journal, which is what makes the Ledger, P&L, Balance Sheet, and Cash Flow reflect it. Approvals are **not initiated from this console** (and never by AI).
- **Adapter Queue** — review external-system adapter jobs. The accounting adapter (ERPNext) is **sandbox / draft-only**; no writes are sent to external providers.

## Audit, projections, sandbox & evidence

- **Audit Timeline** — full, append-only history of finance actions with timestamps and details.
- **Projection / degraded** — status of the read-model projections.
- **Sandbox Adapter** — inspect the sandbox integration without affecting any external system.
- **Evidence** — view evidence packs for finance records (read-only).

## Exporting

Every panel offers **CSV** and **PDF** export. Both are generated in your browser from the rows currently displayed (no server round-trip), so they export the displayed page and columns.

## Creating sample data (Test mode)

In **Test** mode, a **Create test entries** panel lets you generate sample drafts or simulate a posted deal so you can watch the ledger and statements populate. It is for exploration only and is unavailable in Live mode.
