# Finance Ops — Projection Contracts

**Track B specification.** Audience: engineers implementing projection workers in the Finance Ops runtime.

**Branch:** `feat/finance-ops-runtime`  
**Status:** Design spec — no implementation yet  
**Date:** 2026-05-19

---

## Table of Contents

1. [Projection Worker Contract](#1-projection-worker-contract)
2. [Consistency Model](#2-consistency-model)
3. [finance.projection.ledger](#3-financeprojectionledger)
4. [finance.projection.profit_loss](#4-financeprojectionprofit_loss)
5. [finance.projection.balance_sheet](#5-financeprojectionbalance_sheet)
6. [finance.projection.approval_queue](#6-financeprojectionapproval_queue)
7. [finance.projection.adapter_queue](#7-financeprojectionadapter_queue)
8. [finance.projection.audit_timeline](#8-financeprojectionaudit_timeline)
9. [finance.projection.cash_position](#9-financeprojectioncash_position)
10. [finance.projection.executive_summary](#10-financeprojectionexecutive_summary)

---

## 1. Projection Worker Contract

> **Superseded — see [`projection-runtime.md`](./projection-runtime.md).**
> The projection worker interface, event dispatch rules, replay protocol, and
> the `ProjectionStore` abstraction are now defined authoritatively by the
> Projection Runtime contract: §2 (Projection Worker Interface), §3 (Projection
> Store Abstraction), §4 (Event Dispatch Rules), and §9 (Replay Lifecycle).
>
> Track B (this document) covers only the **per-projection read-model
> definitions** — consumed-event lists, output shapes, and projection-specific
> rebuild logic — in §3–§10 below.

---

## 2. Consistency Model

> **Superseded — see [`projection-runtime.md`](./projection-runtime.md) §12.**
> The Finance Ops projection consistency model — ordering, durability,
> read-your-writes (and the opt-in `await_event_id` wait), cross-projection
> consistency, replay consistency, and degraded reads — is defined
> authoritatively by the Projection Runtime contract.

---

## 3. finance.projection.ledger

> **Implementation status — Phase 2B-8 (minimal ledger harness).** Implemented as
> `backend/lib/finance/projections/ledgerProjection.js`
> (`createLedgerProjectionWorker()`) — the first projection consumer built on the
> Phase 2B-7 Projection Runtime. The 2B-8 minimal scope consumes
> **`finance.journal.posted` only**; `finance.journal.reversed`, `as_of_date`
> point-in-time queries, and the `meta` block are deferred to a later phase.
> The worker conforms to the runtime worker contract: `handleEvent` / `replay`
> accumulate each journal line into a per-account bucket in the tenant-scoped
> store; `getProjection(tenantId, opts, store)` assembles the read model
> (`{ tenant_id, accounts, totals }`, accounts sorted by `account_name`,
> `balance_cents = debit_cents − credit_cents`). A `finance.journal.posted`
> event missing `payload.journal_entry.lines` throws — the runtime surfaces
> that as a degraded projection. The sections below remain the eventual
> full-ledger target.

### Purpose

Answers: "What is the current running balance for every account across all posted journal entries?"

Used by: the Finance Ledger console view. The primary accounting reference for double-entry balance verification.

### Consumed Events

| Event type                 | Effect                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `finance.journal.posted`   | Add all lines to account buckets.                                                             |
| `finance.journal.reversed` | Add the reversal entry's lines (which are already debits/credits swapped) to account buckets. |

Events for draft, validation failure, or pending-approval journal entries do not affect the ledger. Only entries with status `posted` or `reversed` contribute (matching `getPostedEntries` in `accountingEngine.js`).

### Read Model Shape

```js
{
  tenant_id: string,          // UUID
  as_of: string,              // ISO timestamp of the last event applied
  accounts: [
    {
      account_id: string | null,    // null when no explicit chart-of-accounts ID
      account_name: string,
      classification: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense',
      debit_cents: number,          // integer, always >= 0
      credit_cents: number,         // integer, always >= 0
      balance_cents: number,        // debit_cents - credit_cents (signed)
    }
  ],
  totals: {
    debit_cents: number,
    credit_cents: number,
  },
  meta: {
    entry_count: number,      // number of posted journal entries included
    last_rebuilt_at: string,  // ISO timestamp of last replay
    is_degraded: boolean,
  }
}
```

`accounts` is sorted ascending by `account_name`. When the same account appears across multiple journal entries, its buckets are accumulated (summed), matching `buildLedger` in `accountingEngine.js`.

### Query Interface

```js
getProjection(tenantId: string, opts?: {
  classification?: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense',
  account_id?: string,
  account_name_contains?: string,    // case-insensitive substring match
  as_of_date?: string,               // ISO date — only include entries with posted_at <= this date
  await_event_id?: string,
  timeout_ms?: number,               // default 2000
}): LedgerProjection
```

When `as_of_date` is provided, the projection filters the event stream to entries whose `created_at` (proxy for posting time) falls on or before that date before accumulating balances. This is a point-in-time query; it does not require a separate snapshot — it is computed by partial replay.

### Rebuild Semantics

Fully rebuildable from the event stream alone.

```
algorithm: RebuildLedger(events, tenantId)
  accountMap = {}
  for each event in events where event.tenant_id == tenantId:
    if event.event_type in ['finance.journal.posted', 'finance.journal.reversed']:
      journal = event.payload.journal_entry
      for each line in journal.lines:
        key = line.account_id ?? classification + ':' + account_name
        bucket = accountMap[key] ?? { debit_cents: 0, credit_cents: 0, ... }
        bucket.debit_cents  += line.debit_cents
        bucket.credit_cents += line.credit_cents
        bucket.balance_cents = bucket.debit_cents - bucket.credit_cents
        accountMap[key] = bucket
  return { accounts: sorted(accountMap.values()), totals: sum(accounts) }
```

### Staleness Tolerance

**Low.** The ledger is the accounting source of truth and is displayed in real time. Target: updated within 500 ms of event dispatch. Acceptable lag: up to 2 s under load. Beyond 5 s, the UI should display a staleness warning.

---

## 4. finance.projection.profit_loss

### Purpose

Answers: "What is revenue vs. expense vs. net income for a given period?"

Used by: the Finance P&L console panel, executive reporting, and the `executive_summary` projection as an input.

### Consumed Events

Same as `ledger`:

| Event type                 | Effect                                                        |
| -------------------------- | ------------------------------------------------------------- |
| `finance.journal.posted`   | Accumulate Revenue and Expense lines.                         |
| `finance.journal.reversed` | Accumulate reversal lines (reduces original Revenue/Expense). |

### Read Model Shape

```js
{
  tenant_id: string,
  period: {
    start_date: string | null,    // ISO date, null = all time
    end_date: string | null,      // ISO date, null = all time
  },
  as_of: string,
  revenue_accounts: [
    {
      account_id: string | null,
      account_name: string,
      classification: 'Revenue',
      debit_cents: number,
      credit_cents: number,
      amount_cents: number,   // credit_cents - debit_cents (net revenue contribution)
    }
  ],
  expense_accounts: [
    {
      account_id: string | null,
      account_name: string,
      classification: 'Expense',
      debit_cents: number,
      credit_cents: number,
      amount_cents: number,   // debit_cents - credit_cents (net expense amount)
    }
  ],
  totals: {
    revenue_cents: number,
    expense_cents: number,
    net_income_cents: number,   // revenue_cents - expense_cents
  },
  meta: {
    entry_count: number,
    last_rebuilt_at: string,
    is_degraded: boolean,
  }
}
```

### Query Interface

```js
getProjection(tenantId: string, opts?: {
  start_date?: string,         // ISO date, inclusive
  end_date?: string,           // ISO date, inclusive
  account_id?: string,
  await_event_id?: string,
  timeout_ms?: number,
}): ProfitLossProjection
```

When `start_date` / `end_date` are provided, only journal entries whose `created_at` falls within the range are included. This mirrors the period-based P&L behavior expected by accounting tools.

### Rebuild Semantics

Fully rebuildable from the event stream. Rebuild is identical to ledger rebuild but filters to Revenue and Expense classifications only.

```
algorithm: RebuildProfitLoss(events, tenantId, start_date, end_date)
  ledger = RebuildLedger(events filtered by date range, tenantId)
  revenue = ledger.accounts where classification == 'Revenue'
             with amount_cents = credit_cents - debit_cents
  expense = ledger.accounts where classification == 'Expense'
             with amount_cents = debit_cents - credit_cents
  return { revenue_accounts, expense_accounts, totals }
```

### Staleness Tolerance

**Medium.** P&L is typically reviewed periodically (hourly to daily). Target: updated within 5 s of event dispatch. Acceptable lag: up to 30 s. Point-in-time queries (with `start_date`/`end_date`) may be computed on demand from the event stream and do not need to be pre-materialized.

---

## 5. finance.projection.balance_sheet

### Purpose

Answers: "What are total assets, liabilities, and equity at a given point in time? Is the accounting equation (Assets = Liabilities + Equity) satisfied?"

Used by: the Finance Balance Sheet console panel, period-close reporting, compliance exports.

### Consumed Events

| Event type                 | Effect                                                               |
| -------------------------- | -------------------------------------------------------------------- |
| `finance.journal.posted`   | Accumulate Asset, Liability, and Equity lines.                       |
| `finance.journal.reversed` | Accumulate reversal lines (reduces original Asset/Liability/Equity). |

### Read Model Shape

```js
{
  tenant_id: string,
  as_of: string,
  assets: [
    {
      account_id: string | null,
      account_name: string,
      classification: 'Asset',
      debit_cents: number,
      credit_cents: number,
      amount_cents: number,    // debit_cents - credit_cents
    }
  ],
  liabilities: [
    {
      account_id: string | null,
      account_name: string,
      classification: 'Liability',
      debit_cents: number,
      credit_cents: number,
      amount_cents: number,    // credit_cents - debit_cents
    }
  ],
  equity: [
    {
      account_id: string | null,
      account_name: string,
      classification: 'Equity',
      debit_cents: number,
      credit_cents: number,
      amount_cents: number,    // credit_cents - debit_cents
    }
  ],
  totals: {
    assets_cents: number,
    liabilities_cents: number,
    equity_cents: number,
    balanced: boolean,          // assets_cents == liabilities_cents + equity_cents
  },
  meta: {
    entry_count: number,
    last_rebuilt_at: string,
    is_degraded: boolean,
  }
}
```

`totals.balanced` is a derived boolean included for quick validation. A `false` value indicates data integrity issues in the event stream (e.g., unbalanced entries that bypassed `assertBalancedJournal`).

### Query Interface

```js
getProjection(tenantId: string, opts?: {
  as_of_date?: string,          // ISO date — point-in-time balance sheet
  await_event_id?: string,
  timeout_ms?: number,
}): BalanceSheetProjection
```

### Rebuild Semantics

Fully rebuildable from the event stream. Algorithm is structurally identical to ledger rebuild, filtered to Asset/Liability/Equity classifications.

```
algorithm: RebuildBalanceSheet(events, tenantId, as_of_date)
  ledger = RebuildLedger(events filtered by as_of_date, tenantId)
  assets      = ledger.accounts where classification == 'Asset'
  liabilities = ledger.accounts where classification == 'Liability'
  equity      = ledger.accounts where classification == 'Equity'
  return { assets, liabilities, equity, totals with balanced check }
```

### Staleness Tolerance

**Medium-high.** Balance sheets are used for period reporting, not live dashboards. Target: updated within 30 s of event dispatch. Point-in-time queries may be computed on demand. Real-time display is not a requirement.

---

## 6. finance.projection.approval_queue

### Purpose

Answers: "Which finance actions are currently pending human approval, who requested them, and what is the risk level?"

Used by: the Finance Approvals console, workflow automation triggers, governance dashboards. This is the primary queue for human-in-the-loop finance operations.

### Consumed Events

| Event type                           | Effect                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `finance.approval.requested`         | Add a new pending approval record to the queue.                                                          |
| `finance.approval.approved`          | Update the approval record to `approved`, set `approved_by` and `approved_at`. Remove from pending view. |
| `finance.approval.rejected`          | Update the approval record to `rejected`, set `rejected_by` and `rejected_at`. Remove from pending view. |
| `finance.approval.cancelled`         | Mark the approval `cancelled`; remove from pending view, keep in resolved history.                       |
| `finance.journal.reversal_requested` | Add a pending approval record (reversals always require approval).                                       |

A `finance.approval.cancelled` event closes a pending approval before it is acted on:
the queue item is marked inactive/closed, removed from the `pending` worklist, and
retained in the `resolved` array with `status: 'cancelled'`. Cancellation never deletes
the approval — the full `requested → cancelled` history is preserved in the immutable
event stream and surfaced by the `audit_timeline` projection.

### Read Model Shape

```js
{
  tenant_id: string,
  as_of: string,
  pending: [
    {
      approval_id: string,               // 'approval_...'
      target_type: 'journal_entry' | 'invoice' | 'approval',
      target_id: string,
      status: 'pending',
      requested_by: string | null,       // actor_id
      requested_at: string,              // ISO timestamp
      approval_policy: string | null,    // e.g. 'finance.high_value.approval_required'
      escalation_target: string | null,  // e.g. 'finance_controller'
      risk_level: 'low' | 'medium' | 'high' | 'critical',
      amount_cents: number | null,       // if derivable from the aggregate
      ai_initiated: boolean,             // true when actor_type == 'ai_agent'
      braid_trace_id: string | null,
      correlation_id: string | null,
      age_seconds: number,               // derived: now() - requested_at
    }
  ],
  resolved: [
    {
      approval_id: string,
      target_type: string,
      target_id: string,
      status: 'approved' | 'rejected' | 'cancelled',
      requested_by: string | null,
      requested_at: string,
      resolved_by: string | null,    // approver, rejecter, or canceller
      resolved_at: string | null,
      approval_policy: string | null,
      risk_level: string,
      ai_initiated: boolean,
    }
  ],
  totals: {
    pending_count: number,
    resolved_count: number,
    critical_pending_count: number,
    ai_initiated_pending_count: number,
  },
  meta: {
    last_rebuilt_at: string,
    is_degraded: boolean,
  }
}
```

`age_seconds` is a live-computed field (not stored in the event stream). It is computed at query time as `Math.floor((Date.now() - Date.parse(requested_at)) / 1000)`.

By default `getProjection` returns only `pending`. Pass `{ include_resolved: true }` to include the `resolved` array.

### Query Interface

```js
getProjection(tenantId: string, opts?: {
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all',  // default: 'pending'
  target_type?: 'journal_entry' | 'invoice',
  risk_level?: 'low' | 'medium' | 'high' | 'critical',
  ai_initiated?: boolean,
  include_resolved?: boolean,                              // default: false
  limit?: number,                                          // default: 50
  offset?: number,                                         // default: 0
  await_event_id?: string,
  timeout_ms?: number,
}): ApprovalQueueProjection
```

### Rebuild Semantics

Fully rebuildable from the event stream.

```
algorithm: RebuildApprovalQueue(events, tenantId)
  approvalMap = {}
  for each event in events where event.tenant_id == tenantId:
    if event.event_type == 'finance.approval.requested'
    or event.event_type == 'finance.journal.reversal_requested':
      record = extract approval from event.payload
      approvalMap[record.approval_id] = { ...record, status: 'pending' }

    if event.event_type == 'finance.approval.approved':
      id = event.payload.approval.id
      approvalMap[id].status = 'approved'
      approvalMap[id].resolved_by = event.actor_id
      approvalMap[id].resolved_at = event.created_at

    if event.event_type == 'finance.approval.rejected':
      id = event.payload.approval.id
      approvalMap[id].status = 'rejected'
      approvalMap[id].resolved_by = event.actor_id
      approvalMap[id].resolved_at = event.created_at

    if event.event_type == 'finance.approval.cancelled':
      id = event.payload.approval.id
      approvalMap[id].status = 'cancelled'
      approvalMap[id].resolved_by = event.actor_id
      approvalMap[id].resolved_at = event.created_at

  pending  = approvalMap.values() where status == 'pending'
  resolved = approvalMap.values() where status in ['approved', 'rejected', 'cancelled']
  return { pending, resolved, totals }
```

### Staleness Tolerance

**Very low.** The approval queue is a live operational queue. Approvers act on it in real time. Target: updated within 200 ms of event dispatch. Acceptable lag: up to 1 s. A stale approval queue is a compliance risk (AI-initiated actions may proceed without timely human review).

---

## 7. finance.projection.adapter_queue

### Purpose

Answers: "Which finance sync jobs are queued, in-flight, succeeded, or failed for external accounting adapters (e.g., QuickBooks)?"

Used by: the Finance Integrations console, adapter health dashboards, retry workflows.

### Consumed Events

| Event type                       | Effect                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `finance.adapter.sync_queued`    | Add a new adapter job record with `status: 'queued'`.                                                              |
| `finance.adapter.sync_succeeded` | Update job to `status: 'succeeded'`, record `completed_at` and `external_id`.                                      |
| `finance.adapter.sync_failed`    | Update job to `status: 'failed'`, record `failed_at`, `error_code`, `error_message`.                               |
| `finance.approval.approved`      | When the approved aggregate has a linked adapter job in `draft` status, transition that job to `status: 'queued'`. |

The last rule handles the deal-won / reversal flows in `financeDomainService.js` where an adapter job is created in `draft` state alongside a pending approval, and only becomes `queued` after approval is granted.

### Read Model Shape

```js
{
  tenant_id: string,
  as_of: string,
  queued: [
    {
      job_id: string,                  // 'adapter_job_...'
      provider: string,                // 'quickbooks' | 'xero' | ...
      aggregate_type: string,
      aggregate_id: string,
      status: 'queued',
      queued_at: string,
      attempt_count: number,
      last_attempted_at: string | null,
      correlation_id: string | null,
    }
  ],
  in_flight: [
    {
      job_id: string,
      provider: string,
      aggregate_type: string,
      aggregate_id: string,
      status: 'in_flight',
      started_at: string,
      attempt_count: number,
    }
  ],
  succeeded: [
    {
      job_id: string,
      provider: string,
      aggregate_type: string,
      aggregate_id: string,
      status: 'succeeded',
      completed_at: string,
      external_id: string | null,      // ID assigned by the external system
      duration_ms: number | null,
    }
  ],
  failed: [
    {
      job_id: string,
      provider: string,
      aggregate_type: string,
      aggregate_id: string,
      status: 'failed',
      failed_at: string,
      error_code: string | null,
      error_message: string | null,
      attempt_count: number,
      retryable: boolean,
    }
  ],
  totals: {
    queued_count: number,
    in_flight_count: number,
    succeeded_count: number,
    failed_count: number,
    failure_rate_7d: number | null,    // computed if sufficient history, else null
  },
  meta: {
    last_rebuilt_at: string,
    is_degraded: boolean,
  }
}
```

### Query Interface

```js
getProjection(tenantId: string, opts?: {
  status?: 'queued' | 'in_flight' | 'succeeded' | 'failed' | 'all',  // default: 'all'
  provider?: string,
  aggregate_type?: string,
  aggregate_id?: string,
  since?: string,          // ISO date — filter by queued_at >= since
  limit?: number,          // default: 100
  offset?: number,         // default: 0
  await_event_id?: string,
  timeout_ms?: number,
}): AdapterQueueProjection
```

### Rebuild Semantics

Fully rebuildable from the event stream.

```
algorithm: RebuildAdapterQueue(events, tenantId)
  jobMap = {}
  for each event in events where event.tenant_id == tenantId:
    if event.event_type == 'finance.adapter.sync_queued':
      jobMap[event.payload.job_id] = { ...payload, status: 'queued', attempt_count: 0 }

    if event.event_type == 'finance.approval.approved':
      // find any draft adapter job linked to this approval's target_id (CF-1: approvals use target_id, not aggregate_id)
      for each job in jobMap where job.aggregate_id == event.payload.approval.target_id
                               and job.status == 'draft':
        job.status = 'queued'
        job.queued_at = event.created_at

    if event.event_type == 'finance.adapter.sync_succeeded':
      jobMap[event.payload.job_id].status = 'succeeded'
      jobMap[event.payload.job_id].completed_at = event.created_at
      jobMap[event.payload.job_id].external_id = event.payload.external_id ?? null

    if event.event_type == 'finance.adapter.sync_failed':
      jobMap[event.payload.job_id].status = 'failed'
      jobMap[event.payload.job_id].failed_at = event.created_at
      jobMap[event.payload.job_id].error_code = event.payload.error_code ?? null
      jobMap[event.payload.job_id].error_message = event.payload.error_message ?? null
      jobMap[event.payload.job_id].attempt_count += 1

  return partition jobMap.values() by status
```

Note: `in_flight` transitions are driven by the adapter runner (not by finance domain events). The adapter runner should emit `finance.adapter.sync_queued` with a `status: 'in_flight'` payload when it picks up a job, updating the projection. If the runner does not emit these events, jobs skip directly from `queued` to `succeeded` / `failed`.

### Staleness Tolerance

**Medium.** Adapter syncs are background jobs. Target: updated within 5 s of event dispatch. Acceptable lag: up to 60 s for `succeeded`/`failed` status updates.

---

## 8. finance.projection.audit_timeline

### Purpose

Answers: "What is the complete, ordered, tamper-evident log of all finance events for this tenant?"

Used by: the Finance Audit console, compliance exports, governance reviews, debugging. This projection is the event stream rendered as a human-readable read model — it must reflect every finance event without filtering.

### Consumed Events

All finance business event types:

```
finance.invoice.draft_created
finance.invoice.draft_updated
finance.invoice.submitted_for_approval
finance.journal.draft_created
finance.journal.validation_failed
finance.journal.post_requested
finance.journal.posted
finance.journal.reversal_requested
finance.journal.reversed
finance.approval.requested
finance.approval.approved
finance.approval.rejected
finance.approval.cancelled
finance.adapter.sync_queued
finance.adapter.sync_succeeded
finance.adapter.sync_failed
finance.governance.action_allowed
finance.governance.action_blocked
```

`finance.audit.event_appended` is a reserved internal infrastructure event, not a
business event. The audit timeline consumes it **only** when the projection is
explicitly configured to surface infrastructure events; by default it is filtered
out. It must never be treated as a substitute for the business event it accompanies.

### Read Model Shape

```js
{
  tenant_id: string,
  as_of: string,
  total_events: number,
  events: [
    {
      event_id: string,                // bare v4 UUID
      event_type: string,
      aggregate_type: string,
      aggregate_id: string | null,
      actor_id: string | null,
      actor_type: 'human' | 'ai_agent' | 'system',
      source: string,
      request_id: string | null,
      braid_trace_id: string | null,
      correlation_id: string | null,
      causation_id: string | null,
      created_at: string,              // ISO timestamp
      policy_summary: {
        allowed: boolean | null,
        requires_approval: boolean | null,
        risk_level: string | null,
        explanation: string | null,
      } | null,
      payload_summary: string,         // human-readable one-line description, derived
    }
  ],
  meta: {
    last_rebuilt_at: string,
    is_degraded: boolean,
  }
}
```

`payload_summary` is a derived human-readable description generated at write time (e.g., `"Invoice invoice_abc123 created by user_xyz"`, `"Journal entry journal_def456 posted — $1,250.00"`). It is not sourced from the payload directly; it is assembled by the projection worker to avoid storing raw payload blobs in the read model.

The `events` array is ordered `created_at DESC` by default (newest first) for console display.

### Query Interface

```js
getProjection(tenantId: string, opts?: {
  event_type?: string,                 // exact match or prefix (e.g., 'finance.journal.')
  aggregate_type?: string,
  aggregate_id?: string,
  actor_id?: string,
  actor_type?: 'human' | 'ai_agent' | 'system',
  braid_trace_id?: string,             // trace a specific AI agent action chain
  correlation_id?: string,
  since?: string,                      // ISO date, inclusive
  until?: string,                      // ISO date, inclusive
  order?: 'asc' | 'desc',             // default: 'desc'
  limit?: number,                      // default: 100, max: 1000
  offset?: number,                     // default: 0
  await_event_id?: string,
  timeout_ms?: number,
}): AuditTimelineProjection
```

### Rebuild Semantics

This projection is the event stream itself rendered as a read model. Rebuild is O(n) in the number of events.

```
algorithm: RebuildAuditTimeline(events, tenantId)
  result = []
  for each event in events where event.tenant_id == tenantId:
    result.push({
      event_id: event.id,
      event_type: event.event_type,
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      actor_id: event.actor_id,
      actor_type: event.actor_type,
      source: event.source,
      request_id: event.request_id,
      braid_trace_id: event.braid_trace_id,
      correlation_id: event.correlation_id,
      causation_id: event.causation_id,
      created_at: event.created_at,
      policy_summary: summarize(event.policy_decision),
      payload_summary: describePayload(event.event_type, event.payload),
    })
  return sorted(result, by created_at DESC)
```

Unlike other projections, the audit timeline should not discard or collapse events — every event must be preserved in the read model.

### Staleness Tolerance

**Low for audit display, highest for compliance exports.** New events should appear in the timeline within 1 s for live console display. Compliance exports (full dumps) can tolerate up to 60 s of lag and should be generated as batch jobs rather than real-time projection reads.

---

## 9. finance.projection.cash_position

### Purpose

Answers: "What is current cash on hand, and how does it change across recent posted activity?"

Used by: the Finance Cash console, CFO dashboard widget, treasury decisions. Focuses specifically on Asset accounts where liquidity can be inferred from the journal lines.

This projection does not model bank account reconciliation or external cash data — it is a derived view of the double-entry ledger, restricted to accounts classified as `Asset` with a name matching common cash/liquidity patterns (`Cash`, `Bank`, `Accounts Receivable`). The exact set of cash-like accounts is configurable per tenant; a reasonable default is provided.

### Consumed Events

| Event type                 | Effect                                                    |
| -------------------------- | --------------------------------------------------------- |
| `finance.journal.posted`   | Update cash account balances from Asset-classified lines. |
| `finance.journal.reversed` | Update cash account balances from reversal lines.         |

### Read Model Shape

```js
{
  tenant_id: string,
  as_of: string,
  cash_accounts: [
    {
      account_id: string | null,
      account_name: string,
      classification: 'Asset',
      balance_cents: number,        // debit_cents - credit_cents
      debit_cents: number,
      credit_cents: number,
      is_liquid: boolean,           // true for Cash/Bank; false for AR (configurable)
    }
  ],
  totals: {
    total_cash_cents: number,        // sum of balance_cents for is_liquid == true accounts
    total_ar_cents: number,          // sum of balance_cents for Accounts Receivable
    total_asset_cents: number,       // sum of all cash_accounts balance_cents
  },
  recent_activity: [
    {
      journal_entry_id: string,
      posted_at: string,
      memo: string | null,
      net_cash_impact_cents: number,  // net change to liquid accounts from this entry
    }
  ],
  meta: {
    cash_account_patterns: string[], // patterns used to select cash accounts, e.g. ['Cash', 'Bank']
    last_rebuilt_at: string,
    is_degraded: boolean,
  }
}
```

`recent_activity` includes the last 30 posted journal entries that touched at least one cash account, ordered by `posted_at DESC`.

### Query Interface

```js
getProjection(tenantId: string, opts?: {
  include_ar?: boolean,              // include Accounts Receivable in cash_accounts; default: true
  since?: string,                    // ISO date — filter recent_activity
  cash_account_patterns?: string[],  // override tenant's configured cash account name patterns
  await_event_id?: string,
  timeout_ms?: number,
}): CashPositionProjection
```

### Rebuild Semantics

Fully rebuildable from the event stream. The algorithm is a specialization of `RebuildLedger` filtered to Asset accounts matching cash patterns.

```
algorithm: RebuildCashPosition(events, tenantId, cashPatterns)
  assetAccounts = RebuildLedger(events, tenantId).accounts
                    where classification == 'Asset'
  cashAccounts = assetAccounts where account_name matches any cashPattern
  recentActivity = []
  for each event in last 30 matching journal events:
    netImpact = sum(line.debit_cents - line.credit_cents
                    for line in event.payload.journal_entry.lines
                    where line is a liquid cash account)
    recentActivity.push({ journal_entry_id, posted_at, memo, netImpact })
  return { cash_accounts: cashAccounts, totals, recent_activity: recentActivity }
```

### Staleness Tolerance

**Low.** Cash position is monitored in near-real-time for treasury decisions. Target: updated within 1 s of a journal post event. Acceptable lag: up to 5 s.

---

## 10. finance.projection.executive_summary

### Purpose

Answers: "What is the finance health of this tenant at a glance — revenue, expenses, net income, cash on hand, pending approvals, and adapter health?"

Used by: the Executive Dashboard, AI assistant summary responses (via Braid `snapshot` tool), management reporting. This projection is a roll-up of the other projections into a single low-latency read model suitable for dashboard widgets.

Because it aggregates across multiple projections, its figures may reflect slightly different points in the event stream (see Consistency Model, section 2).

### Consumed Events

All events that affect any of the underlying projections:

```
finance.journal.posted
finance.journal.reversed
finance.approval.requested
finance.approval.approved
finance.approval.rejected
finance.adapter.sync_queued
finance.adapter.sync_succeeded
finance.adapter.sync_failed
finance.governance.action_blocked
```

### Read Model Shape

```js
{
  tenant_id: string,
  as_of: string,               // timestamp of the most recently applied event across all inputs
  period: {
    start_date: string | null, // current reporting period start (month-to-date if null)
    end_date: string | null,
  },
  financials: {
    revenue_cents: number,
    expense_cents: number,
    net_income_cents: number,
    total_cash_cents: number,
    total_assets_cents: number,
    total_liabilities_cents: number,
    total_equity_cents: number,
  },
  approvals: {
    pending_count: number,
    critical_pending_count: number,
    ai_initiated_pending_count: number,
    oldest_pending_age_seconds: number | null,
  },
  adapters: {
    queued_count: number,
    in_flight_count: number,
    failed_count: number,
    failure_rate_7d: number | null,
  },
  governance: {
    blocked_actions_7d: number,   // count of finance.governance.action_blocked events in last 7 days
    ai_actions_7d: number,        // total AI-initiated events in last 7 days
  },
  alerts: [
    {
      level: 'info' | 'warning' | 'critical',
      code: string,                // e.g. 'CRITICAL_APPROVALS_PENDING', 'ADAPTER_FAILURES'
      message: string,
    }
  ],
  meta: {
    last_rebuilt_at: string,
    is_degraded: boolean,
    component_staleness: {
      ledger_as_of: string,
      approval_queue_as_of: string,
      adapter_queue_as_of: string,
    }
  }
}
```

`alerts` is a derived list generated by the worker applying threshold rules:

- `CRITICAL_APPROVALS_PENDING`: `approvals.critical_pending_count > 0`
- `OLD_PENDING_APPROVAL`: any approval pending > 3600 s (1 hour)
- `ADAPTER_FAILURES`: `adapters.failed_count > 0`
- `AI_ACTION_BLOCKED`: any `finance.governance.action_blocked` events in last 24 hours
- `BALANCE_SHEET_UNBALANCED`: `total_assets_cents != total_liabilities_cents + total_equity_cents`

### Query Interface

```js
getProjection(tenantId: string, opts?: {
  period_start?: string,     // ISO date for financials period; default: first day of current month
  period_end?: string,       // ISO date; default: today
  await_event_id?: string,
  timeout_ms?: number,
}): ExecutiveSummaryProjection
```

### Rebuild Semantics

The executive summary worker maintains its own materialized state rather than delegating to other projection workers at query time. This avoids cross-projection read latency on the hot path.

Rebuild algorithm:

```
algorithm: RebuildExecutiveSummary(events, tenantId)
  // Delegate to sub-algorithms; these can share a single event stream pass
  pl     = RebuildProfitLoss(events, tenantId, periodStart, periodEnd)
  bs     = RebuildBalanceSheet(events, tenantId)
  cash   = RebuildCashPosition(events, tenantId, defaultCashPatterns)
  approvals = RebuildApprovalQueue(events, tenantId)
  adapters  = RebuildAdapterQueue(events, tenantId)
  governance_blocked = count events of type 'finance.governance.action_blocked'
                        in last 7 days
  ai_actions = count events where actor_type == 'ai_agent' in last 7 days

  summary = {
    financials: merge pl.totals + bs.totals + cash.totals,
    approvals: summarize approvals.totals,
    adapters: summarize adapters.totals,
    governance: { blocked_actions_7d, ai_actions_7d },
    alerts: applyAlertRules(...)
  }
  return summary
```

Implementors may optimize this to a single O(n) event stream pass rather than five separate passes.

### Staleness Tolerance

**Medium.** The executive summary is a dashboard widget updated on page load and via polling (every 30–60 s is acceptable). Target: updated within 10 s of any triggering event. Acceptable lag: up to 60 s. The `meta.component_staleness` field lets UI consumers display per-component freshness indicators.

---

## Design Decisions and Rationale

**All monetary amounts are integers in cents.** Floating-point currency arithmetic is never used. This matches the existing `accountingEngine.js` convention (`debit_cents`, `credit_cents`, `balance_cents`).

**`as_of_date` queries use `created_at` as the posting timestamp proxy.** The event envelope does not include a separate `effective_date` field. Until accounting periods are formally tracked, `created_at` serves as the posting date. When effective date tracking is added, projections that support `as_of_date` / `start_date` / `end_date` will need to be updated to use the accounting period field, not `created_at`.

**`finance.journal.posted` and `finance.journal.reversed` are the only events that affect accounting projections.** Draft and pending-approval entries do not touch the ledger, P&L, balance sheet, or cash position. This mirrors the `getPostedEntries` filter in `accountingEngine.js` which only includes entries with `status in ['posted', 'reversed']`.

**Adapter jobs in `draft` status.** The `financeDomainService.js` `simulateDealWon` method creates adapter jobs with `status: 'draft'` — these are not yet `queued`. The adapter_queue projection handles the `finance.approval.approved` event to transition draft jobs to `queued`. This implies that `event.payload` for `finance.approval.approved` must include enough information to correlate back to the draft adapter job (specifically the `aggregate_id` of the approved item). Workers must handle missing correlations gracefully.

**`executive_summary` materializes its own state.** An alternative design would have `getProjection` on the executive summary fan out to the other seven projection workers at query time. This is rejected because it couples read latency to the slowest sub-projection and makes staleness reasoning harder. Each projection worker is independent; the executive summary worker subscribes to the same events and maintains its own denormalized state.

**`audit_timeline` is append-only.** Events are never deleted or updated in this projection. If an event was applied incorrectly, a compensating event is emitted; both the original and compensating events appear in the timeline. This preserves the tamper-evident property required for compliance.

**`cash_position` uses account name pattern matching.** The current schema does not have a chart-of-accounts table with explicit `is_cash` flags. Pattern matching on `account_name` is a pragmatic default. When a chart-of-accounts entity is added to the Finance domain, the cash position projection should be updated to use explicit account metadata instead of name patterns.
