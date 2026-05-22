# Finance Ops: Audit and Evidence Layer

**Track D — Design Specification**
**Status:** Draft v1.0 | December 2025 — §7 interface implemented (Phase 2B-11; see §9)
**Scope:** `finance.audit_events`, evidence pack generation, auditor query interface, retention policy

---

## Overview

Every finance action in AiSHA — whether initiated by a human user, an AI agent, or an automated system — leaves an immutable record in `finance.audit_events`. This document specifies the canonical shape of that record, how immutability is enforced at every layer, how linked events form a traceable chain of custody, and what auditors and external reviewers receive as evidence.

The audit layer is not a logging side-effect. It is a first-class part of the Finance Ops domain. Every service method in `financeDomainService.js` emits a structured event envelope before returning. That envelope is the audit record.

---

## 1. Audit Event Schema

### 1.1 Canonical Shape

The `finance.audit_events` table stores one row per finance event. The row maps directly from the finance event envelope produced by `financeEventEnvelope.js`.

```sql
-- finance.audit_events (from migration 168, with additions specified here)
create table finance.audit_events (
  -- Identity
  id              uuid primary key default gen_random_uuid(),  -- bare v4 UUID; never evt_-prefixed (M-1)
  tenant_id       uuid not null,

  -- Event classification
  event_type      text not null,                 -- see taxonomy §1.2
  aggregate_type  text not null,                 -- 'journal_entry' | 'invoice' | 'approval' | 'adapter_job'
  aggregate_id    text,                          -- id of the affected aggregate

  -- Actor
  actor_id        text,                          -- user uuid or ai agent identifier; null for system events
  actor_type      text not null
                    check (actor_type in ('human', 'ai_agent', 'system')),

  -- Source
  source          text not null
                    check (source in ('crm', 'finance', 'braid', 'adapter', 'workflow')),

  -- Request tracing
  request_id      text,                          -- HTTP x-request-id header or job id
  braid_trace_id  text,                          -- Braid execution trace id; null for non-AI events
  correlation_id  text,                          -- groups all events for one user intent / workflow run
  causation_id    text,                          -- id of the event or command that caused this event

  -- Payload
  payload         jsonb not null default '{}',   -- domain-specific data (see §1.3)
  policy_decision jsonb not null default '{}',   -- governance decision snapshot (see §4)

  -- AI lineage (also captured inside policy_decision; promoted here for query indexing)
  model           text,                          -- e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022'
  prompt_hash     text,                          -- SHA-256 of the prompt sent to the model

  -- Network metadata (optional; captured by HTTP middleware when available)
  ip_address      inet,
  user_agent      text,

  -- Timestamp — set by the DB, never by the application
  created_at      timestamptz not null default now()
);
```

**Key design choices:**

- `id` is a bare v4 UUID (`randomUUID()` from `node:crypto`). Prefixed formats (`evt_*`) are not used because `finance.audit_events.id` is a `uuid` column in Postgres — prefixed strings fail at insert (M-1).
- `created_at` is DB-generated (`default now()`). Application code must not supply this value; the DB clock is the source of truth for ordering.
- `model` and `prompt_hash` are promoted from inside `policy_decision.jsonb` to top-level columns so they can be indexed and queried without JSONB extraction. The values must remain identical inside `policy_decision` as well.

### 1.2 Event Type Taxonomy

Event types follow the pattern `finance.<aggregate>.<past_tense_verb>`. All defined types:

| Event type                               | Aggregate       | Trigger                                        |
| ---------------------------------------- | --------------- | ---------------------------------------------- |
| `finance.journal.draft_created`          | `journal_entry` | `createJournalDraft()` success                 |
| `finance.journal.validation_failed`      | `journal_entry` | `assertBalancedJournal()` throws               |
| `finance.journal.reversal_requested`     | `journal_entry` | `reverseJournalEntry()` success                |
| `finance.journal.reversal_approved`      | `journal_entry` | reversal approval granted                      |
| `finance.journal.posted`                 | `journal_entry` | entry transitions to `posted`                  |
| `finance.journal.reversed`               | `journal_entry` | reversal entry transitions to `posted`         |
| `finance.journal.voided`                 | `journal_entry` | entry voided before posting                    |
| `finance.invoice.draft_created`          | `invoice`       | `createDraftInvoice()` success                 |
| `finance.invoice.draft_updated`          | `invoice`       | `updateDraftInvoice()` success                 |
| `finance.invoice.submitted_for_approval` | `invoice`       | status → `pending_approval`                    |
| `finance.invoice.approved`               | `invoice`       | `approveFinanceAction()` on invoice            |
| `finance.invoice.sent`                   | `invoice`       | status → `sent`                                |
| `finance.invoice.paid`                   | `invoice`       | status → `paid`                                |
| `finance.invoice.voided`                 | `invoice`       | status → `voided`                              |
| `finance.approval.requested`             | `approval`      | approval record created                        |
| `finance.approval.approved`              | `approval`      | `approveFinanceAction()` success               |
| `finance.approval.rejected`              | `approval`      | `rejectFinanceAction()` success                |
| `finance.approval.cancelled`             | `approval`      | `cancelApproval()` success                     |
| `finance.approval.escalated`             | `approval`      | escalation triggered                           |
| `finance.adapter.sync_queued`            | `adapter_job`   | job status → `queued`                          |
| `finance.adapter.sync_succeeded`         | `adapter_job`   | job status → `succeeded`                       |
| `finance.adapter.sync_failed`            | `adapter_job`   | job status → `failed`                          |
| `finance.governance.action_blocked`      | varies          | governance evaluation returns `allowed: false` |

`finance.audit.event_appended` is intentionally **not** in the table above. It is a
reserved internal infrastructure event — an event-store integrity signal (event
persisted / checksummed / replicated / dispatched / archived), not a business domain
event. It is never emitted in place of the actual business event, and evidence packs
(§6) include it only when proving event-store integrity, not as part of normal
business flow. See the canonical taxonomy split in the Finance Ops scaffold.

### 1.3 Payload Structure

`payload` contains the domain-specific data for the event. It is always a snapshot, not a reference. The following conventions apply:

- For `draft_created` and `draft_updated` events: `payload` contains the full aggregate state at the time of the event (`{ invoice: {...} }` or `{ journal_entry: {...} }`).
- For `reversal_requested`: `payload` contains `{ original_entry_id, reversal_entry, approval }`.
- For `validation_failed`: `payload` contains `{ errors: string[] }`.
- For `approval.*`: `payload` contains the full approval record snapshot.
- For `adapter.*`: `payload` contains `{ provider, aggregate_type, aggregate_id, status }`.

Before/after state comparison for mutation events is reconstructed from sequential `payload` snapshots in the event log, not from separate `before_state`/`after_state` columns. This is a deliberate departure from the original `finance.audit_events` DDL in the task brief. The event-sourced payload approach eliminates the risk of `before_state` being stale (when a write partially fails) and makes the event log self-contained.

---

## 2. Immutability Contract

Audit events are written once and never modified or deleted. This is enforced at three layers.

### 2.1 Database Layer

Two mechanisms enforce append-only at the Postgres level:

**Trigger: block UPDATE and DELETE**

```sql
create or replace function finance.audit_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'finance.audit_events is immutable: UPDATE and DELETE are not permitted (event_id=%)', old.id
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_audit_events_no_update
  before update on finance.audit_events
  for each row execute function finance.audit_events_immutable();

create trigger trg_audit_events_no_delete
  before delete on finance.audit_events
  for each row execute function finance.audit_events_immutable();
```

**GRANT restriction: revoke destructive privileges**

The application database role (e.g., `aishacrm_app`) must have only `INSERT` and `SELECT` on `finance.audit_events`. `UPDATE` and `DELETE` must never be granted. The immutability trigger above is a belt-and-suspenders measure for cases where a DBA role executes a statement directly.

```sql
-- Application role: read + append only
grant select, insert on finance.audit_events to aishacrm_app;
-- Never grant: update, delete, truncate

-- DBA role: still blocked by trigger; requires explicit trigger drop + re-add for true override
```

**Note on TRUNCATE:** Postgres triggers do not fire on `TRUNCATE` by default unless a statement-level trigger is created. Add a statement-level trigger:

```sql
create trigger trg_audit_events_no_truncate
  before truncate on finance.audit_events
  for each statement execute function finance.audit_events_immutable();
```

### 2.2 Application Layer

`financeEventStore.js` enforces append-only in the in-memory store used during development and testing. Events are frozen with `Object.freeze()` immediately on append:

```js
const event = Object.freeze({
  id: generateEventId(),
  // ...fields
});
log.push(event);
```

The `log` array itself is not exposed — only the `append`, `query`, `replay`, and `getCount` interfaces are returned from `createFinanceEventStore()`. There is no `delete`, `update`, or `clear` method on the store.

In the persistent path (Supabase), `financeDomainService.js` routes all event writes through the event envelope factory (`createFinanceEventEnvelope`) and then to the DB insert. The service layer has no code path that issues an UPDATE or DELETE against `finance.audit_events`.

**Application-layer guard (to be added to the Supabase persistence adapter when implemented):**

```js
// In the Supabase-backed event store adapter
async function append(event) {
  // Never update an existing row — insert only
  const { error } = await supabase.from('finance.audit_events').insert(event);

  if (error) {
    // Surface the error; do NOT silently retry with an upsert or update
    throw new FinanceEventStoreError(
      `Failed to append audit event: ${error.message}`,
      'FINANCE_EVENT_STORE_DB_ERROR',
    );
  }
}

// No update(), delete(), or upsert() methods exist on this adapter
```

### 2.3 API Layer

The `finance.v2.js` route file exposes no endpoint that reads from or writes to `finance.audit_events` other than through `listAuditEvents()` (a GET). There is no DELETE or PATCH route for audit events, and no route parameter that could be exploited to target an audit event row.

The audit query and evidence pack interfaces described in §7 are read-only. They return copies of event data; they do not expose any mutating path.

**What is blocked:**

- No route exposes `DELETE /finance/v2/audit-events/:id`.
- No route exposes `PATCH /finance/v2/audit-events/:id`.
- The `policy_decision` field on an event cannot be overwritten after the fact via any route.
- The `buildEvidencePack()` function is read-only; it does not create, modify, or delete any records.

---

## 3. Chain-of-Custody Model

A chain of custody is a reconstructible sequence of events that proves, without gaps, what happened to a finance record from creation to its final state.

### 3.1 Linking Fields

Three fields connect events into chains:

| Field            | Purpose                                                        | Set by                                                              |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `correlation_id` | Groups all events for one user intent or workflow run          | `financeEventEnvelope.js`: defaults to `request_id` if not supplied |
| `causation_id`   | Points to the event or command that directly caused this event | Caller; usually the `id` of the preceding event                     |
| `braid_trace_id` | Links all events in a single Braid tool execution              | Passed through from the Braid runtime                               |

`correlation_id` is the widest grouping. All events for "the AI agent drafted an invoice in response to user request X" share the same `correlation_id`. `causation_id` is the narrowest: it points to the single event that caused the next one in the chain.

### 3.2 Reconstructing a Chain

Given a `journal_entry_id` (or any aggregate ID), reconstruct the full history:

```sql
-- Step 1: All events for this aggregate
select * from finance.audit_events
where tenant_id = $1
  and aggregate_id = $2
order by created_at asc;

-- Step 2: Widen to all correlated events (full intent span)
select * from finance.audit_events
where tenant_id = $1
  and correlation_id = (
    select correlation_id from finance.audit_events
    where tenant_id = $1 and aggregate_id = $2
    order by created_at asc
    limit 1
  )
order by created_at asc;
```

For a reversal chain, `causation_id` traversal is used (see §5).

### 3.3 Example: AI-drafted invoice → human approved → posted

```
[event 1] finance.invoice.draft_created
  id:             00000000-0000-4000-8000-00000000aaaa
  correlation_id: req_1234                              ← HTTP request from Braid tool call
  causation_id:   null                                  ← first event in the chain
  braid_trace_id: trace_braid_001
  actor_type:     ai_agent

[event 2] finance.approval.requested
  id:             00000000-0000-4000-8000-00000000bbbb
  correlation_id: req_1234                              ← same request span
  causation_id:   00000000-0000-4000-8000-00000000aaaa  ← caused by draft creation
  braid_trace_id: trace_braid_001
  actor_type:     ai_agent

[event 3] finance.approval.approved
  id:             00000000-0000-4000-8000-00000000cccc
  correlation_id: req_9999                              ← human reviewer's request
  causation_id:   00000000-0000-4000-8000-00000000bbbb  ← caused by approval request
  braid_trace_id: null                                  ← human action; no Braid trace
  actor_type:     human

[event 4] finance.invoice.posted
  id:             00000000-0000-4000-8000-00000000dddd
  correlation_id: req_9999
  causation_id:   00000000-0000-4000-8000-00000000cccc
  braid_trace_id: null
  actor_type:     human
```

The full chain is reconstructible by: (a) fetching by `aggregate_id`, or (b) following `causation_id` links from any event in the chain.

---

## 4. AI Action Lineage

When `actor_type = 'ai_agent'`, the following fields must be present in the audit event. Fields marked **required** will cause the event append to fail if absent.

### 4.1 Required Fields for AI Events

| Field                          | Location                       | Description                                                                                                                                                                               |
| ------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ---------- |
| `braid_trace_id`               | top-level column               | The Braid execution trace ID. Links the event to the full Braid tool call log, including input parameters, intermediate steps, and model response. Required if `actor_type = 'ai_agent'`. |
| `actor_id`                     | top-level column               | The AI agent's identifier. For Braid-initiated actions, this is the Braid session or agent ID.                                                                                            |
| `policy_decision.model`        | inside `policy_decision` jsonb | The model identifier used (e.g., `gpt-4o`, `claude-3-5-sonnet-20241022`).                                                                                                                 |
| `policy_decision.prompt_hash`  | inside `policy_decision` jsonb | SHA-256 hex digest of the prompt sent to the model. Used to verify that the prompt on file matches what was actually sent.                                                                |
| `policy_decision.evaluated_at` | inside `policy_decision` jsonb | ISO timestamp of when the governance evaluation ran.                                                                                                                                      |
| `policy_decision.allowed`      | inside `policy_decision` jsonb | Whether the action was permitted.                                                                                                                                                         |
| `policy_decision.risk_level`   | inside `policy_decision` jsonb | `low`                                                                                                                                                                                     | `medium` | `high` | `critical` |
| `policy_decision.policy_trace` | inside `policy_decision` jsonb | Array of policies evaluated, their result, and the reason.                                                                                                                                |

`model` and `prompt_hash` are also promoted to top-level columns on `finance.audit_events` for indexing (see §1.1).

### 4.2 Additional Recommended Fields

These fields are not currently captured by `financeGovernanceDecision.js` but should be added:

| Field                           | Where to add            | Description                                                                                  |
| ------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| `policy_decision.model_version` | `policy_decision` jsonb | Full model version string including date suffix if applicable                                |
| `policy_decision.temperature`   | `policy_decision` jsonb | Inference temperature used; relevant for reproducibility                                     |
| `policy_decision.token_count`   | `policy_decision` jsonb | `{ prompt_tokens, completion_tokens }` — useful for cost attribution and anomaly detection   |
| `policy_decision.tool_call_id`  | `policy_decision` jsonb | If the AI action was a tool call within a larger conversation, the tool call ID              |
| `payload.ai_reasoning_summary`  | `payload` jsonb         | A plain-language summary of the AI's stated reasoning (not the full prompt, which is hashed) |

### 4.3 Governance Decision Shape (Current Implementation)

From `financeGovernanceDecision.js`, `createGovernanceDecision()` returns:

```js
{
  allowed: boolean,
  requires_approval: boolean,
  risk_level: 'low' | 'medium' | 'high' | 'critical',
  blocked_actions: string[],
  approval_policy: string | null,     // e.g. 'finance.ai.no_money_movement'
  escalation_target: string | null,   // e.g. 'finance_controller'
  explanation: string,
  policy_trace: [
    {
      policy: string,   // policy identifier
      result: string,   // 'allow' | 'block' | 'approval_required'
      reason: string    // human-readable explanation
    }
  ],
  braid_trace_id: string | null,
  model: string | null,
  prompt_hash: string | null,
  evaluated_at: ISO string
}
```

This object is stored verbatim as `policy_decision` in the audit event row.

### 4.4 AI Hard Blocks

Three commands are permanently blocked for AI actors (from `financeGovernanceDecision.js`):

- `ApproveFinanceActionCommand` — AI cannot approve its own recommendations.
- `RejectFinanceActionCommand` — AI cannot reject approvals.
- `PostJournalEntryCommand` — AI cannot post ledger truth.

When any of these is attempted by an `ai_agent` actor, a `finance.governance.action_blocked` audit event is written with `policy_decision.allowed = false`, and the action is rejected with HTTP 403. The audit event is written even when the action is blocked.

---

## 5. Reversal Chain

A reversal is not a correction of an existing record. It is a new journal entry that inverts the lines of the original, producing a net-zero effect when both are posted. The audit trail must capture every step.

### 5.1 Reversal Lifecycle Events

```
finance.journal.reversal_requested  →  finance.journal.reversal_approved  →  finance.journal.reversed
```

Mapped to aggregate IDs:

```
original_entry (id: A) → reversal_entry (id: B, reversal_of: A)
```

### 5.2 Causation Chain for Reversals

```
[event 1] finance.journal.posted       -- aggregate_id: A, causation_id: null (or prior event)
[event 2] finance.journal.reversal_requested  -- aggregate_id: B, causation_id: (event 1 id), payload.original_entry_id: A
[event 3] finance.approval.requested   -- aggregate_id: approval_R, causation_id: (event 2 id)
[event 4] finance.approval.approved    -- aggregate_id: approval_R, causation_id: (event 3 id)
[event 5] finance.journal.reversed     -- aggregate_id: B, causation_id: (event 4 id), payload.original_entry_id: A
```

`payload.original_entry_id` in events 2 and 5 provides a direct foreign-key-style link back to entry A without requiring a join through `finance.journal_entries.reversal_of`.

### 5.3 Reconstructing a Reversal Chain from the Audit Log

```js
// See §7 for the full interface spec
async function getReversalChain(tenantId, journalEntryId) {
  // 1. Find the original entry's first audit event
  const originEvents = await queryAuditTimeline({
    tenant_id: tenantId,
    target_id: journalEntryId,
  });

  // 2. Find all events where payload.original_entry_id = journalEntryId
  //    (these are the reversal events pointing back to the original)
  const reversalEvents = await queryAuditTimeline({
    tenant_id: tenantId,
    payload_filter: { original_entry_id: journalEntryId },
  });

  // 3. For each reversal entry found, fetch its own event chain
  const reversalEntryIds = [...new Set(reversalEvents.map((e) => e.aggregate_id).filter(Boolean))];

  const reversalChainEvents = await Promise.all(
    reversalEntryIds.map((id) => queryAuditTimeline({ tenant_id: tenantId, target_id: id })),
  );

  return {
    original_entry_id: journalEntryId,
    original_events: originEvents,
    reversal_chains: reversalEntryIds.map((id, i) => ({
      reversal_entry_id: id,
      events: reversalChainEvents[i],
    })),
  };
}
```

### 5.4 Database Query for Reversal Chain

```sql
-- All events for the original entry and any of its reversals
with original as (
  select id from finance.audit_events
  where tenant_id = $1 and aggregate_id = $2
),
reversal_ids as (
  select distinct aggregate_id
  from finance.audit_events
  where tenant_id = $1
    and payload->>'original_entry_id' = $2
)
select ae.*
from finance.audit_events ae
where ae.tenant_id = $1
  and (
    ae.aggregate_id = $2
    or ae.aggregate_id in (select aggregate_id from reversal_ids)
  )
order by ae.created_at asc;
```

---

## 6. Evidence Pack

An evidence pack is a tamper-evident export of all audit events, approval records, governance decisions, and before/after state snapshots for a given tenant and time range or specific aggregate. It is the primary artifact provided to external auditors.

### 6.1 Inputs

```ts
interface EvidencePackRequest {
  tenant_id: string; // UUID
  from_date: string; // ISO date, inclusive
  to_date: string; // ISO date, inclusive
  target_type?: string; // optional: 'invoice' | 'journal_entry' | 'approval'
  target_id?: string; // optional: specific aggregate ID
}
```

When `target_id` is provided, the pack includes all correlated events (full `correlation_id` span), not only events whose `aggregate_id` matches `target_id`. This ensures an AI-initiated action chain is fully captured even if the user queries by the final aggregate.

### 6.2 Contents

An evidence pack is a single JSON document with the following sections:

```js
{
  // Pack metadata
  pack_id: "pack_{uuid}",
  generated_at: "ISO timestamp",
  generated_by: { actor_id, actor_type },
  tenant_id: "uuid",
  query: {
    from_date, to_date, target_type, target_id
  },

  // Integrity
  event_count: 42,
  integrity: {
    algorithm: "SHA-256",
    // Hash of: JSON.stringify(events, null, 0) — stable, no whitespace
    // events array must be sorted by created_at asc before hashing
    events_hash: "a3f9...",
    // Hash of: JSON.stringify(approvals, null, 0)
    approvals_hash: "b7c2...",
    // Hash of the pack itself excluding this integrity.pack_hash field
    pack_hash: "d1e4..."
  },

  // Summary (human-readable)
  summary: {
    period: { from: "...", to: "..." },
    event_types: { "finance.invoice.draft_created": 3, "finance.approval.approved": 2, ... },
    actors: [{ actor_id, actor_type, event_count }],
    ai_actions: { total: 5, blocked: 1, required_approval: 4 },
    reversals: { count: 1, entries: ["journal_aaa"] }
  },

  // Events (sorted by created_at asc)
  events: [
    { ...full audit event row }
  ],

  // Approval records linked to events in this pack
  approvals: [
    {
      id, tenant_id, aggregate_type, aggregate_id,
      status, requested_by, requested_at,
      approved_by, approved_at,
      rejected_by, rejected_at,
      approval_policy, escalation_target,
      evidence: { ... }
    }
  ],

  // Before/after state reconstruction
  // Derived from sequential payload snapshots in the events array
  state_timeline: [
    {
      aggregate_type: "invoice",
      aggregate_id: "invoice_aaa",
      snapshots: [
        { event_id: "00000000-0000-4000-8000-aaa000000001", event_type: "finance.invoice.draft_created", state: { ... } },
        { event_id: "00000000-0000-4000-8000-aaa000000002", event_type: "finance.invoice.draft_updated", state: { ... } }
      ]
    }
  ],

  // Governance decisions (deduplicated; one entry per unique policy_decision snapshot)
  governance_decisions: [
    {
      event_id: "00000000-0000-4000-8000-aaa000000001",
      event_type: "finance.invoice.draft_created",
      decision: { ...full policy_decision object }
    }
  ]
}
```

### 6.3 Tamper Evidence

The integrity section uses SHA-256 hashes computed at pack generation time:

1. **`events_hash`**: `SHA-256(JSON.stringify(events_array_sorted_by_created_at))`. Any modification to an event row (including retroactive edits if the immutability trigger were bypassed) will produce a different hash on recomputation.

2. **`approvals_hash`**: Same pattern over the `approvals` array.

3. **`pack_hash`**: `SHA-256(JSON.stringify(pack_without_pack_hash_field))`. Covers the entire document including `events_hash` and `approvals_hash`. An auditor can recompute this hash from the raw JSON to verify the pack has not been modified since generation.

An auditor receiving a pack can re-hash the events against the live DB to detect discrepancies. This is the primary verification workflow:

```js
// Auditor verification pseudocode
const liveEvents = await queryAuditTimeline({ tenant_id, from, to, target_id });
const liveHash = sha256(JSON.stringify(liveEvents.sort(byCreatedAt)));
assert(
  liveHash === pack.integrity.events_hash,
  'Evidence pack events_hash does not match live audit log — potential tampering or pack is stale',
);
```

### 6.4 Example: AI-drafted invoice → human approved → posted

```json
{
  "pack_id": "pack_a1b2c3d4",
  "generated_at": "2025-12-19T10:00:00Z",
  "generated_by": { "actor_id": "user_finance_controller_uuid", "actor_type": "human" },
  "tenant_id": "759a83e8-...",
  "query": {
    "from_date": "2025-12-18",
    "to_date": "2025-12-19",
    "target_type": "invoice",
    "target_id": "invoice_f7a9..."
  },
  "event_count": 4,
  "integrity": {
    "algorithm": "SHA-256",
    "events_hash": "a3f9e2...",
    "approvals_hash": "b7c241...",
    "pack_hash": "d1e498..."
  },
  "summary": {
    "period": { "from": "2025-12-18", "to": "2025-12-19" },
    "event_types": {
      "finance.invoice.draft_created": 1,
      "finance.approval.requested": 1,
      "finance.approval.approved": 1,
      "finance.invoice.posted": 1
    },
    "actors": [
      { "actor_id": "braid_agent_001", "actor_type": "ai_agent", "event_count": 2 },
      { "actor_id": "user_finance_controller_uuid", "actor_type": "human", "event_count": 2 }
    ],
    "ai_actions": { "total": 2, "blocked": 0, "required_approval": 1 },
    "reversals": { "count": 0, "entries": [] }
  },
  "events": [
    {
      "id": "00000000-0000-4000-8000-aaa000000001",
      "event_type": "finance.invoice.draft_created",
      "aggregate_type": "invoice",
      "aggregate_id": "invoice_f7a9...",
      "actor_id": "braid_agent_001",
      "actor_type": "ai_agent",
      "source": "braid",
      "request_id": "req_1234",
      "braid_trace_id": "trace_braid_001",
      "correlation_id": "req_1234",
      "causation_id": null,
      "model": "gpt-4o",
      "prompt_hash": "sha256:7f3a...",
      "payload": {
        "invoice": { "id": "invoice_f7a9...", "status": "draft", "total_cents": 250000 }
      },
      "policy_decision": {
        "allowed": true,
        "requires_approval": false,
        "risk_level": "low",
        "explanation": "Draft invoice operations are permitted without posting money movement.",
        "model": "gpt-4o",
        "prompt_hash": "sha256:7f3a...",
        "evaluated_at": "2025-12-19T08:00:00Z"
      },
      "created_at": "2025-12-19T08:00:01Z"
    },
    {
      "id": "00000000-0000-4000-8000-aaa000000002",
      "event_type": "finance.approval.requested",
      "aggregate_type": "approval",
      "aggregate_id": "approval_r001",
      "actor_id": "braid_agent_001",
      "actor_type": "ai_agent",
      "source": "braid",
      "request_id": "req_1234",
      "braid_trace_id": "trace_braid_001",
      "correlation_id": "req_1234",
      "causation_id": "00000000-0000-4000-8000-aaa000000001",
      "model": "gpt-4o",
      "prompt_hash": "sha256:7f3a...",
      "payload": {
        "approval": {
          "id": "approval_r001",
          "target_type": "invoice",
          "target_id": "invoice_f7a9...",
          "status": "pending"
        }
      },
      "policy_decision": { "allowed": true, "requires_approval": true, "risk_level": "low" },
      "created_at": "2025-12-19T08:00:02Z"
    },
    {
      "id": "00000000-0000-4000-8000-aaa000000003",
      "event_type": "finance.approval.approved",
      "aggregate_type": "approval",
      "aggregate_id": "approval_r001",
      "actor_id": "user_finance_controller_uuid",
      "actor_type": "human",
      "source": "finance",
      "request_id": "req_9999",
      "braid_trace_id": null,
      "correlation_id": "req_9999",
      "causation_id": "00000000-0000-4000-8000-aaa000000002",
      "model": null,
      "prompt_hash": null,
      "payload": {
        "approval": {
          "id": "approval_r001",
          "target_type": "invoice",
          "target_id": "invoice_f7a9...",
          "status": "approved",
          "approved_by": "user_finance_controller_uuid"
        }
      },
      "policy_decision": { "allowed": true, "requires_approval": false, "risk_level": "low" },
      "created_at": "2025-12-19T09:15:00Z"
    },
    {
      "id": "00000000-0000-4000-8000-aaa000000004",
      "event_type": "finance.invoice.posted",
      "aggregate_type": "invoice",
      "aggregate_id": "invoice_f7a9...",
      "actor_id": "user_finance_controller_uuid",
      "actor_type": "human",
      "source": "finance",
      "request_id": "req_9999",
      "braid_trace_id": null,
      "correlation_id": "req_9999",
      "causation_id": "00000000-0000-4000-8000-aaa000000003",
      "model": null,
      "prompt_hash": null,
      "payload": {
        "invoice": { "id": "invoice_f7a9...", "status": "sent", "total_cents": 250000 }
      },
      "policy_decision": { "allowed": true, "requires_approval": false, "risk_level": "low" },
      "created_at": "2025-12-19T09:15:05Z"
    }
  ],
  "approvals": [
    {
      "id": "approval_r001",
      "tenant_id": "759a83e8-...",
      "target_type": "invoice",
      "target_id": "invoice_f7a9...",
      "status": "approved",
      "requested_by": "braid_agent_001",
      "requested_at": "2025-12-19T08:00:02Z",
      "approved_by": "user_finance_controller_uuid",
      "approved_at": "2025-12-19T09:15:00Z",
      "approval_policy": null,
      "escalation_target": null
    }
  ],
  "state_timeline": [
    {
      "aggregate_type": "invoice",
      "aggregate_id": "invoice_f7a9...",
      "snapshots": [
        {
          "event_id": "00000000-0000-4000-8000-aaa000000001",
          "event_type": "finance.invoice.draft_created",
          "state": { "status": "draft", "total_cents": 250000 }
        },
        {
          "event_id": "00000000-0000-4000-8000-aaa000000004",
          "event_type": "finance.invoice.posted",
          "state": { "status": "sent", "total_cents": 250000 }
        }
      ]
    }
  ],
  "governance_decisions": [
    {
      "event_id": "00000000-0000-4000-8000-aaa000000001",
      "event_type": "finance.invoice.draft_created",
      "decision": { "allowed": true, "risk_level": "low", "model": "gpt-4o" }
    },
    {
      "event_id": "00000000-0000-4000-8000-aaa000000002",
      "event_type": "finance.approval.requested",
      "decision": { "allowed": true, "requires_approval": true }
    }
  ]
}
```

---

## 7. Auditor Console Query Interface

The Auditor Console is a read-only interface. All functions return data from `finance.audit_events` and related tables. No function modifies any record.

### 7.1 `queryAuditTimeline`

Returns all audit events matching the given filters, ordered by `created_at` ascending.

```ts
interface AuditTimelineQuery {
  tenant_id: string; // required
  from?: string; // ISO datetime, inclusive; default: 90 days ago
  to?: string; // ISO datetime, inclusive; default: now()
  actor_id?: string; // filter by actor
  actor_type?: 'human' | 'ai_agent' | 'system';
  event_type?: string; // exact match or prefix match with trailing '*'
  target_id?: string; // filter by aggregate_id
  target_type?: string; // filter by aggregate_type
  correlation_id?: string; // filter by correlation_id
  braid_trace_id?: string; // filter by braid_trace_id
  payload_filter?: Record<string, unknown>; // filter by top-level payload fields (key equality)
  limit?: number; // default: 500; max: 5000
  offset?: number; // default: 0
}

interface AuditTimelineResult {
  events: AuditEvent[];
  total_count: number; // count without limit/offset, for pagination
  query: AuditTimelineQuery; // echo of input
}

async function queryAuditTimeline(query: AuditTimelineQuery): Promise<AuditTimelineResult>;
```

**Implementation notes:**

- `event_type` with a trailing `*` is treated as a prefix match: `'finance.invoice.*'` matches all invoice events. Use `LIKE 'finance.invoice.%'` in SQL.
- `payload_filter` is evaluated as JSONB containment (`@>`). Only top-level keys are supported.
- `from` and `to` filter on `created_at`. Both are inclusive.
- Results are always ordered `created_at ASC`. The caller may re-sort for display; the canonical ordering for evidence hashing is always ascending.

```sql
-- Core query template
select * from finance.audit_events
where tenant_id = $1
  and created_at >= $2
  and created_at <= $3
  and ($4::text is null or actor_id = $4)
  and ($5::text is null or actor_type = $5)
  and ($6::text is null or event_type like $6)
  and ($7::text is null or aggregate_id = $7)
  and ($8::text is null or aggregate_type = $8)
  and ($9::text is null or correlation_id = $9)
  and ($10::text is null or braid_trace_id = $10)
  and ($11::jsonb is null or payload @> $11)
order by created_at asc
limit $12 offset $13;
```

### 7.2 `buildEvidencePack`

Generates a tamper-evident evidence pack (see §6) for a given tenant and time range.

```ts
interface EvidencePackRequest {
  tenant_id: string; // required
  from_date: string; // ISO date, inclusive
  to_date: string; // ISO date, inclusive
  target_type?: string;
  target_id?: string;
  generated_by: {
    // who is requesting the pack (for pack metadata)
    actor_id: string;
    actor_type: 'human' | 'system';
  };
}

interface EvidencePack {
  pack_id: string;
  generated_at: string;
  generated_by: { actor_id: string; actor_type: string };
  tenant_id: string;
  query: EvidencePackRequest;
  event_count: number;
  integrity: {
    algorithm: 'SHA-256';
    events_hash: string;
    approvals_hash: string;
    pack_hash: string;
  };
  summary: EvidencePackSummary;
  events: AuditEvent[];
  approvals: ApprovalRecord[];
  state_timeline: StateTimeline[];
  governance_decisions: GovernanceDecisionEntry[];
}

async function buildEvidencePack(request: EvidencePackRequest): Promise<EvidencePack>;
```

**Implementation notes:**

- When `target_id` is provided, fetch the `correlation_id` of the earliest event for that aggregate, then include all events sharing that `correlation_id` in the pack. This captures the full intent chain.
- State timeline is built by grouping events by `(aggregate_type, aggregate_id)` and collecting `payload` snapshots in chronological order.
- Hashes must be computed after the events array is sorted by `created_at ASC`. The sort must be stable.
- `buildEvidencePack` does not write any record to the database. It is a pure read operation.
- Generating a pack for audit purposes should itself be logged to a separate `audit_pack_requests` table (not `finance.audit_events`) to avoid circular inclusion in future packs.

### 7.3 `getReversalChain`

Returns the complete event chain for a journal entry and all of its reversals.

```ts
interface ReversalChain {
  original_entry_id: string;
  original_events: AuditEvent[];
  reversal_chains: Array<{
    reversal_entry_id: string;
    events: AuditEvent[];
  }>;
}

async function getReversalChain(tenantId: string, journalEntryId: string): Promise<ReversalChain>;
```

**Implementation notes:**

- Reversal events are identified by `payload->>'original_entry_id' = journalEntryId`. This does not require a join to `finance.journal_entries`.
- A reversal entry may itself be reversed (compounding reversal). The function is not recursive by default. To detect compound reversals, caller should call `getReversalChain` again on each `reversal_entry_id`.
- The SQL for identifying reversals requires a JSONB index on `payload` for performance on large tenants: `create index idx_audit_events_payload_original_entry_id on finance.audit_events using gin (payload jsonb_path_ops);`

---

## 8. Retention Policy

### 8.1 Application-Level Rule

Audit events are never deleted by application code. There is no cron job, scheduled task, or background process in AiSHA Finance Ops that removes rows from `finance.audit_events`. The immutability trigger (§2.1) is a technical enforcement of this rule.

### 8.2 Recommended Postgres Strategy for Large Tenants

For tenants with high transaction volume (>100K finance events/month), implement range partitioning by month on `created_at`. This allows:

- Efficient time-range queries (partition pruning)
- Archival of old partitions without touching active data
- Table statistics that remain accurate per-partition

```sql
-- Convert to partitioned table (requires migration; data must be re-inserted)
create table finance.audit_events (
  -- ... same columns as §1.1 ...
  created_at timestamptz not null default now()
) partition by range (created_at);

-- Monthly partitions (create ahead of time or via pg_partman)
create table finance.audit_events_2025_12
  partition of finance.audit_events
  for values from ('2025-12-01') to ('2026-01-01');

create table finance.audit_events_2026_01
  partition of finance.audit_events
  for values from ('2026-01-01') to ('2026-02-01');
```

**pg_partman** (`pgpartman/pg_partman`) can automate partition creation and is available as a Postgres extension on Supabase.

### 8.3 Archival to Cold Storage

For partitions older than the tenant's retention window (recommended minimum: 7 years for financial records), the archival workflow is:

1. **Export**: `COPY finance.audit_events_YYYY_MM TO '/archive/audit_events_YYYY_MM.csv' CSV HEADER;` or stream to S3/R2 via `aws_s3` extension.
2. **Verify**: Recompute the SHA-256 hash of the exported file and store it alongside the archive. This hash serves as the archival integrity check equivalent to the evidence pack hash.
3. **Detach**: `ALTER TABLE finance.audit_events DETACH PARTITION finance.audit_events_YYYY_MM;`
4. **Retain detached table**: Do not drop the detached table until the archive has been independently verified. Keep the detached table in a `finance_archive` schema if needed for reattachment.
5. **Drop**: Only after the archive is verified and the retention window is confirmed exceeded: `DROP TABLE finance_archive.audit_events_YYYY_MM;`

**Cold storage target:** Cloudflare R2 (already in the AiSHA infrastructure stack). Use the `pg_net` extension to push exports directly from Postgres, or use a backend script invoked via the `scripts/` directory.

### 8.4 What Is Never Archived Before Its Time

- Events linked to an open approval record (approval `status != 'approved'` or `'rejected'`) must not be archived.
- Events for journal entries that are `posted` but have a pending reversal must not be archived.
- Evidence packs that have been issued to external auditors and are within their stated coverage window must remain queryable from live data.

A pre-archival check query:

```sql
-- Confirm no open approvals reference events in this partition before archiving
select count(*) from finance.approvals a
join finance.audit_events ae on ae.payload->>'approval'->>'id' = a.id::text
where ae.created_at >= '2025-12-01' and ae.created_at < '2026-01-01'
  and a.status = 'pending';
-- Must return 0 before archiving
```

---

## Appendix: Index Recommendations

In addition to the index on `(tenant_id, created_at desc)` from migration 168:

```sql
-- For correlation_id and causation_id chain traversal
create index idx_finance_audit_events_correlation_id
  on finance.audit_events (tenant_id, correlation_id)
  where correlation_id is not null;

create index idx_finance_audit_events_causation_id
  on finance.audit_events (tenant_id, causation_id)
  where causation_id is not null;

-- For Braid trace queries
create index idx_finance_audit_events_braid_trace_id
  on finance.audit_events (tenant_id, braid_trace_id)
  where braid_trace_id is not null;

-- For aggregate timeline queries
create index idx_finance_audit_events_aggregate
  on finance.audit_events (tenant_id, aggregate_type, aggregate_id, created_at asc);

-- For event type filtering
create index idx_finance_audit_events_event_type
  on finance.audit_events (tenant_id, event_type, created_at asc);

-- For reversal chain queries (payload JSONB)
create index idx_finance_audit_events_payload_gin
  on finance.audit_events using gin (payload jsonb_path_ops);

-- For actor queries
create index idx_finance_audit_events_actor
  on finance.audit_events (tenant_id, actor_id, actor_type)
  where actor_id is not null;

-- For AI lineage queries
create index idx_finance_audit_events_model
  on finance.audit_events (tenant_id, model)
  where model is not null;
```

---

## 9. Phase 2B-11 — Audit / Evidence Builder Runtime (Implemented)

**Status:** Implemented | **Module:** `backend/lib/finance/auditEvidenceBuilder.js`
**Tests:** `backend/__tests__/lib/finance/auditEvidenceBuilder.test.js` (15 tests, `node:test`)

Phase 2B-11 implements the §7 auditor query interface as a **pure, read-only
library module**. It reconstructs evidence packs entirely from the finance event
stream — no DB, no routes, no provider calls, no network I/O, no mutation of any
source record.

### 9.1 Public API

The module is a pure function library, not a worker. All three §7 functions are
`async` and operate over **either** an array of event envelopes **or** a finance
event store (anything exposing `.replay(tenantId)` — the synchronous in-memory
`financeEventStore.js` or the asynchronous Postgres adapter
`financeEventStore.pg.js`; both are awaited). The `events` source is the first
positional argument:

```js
// Build a tamper-evident evidence pack (§6).
buildEvidencePack(events, {
  tenantId,            // required — tenant isolation boundary
  fromDate, toDate,    // inclusive ISO bounds on created_at
  targetType,          // optional aggregate_type filter
  targetId,            // optional aggregate_id; widens to its full correlation_id span
  generatedBy,         // { actor_id, actor_type } — pack metadata
  packId,              // injectable for determinism; default `pack_${randomUUID()}`
  generatedAt,         // injectable ISO timestamp; default new Date().toISOString()
  idFactory, clock,    // optional alternative sources for packId / generatedAt
  includeInfrastructureEvents, // include the reserved event_appended event (default false)
}) -> EvidencePack

// Read-only timeline query (§7.1).
queryAuditTimeline(events, {
  tenant_id,           // required
  from, to,            // inclusive ISO bounds
  actor_id, actor_type,
  event_type,          // exact, or trailing-'*' prefix match
  target_id, target_type,
  correlation_id, causation_id, braid_trace_id,
  payload_filter,      // top-level payload key-equality
  limit, offset,       // default 500 / 0; limit capped at 5000
  includeInfrastructureEvents,
}) -> { events, total_count, query }

// Reconstruct a journal entry's reversal chain (§5.3 / §7.3).
getReversalChain(events, tenantId, journalEntryId)
  -> { original_entry_id, original_events, reversal_chains }

// Helpers.
isCanonicalFinanceEvent(eventType) -> boolean
RESERVED_INFRASTRUCTURE_EVENT  // 'finance.audit.event_appended'
```

`buildEvidencePack` is also the default export.

### 9.2 Determinism

`pack_id` and `generated_at` are inherently volatile, so they are **injectable**.
With `packId` / `generatedAt` (or `idFactory` / `clock`) supplied, two builds
from the same event stream are **byte-identical** — including all three integrity
hashes. `pack_hash` is computed over the assembled pack with
`integrity.pack_hash` excluded; every other field is derived deterministically
from the (sorted, deep-cloned) event set.

### 9.3 Evidence pack shape — as implemented

The pack follows §6.2 with two additive fields that the §6.2 prose described
but the §6.2 code sample did not show as top-level keys:

- `reversals: { count, entries }` — reversal lineage. `entries` is an array of
  `getReversalChain` results. `summary.reversals` keeps the §6.2 short form
  (`{ count, entries: [...originalEntryIds] }`).
- `adapter_jobs: []` — deduplicated adapter-job snapshots (latest per id),
  present whenever `payload.adapter_job` events exist. Empty array when absent.

`state_timeline` snapshots additionally carry `created_at` alongside
`event_id` / `event_type` / `state` so the timeline is self-orderable.

### 9.4 Contract enforcement

- **Tenant isolation.** A mixed-tenant event array yields a pack containing
  **zero** other-tenant data anywhere (events, approvals, hashes, summary).
- **Canonical event names only.** Only `finance.*` event names are consumed. A
  command name (`PostJournalEntryCommand`, `ApproveFinanceActionCommand`) is
  never silently accepted as an `event_type` — it fails the `finance.` prefix
  check and is dropped.
- **Track A vocabulary preserved.** Events use `aggregate_type` / `aggregate_id`;
  approval records use `target_type` / `target_id`. The module never introduces
  `object_type` / `object_id`.
- **Reserved infrastructure event.** `finance.audit.event_appended` (§1.2) is
  excluded from normal business evidence unless `includeInfrastructureEvents` is
  set.
- **Graceful absence.** No approvals → `approvals: []`; no adapter jobs →
  `adapter_jobs: []`; no reversals → `reversals: { count: 0, entries: [] }`. An
  empty event stream produces a valid empty pack — never throws.

### 9.5 Deviations from this spec

- `buildEvidencePack` / `getReversalChain` / `queryAuditTimeline` take the event
  source as their first positional argument (an event array or an event store),
  rather than the request-object signatures sketched in §7. They are **async**
  and `await` the event source, so they work unchanged with both the synchronous
  in-memory `financeEventStore.js` and the asynchronous Postgres adapter
  `financeEventStore.pg.js` — honoring the `async` contract §7 already declares.
- §7.2's note that pack generation "should itself be logged to a separate
  `audit_pack_requests` table" is **not** implemented — this module performs no
  writes of any kind (a hard Phase 2B-11 constraint). Request logging belongs to
  the future route/persistence layer that calls this builder.

---

---

## Architecture Decisions — Resolved

| ID  | Topic                       | Decision                                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | `audit_events` schema shape | **Use migration 168 payload-centered shape.** The scaffold doc described `before_state`/`after_state` columns — these do not exist in migration 168. State is captured inside `payload` as full aggregate snapshots. This is the shape implemented in `financeEventStore.js` and the current domain service. All interface specs in this document follow migration 168. |

---

_This document is part of the Finance Ops architecture suite. Related: Track A (Event Store), Track B (Projection Contracts), Track C (Approval Orchestration), Track E (Adapter Runtime Contract), Track F (Security / RLS / Persistence Hardening)._
