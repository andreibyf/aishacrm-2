# Finance Ops — Approval Orchestration Specification

**Track C · feat/finance-ops-runtime**  
**Status:** Design specification — not yet implemented  
**Covers:** `backend/lib/finance/` · `backend/routes/finance.v2.js` · `finance.approvals` table

---

## 1. Approval State Machine

### 1.1 Valid States

| State | Meaning |
|---|---|
| `pending` | Approval request has been created; awaiting human action |
| `approved` | A qualified human approver has accepted the request |
| `rejected` | A qualified human approver has declined the request |
| `cancelled` | The requesting operation was withdrawn before approval was acted on |
| `executed` | The approved action has been committed to the ledger (post-approval state) |

> Note: `executed` is a **target-aggregate** state (e.g., `journal_entry.status = 'posted'`), not a column value in `finance.approvals`. The approvals table only carries `pending | approved | rejected | cancelled`. The orchestrator is responsible for driving the target aggregate to `executed` after recording `approved`.

### 1.2 State Diagram

```
                     ┌─────────────┐
  (approval          │             │
   requested)        │   pending   │◄──────────────┐
                     │             │               │
                     └──────┬──────┘               │
                            │                      │
              ┌─────────────┼──────────────┐       │
              │             │              │       │
              ▼             ▼              ▼       │
         ┌─────────┐  ┌──────────┐  ┌───────────┐ │
         │approved │  │ rejected │  │ cancelled │ │
         └────┬────┘  └──────────┘  └───────────┘ │
              │                                    │
              ▼                                    │
         ┌──────────┐                              │
         │ executed │  (target aggregate only)     │
         └──────────┘                              │
```

### 1.3 Invalid Transitions

| From | To | Verdict | Enforcement Layer |
|---|---|---|---|
| `approved` | `pending` | INVALID — approved items are append-only | Service layer (hard reject) |
| `approved` | `approved` | INVALID — double-approval | Service layer (idempotency check) |
| `rejected` | `approved` | INVALID — re-opening a rejected action requires a new approval request | Service layer (hard reject) |
| `rejected` | `pending` | INVALID — same as above | Service layer (hard reject) |
| `cancelled` | any | INVALID — terminal state | Service layer (hard reject) |
| `pending` | `executed` | INVALID — must pass through `approved` first | Service layer (hard reject) |
| any | `executed` (in approvals table) | INVALID — `executed` lives only on the target aggregate | DB constraint (column not present in approvals table) |

### 1.4 Append-Only Rule

Once an approval record reaches `approved`, `rejected`, or `cancelled`, no field on that record may be mutated except `updated_at`. Any amendment to the underlying target document requires creating a **new** approval request. The orchestrator must enforce this in the service layer before the DB write.

---

## 2. Risk Level Classification

### 2.1 Classification Table

| Risk Level | Triggers | Examples |
|---|---|---|
| `low` | Draft-only operations, no money movement | Create/update draft invoice, create journal draft (< $1,000) |
| `medium` | Draft operations above low threshold, adapter sync, non-financial config | Journal draft ≥ $1,000 and < $10,000; adapter sync queue |
| `high` | Real money movement, reversals, large amounts | Reversal of any posted entry; amount ≥ $10,000 and < $5,000; deal-won journals < $5,000 |
| `critical` | AI-actor attempting a blocked command; amount ≥ $5,000 (deal-won path); any operation flagged by `finance.ai.no_money_movement` policy | AI posting/approving; deal-won journals ≥ $5,000 |

### 2.2 Concrete Amount Thresholds

These are the canonical thresholds derived from the current `evaluateFinanceGovernance` implementation and extended for the full risk matrix:

```
amount_cents < 100_000  ($0 – $999.99)    → low      (journal drafts only)
amount_cents < 1_000_000 ($1,000 – $9,999.99) → medium   (journal drafts only)
amount_cents >= 1_000_000 ($10,000+)       → high     (journal drafts / deal-won < $5,000)
amount_cents >= 500_000  ($5,000+)         → critical (deal-won simulation path)
```

> **Implementation note:** The current code uses `500_000` cents ($5,000) as the `high → critical` boundary on the deal-won path. For the general journal-draft path the boundary is `100_000` cents ($1,000) for `low → medium`. The orchestrator should consolidate these into a single threshold registry rather than inline conditionals.

### 2.3 Non-Amount Risk Escalators

Any single matching escalator overrides the amount-derived level upward (never downward):

| Escalator | Resulting Risk Level |
|---|---|
| `actor_type === 'ai_agent'` attempting a blocked command | `critical` |
| `commandType === 'RequestJournalReversalCommand'` (any amount) | `high` (minimum) |
| `commandType === 'PostJournalEntryCommand'` | `high` (minimum) |
| `target_type === 'reversal'` | `high` (minimum) |
| Cross-tenant write attempt | `critical` + immediate block |

---

## 3. Segregation of Duties

### 3.1 When Segregation Applies

Requester-cannot-approve-own-action (`requested_by !== approved_by`) is **mandatory** when:

- `risk_level` is `high` or `critical`
- The `approval_policy` is any of:
  - `finance.high_value.approval_required`
  - `finance.reversal.approval_required`
  - `finance.ai.no_money_movement` (AI-requested items can never be self-approved by any AI)

Segregation is **waived** (same actor may approve) only when `risk_level` is `low` or `medium` and no escalator applies — this supports lightweight internal workflows without forcing a second login for routine operations.

### 3.2 Role Permission Matrix

| Role | Can Request | Can Approve `low` | Can Approve `medium` | Can Approve `high` | Can Approve `critical` |
|---|---|---|---|---|---|
| `ai_agent` | Draft/read ops only | No | No | No | No |
| `finance_staff` | All requestable ops | Yes | Yes | No | No |
| `finance_manager` | All requestable ops | Yes | Yes | Yes | No |
| `finance_controller` | All requestable ops | Yes | Yes | Yes | Yes |
| `owner` / `admin` | All requestable ops | Yes | Yes | Yes | Yes |

> **Escalation target** `finance_controller` (carried in `decision.escalation_target`) is the minimum role required to approve `critical`-level requests.

---

## 4. AI Actor Restrictions

### 4.1 Permanently Blocked Operations (AI actors)

AI actors (`actor_type === 'ai_agent'`) are **unconditionally blocked** from the following commands regardless of amount, tenant configuration, or any runtime flag:

| Command | Policy | Reason |
|---|---|---|
| `ApproveFinanceActionCommand` | `finance.ai.no_money_movement` | AI cannot be an approver — human-in-the-loop is non-negotiable |
| `RejectFinanceActionCommand` | `finance.ai.no_money_movement` | Same — rejection is a governance decision |
| `PostJournalEntryCommand` | `finance.ai.no_money_movement` | Ledger truth cannot be written by an AI actor |
| `IssueRefundCommand` (future) | `finance.ai.no_money_movement` | Money movement out of the business |
| `ExecutePaymentCommand` (future) | `finance.ai.no_money_movement` | Money movement out of the business |
| `CancelApprovalCommand` | `finance.ai.no_money_movement` | Withdrawal of an approval request alters the audit trail |

These blocks are enforced at the **service layer** via the `AI_BLOCKED_COMMANDS` set in `financeGovernanceDecision.js`. The route layer does not re-check — the service is the authoritative gate. Adding a new blocked command requires updating that set plus this document.

### 4.2 Operations AI Actors Can Request (With Approval)

| Operation | Risk Level Assigned | Notes |
|---|---|---|
| `CreateJournalDraftCommand` | `low` / `medium` (by amount) | Draft only; posting is blocked |
| `CreateDraftInvoiceCommand` | `low` | No money movement |
| `UpdateDraftInvoiceCommand` | `low` | No money movement |
| `RequestJournalReversalCommand` | `high` | Creates reversal draft + approval record; posting blocked |
| `SimulateDealWonCommand` | `high` / `critical` (by amount) | Simulation only; execution requires human approval |
| `QueueAccountingAdapterSyncCommand` | `medium` | Queues an adapter job; does not execute |

### 4.3 Actor Type Derivation Rule

Actor type is derived **exclusively from the authenticated session** (`req.user.is_ai_agent` or `req.user.role === 'ai_agent'`). Body-supplied `actor_type` is never trusted. This prevents an API caller from self-declaring as human to bypass AI governance checks.

---

## 5. Approval Request Contract

### 5.1 Input Payload (what the orchestrator accepts)

```js
{
  // Required
  tenant_id: string,           // UUID — must match req.tenant.id
  target_type: string,         // 'journal_entry' | 'invoice' | 'payment' | 'reversal'
  target_id: string,           // UUID of the aggregate being approved
  risk_level: string,          // 'low' | 'medium' | 'high' | 'critical'
  requested_by: string | null, // UUID of the requesting user (null for system-initiated)
  actor_type: string,          // 'human' | 'ai_agent' | 'system'

  // Policy decision (required — snapshot at request time)
  policy_decision: {
    allowed: boolean,
    requires_approval: boolean,
    risk_level: string,
    blocked_actions: string[],
    approval_policy: string | null,
    escalation_target: string | null,
    explanation: string,
    policy_trace: Array<{ policy: string, result: string, reason: string }>,
    braid_trace_id: string | null,
    model: string | null,
    prompt_hash: string | null,
    evaluated_at: string,       // ISO 8601
  },

  // Optional context
  request_id: string | null,   // x-request-id from HTTP layer
  braid_trace_id: string | null,
  memo: string | null,         // human-readable description of what is being approved
}
```

### 5.2 Approval Record Written to `finance.approvals`

```js
{
  id: string,                  // gen_random_uuid()
  tenant_id: string,           // UUID
  target_type: string,         // 'journal_entry' | 'invoice' | 'payment' | 'reversal'
  target_id: string,           // UUID of the target aggregate
  status: 'pending',           // always 'pending' at creation
  risk_level: string,          // from policy_decision.risk_level
  requested_by: string | null, // actor UUID
  approved_by: null,           // set on approval
  approved_at: null,           // set on approval
  rejected_by: null,           // set on rejection
  rejected_at: null,           // set on rejection
  rejection_reason: null,      // set on rejection
  policy_snapshot: {           // full policy_decision object — immutable after write
    ...policy_decision,        // all fields from §5.1 policy_decision
    request_id: string | null, // HTTP request ID
    braid_trace_id: string | null,
    actor_type: string,
    memo: string | null,
    snapshot_version: 1,       // schema version for future migrations
  },
  created_at: string,          // now()
  updated_at: string,          // now()
}
```

---

## 6. Approval Orchestrator Interface

The orchestrator is a service-layer module (`backend/lib/finance/approvalOrchestrator.js`) that wraps the `finance.approvals` table. It does not contain business rules — those live in `financeGovernanceDecision.js`. It owns: persistence, event emission, state transition enforcement, and escalation scheduling.

### 6.1 `requestApproval(params)`

```js
/**
 * Creates a pending approval record and emits finance.approval.requested.
 *
 * @param {object} params
 * @param {string}      params.tenant_id
 * @param {string}      params.target_type   - 'journal_entry' | 'invoice' | 'payment' | 'reversal'
 * @param {string}      params.target_id     - UUID of the target aggregate
 * @param {string}      params.risk_level    - 'low' | 'medium' | 'high' | 'critical'
 * @param {string|null} params.requested_by  - UUID of requesting actor (null = system)
 * @param {string}      params.actor_type    - 'human' | 'ai_agent' | 'system'
 * @param {object}      params.policy_decision - full governance decision object
 * @param {string|null} params.request_id
 * @param {string|null} params.braid_trace_id
 * @param {string|null} params.memo
 *
 * @returns {Promise<{
 *   approval: ApprovalRecord,
 *   event: FinanceEventEnvelope,
 * }>}
 *
 * @emits finance.approval.requested
 * @throws 400 if required fields are missing
 * @throws 409 if a non-terminal approval already exists for this target_id
 */
async function requestApproval(params) {}
```

**Events emitted:**

```js
{
  event_type: 'finance.approval.requested',
  aggregate_type: 'approval',
  aggregate_id: approval.id,
  payload: {
    approval_id: approval.id,
    target_type: approval.target_type,
    target_id: approval.target_id,
    risk_level: approval.risk_level,
    requested_by: approval.requested_by,
    actor_type: params.actor_type,
    escalation_target: policy_decision.escalation_target,
    escalation_deadline_at: <now + escalation_window>,   // see §7
  }
}
```

### 6.2 `approveAction(params)`

```js
/**
 * Transitions a pending approval to approved and emits finance.approval.approved.
 * Does NOT post the target aggregate — that is the caller's responsibility.
 *
 * @param {object} params
 * @param {string} params.tenant_id
 * @param {string} params.approval_id
 * @param {string} params.approved_by   - UUID of the approving user (must be human)
 * @param {string} params.actor_type    - must be 'human'; 'ai_agent' throws 403
 *
 * @returns {Promise<{
 *   approval: ApprovalRecord,
 *   event: FinanceEventEnvelope,
 * }>}
 *
 * @emits finance.approval.approved
 * @throws 403 if actor_type is 'ai_agent' or 'system'
 * @throws 403 if approved_by === approval.requested_by AND risk_level is 'high' or 'critical'
 * @throws 403 if approved_by does not hold a role permitted for this risk_level (see §3.2)
 * @throws 404 if approval not found for tenant
 * @throws 409 if approval.status !== 'pending'
 */
async function approveAction(params) {}
```

**Events emitted:**

```js
{
  event_type: 'finance.approval.approved',
  aggregate_type: 'approval',
  aggregate_id: approval.id,
  payload: {
    approval_id: approval.id,
    target_type: approval.target_type,
    target_id: approval.target_id,
    risk_level: approval.risk_level,
    approved_by: approval.approved_by,
    approved_at: approval.approved_at,
  }
}
```

### 6.3 `rejectAction(params)`

```js
/**
 * Transitions a pending approval to rejected and emits finance.approval.rejected.
 *
 * @param {object} params
 * @param {string}      params.tenant_id
 * @param {string}      params.approval_id
 * @param {string}      params.rejected_by   - UUID of the rejecting user (must be human)
 * @param {string}      params.actor_type    - must be 'human'; 'ai_agent' throws 403
 * @param {string}      params.reason        - required; stored in rejection_reason
 *
 * @returns {Promise<{
 *   approval: ApprovalRecord,
 *   event: FinanceEventEnvelope,
 * }>}
 *
 * @emits finance.approval.rejected
 * @throws 400 if reason is missing or empty
 * @throws 403 if actor_type is 'ai_agent' or 'system'
 * @throws 404 if approval not found for tenant
 * @throws 409 if approval.status !== 'pending'
 */
async function rejectAction(params) {}
```

**Events emitted:**

```js
{
  event_type: 'finance.approval.rejected',
  aggregate_type: 'approval',
  aggregate_id: approval.id,
  payload: {
    approval_id: approval.id,
    target_type: approval.target_type,
    target_id: approval.target_id,
    risk_level: approval.risk_level,
    rejected_by: approval.rejected_by,
    rejected_at: approval.rejected_at,
    rejection_reason: approval.rejection_reason,
  }
}
```

### 6.4 `cancelApproval(params)`

```js
/**
 * Transitions a pending approval to cancelled.
 * Only the original requester or a finance_controller may cancel.
 * AI actors cannot cancel (see §4.1).
 *
 * @param {object} params
 * @param {string} params.tenant_id
 * @param {string} params.approval_id
 * @param {string} params.cancelled_by
 * @param {string} params.actor_type    - must be 'human'
 * @param {string} params.reason
 *
 * @emits finance.approval.cancelled
 * @throws 403 if actor_type === 'ai_agent'
 * @throws 409 if approval.status !== 'pending'
 */
async function cancelApproval(params) {}
```

---

## 7. Escalation Paths

### 7.1 Escalation Windows

When an approval is created, the orchestrator schedules an escalation deadline:

| Risk Level | Escalation Window | Escalation Action |
|---|---|---|
| `low` | 72 hours | Reminder notification to `escalation_target` role |
| `medium` | 48 hours | Reminder notification + flag in finance dashboard |
| `high` | 24 hours | Urgent notification to `finance_controller` + flag |
| `critical` | 4 hours | Urgent notification to `finance_controller` + `owner`; auto-log to audit trail |

After the escalation window expires without action, the orchestrator does **not** auto-approve or auto-reject. It only escalates the notification chain. Human action is always required.

### 7.2 Escalation Target Structure

The `escalation_target` string in the governance decision maps to a notification target:

```js
// escalation_target registry (future: move to tenant config)
const ESCALATION_TARGETS = {
  finance_controller: {
    role: 'finance_controller',
    fallback_role: 'owner',
    notification_channels: ['in_app', 'email'],
  },
  finance_manager: {
    role: 'finance_manager',
    fallback_role: 'finance_controller',
    notification_channels: ['in_app'],
  },
};
```

If no user in the tenant holds the `escalation_target` role, the fallback role is used. If neither role exists, the escalation is sent to all users holding `owner`.

### 7.3 Escalation Event

```js
{
  event_type: 'finance.approval.escalated',
  aggregate_type: 'approval',
  aggregate_id: approval.id,
  payload: {
    approval_id: approval.id,
    risk_level: approval.risk_level,
    escalation_target: approval.policy_snapshot.escalation_target,
    pending_since: approval.created_at,
    deadline_at: <scheduled deadline>,
    notified_users: string[],   // UUIDs of users notified
  }
}
```

---

## 8. Policy Snapshot

The `policy_snapshot` column in `finance.approvals` captures the complete governance context at the moment the approval request was created. It is immutable after write — never updated during the approval lifecycle.

### 8.1 Required Fields in `policy_snapshot`

```js
{
  // From governance decision
  allowed: boolean,
  requires_approval: boolean,
  risk_level: string,
  blocked_actions: string[],
  approval_policy: string | null,
  escalation_target: string | null,
  explanation: string,
  policy_trace: Array<{
    policy: string,
    result: 'pass' | 'block' | 'approval_required',
    reason: string,
  }>,
  braid_trace_id: string | null,
  model: string | null,           // LLM model that initiated the action (if AI-originated)
  prompt_hash: string | null,     // hash of the prompt that triggered the action
  evaluated_at: string,           // ISO 8601 — when governance was evaluated

  // From request context
  actor_type: string,             // 'human' | 'ai_agent' | 'system'
  request_id: string | null,      // HTTP x-request-id
  memo: string | null,            // human-readable description

  // Schema versioning
  snapshot_version: 1,            // increment when the snapshot shape changes

  // Audit chain
  command_type: string,           // e.g. 'RequestJournalReversalCommand'
  target_amount_cents: number | null,  // amount at evaluation time (for amount-based escalators)
}
```

### 8.2 Why the Snapshot Is Mandatory

Governance policies change over time. The snapshot ensures that every approval can be audited against the policy that was in effect when the request was made, not the policy that exists when a regulator inspects the record two years later.

---

## 9. Invalid Transition Enforcement — Layer Assignment

This section defines precisely where each guard lives so implementors know where to add checks and where not to duplicate them.

| Transition / Guard | Route Layer | Service Layer | DB Constraint |
|---|---|---|---|
| AI actor attempting blocked command | No (route passes through) | **Yes** — `AI_BLOCKED_COMMANDS` check in `evaluateFinanceGovernance` | No |
| Actor type derived from session (not body) | **Yes** — `buildActor(req)` in `finance.v2.js` | No | No |
| `approved → *` re-open attempt | No | **Yes** — status check before mutation | No (approvals table has no forward constraint) |
| `rejected → *` re-open attempt | No | **Yes** — status check before mutation | No |
| `cancelled → *` forward attempt | No | **Yes** — status check before mutation | No |
| `pending → executed` skip (in approvals table) | No | **Yes** — `executed` is not a valid approvals status | **Yes** — `CHECK (status IN ('pending','approved','rejected','cancelled'))` |
| Requester self-approving `high`/`critical` | No | **Yes** — `requested_by !== approved_by` check | No |
| Role insufficient for risk level | No | **Yes** — role-permission matrix check | No |
| AI actor approving / rejecting | No | **Yes** — actor_type check at entry of `approveAction` / `rejectAction` | No |
| Tenant isolation (approval belongs to tenant) | Partial (`validateTenantAccess`) | **Yes** — `ensureTenantMatch` | **Yes** — RLS policy on `finance.approvals` |
| Duplicate approval for same target (non-terminal) | No | **Yes** — check for existing `pending` approval | No |
| `policy_snapshot` mutation after write | No | **Yes** — orchestrator never updates this column | **Yes** — consider column-level trigger (future) |

### 9.1 Rationale for Layer Assignment

- **Route layer** owns HTTP concerns: authentication context extraction, tenant header validation, request ID threading. It does not own business rules.
- **Service layer** owns all business rules. This is the single authoritative enforcement boundary — it is the layer that unit tests target.
- **DB constraints** are the last line of defense: they catch bugs that slip past the service layer, especially in direct-SQL migrations or future parallel service deployments. They do not replace service-layer checks.

---

## 10. Canonical Event Types Reference

| Event Type | Emitted By | Payload Summary |
|---|---|---|
| `finance.approval.requested` | `requestApproval()` | approval record, escalation deadline |
| `finance.approval.approved` | `approveAction()` | approval record with approved_by / approved_at |
| `finance.approval.rejected` | `rejectAction()` | approval record with rejected_by / rejection_reason |
| `finance.approval.cancelled` | `cancelApproval()` | approval record with cancellation reason |
| `finance.approval.escalated` | Escalation scheduler | approval id, pending duration, notified users |

All events are emitted as `FinanceEventEnvelope` objects (see `backend/lib/finance/financeEventEnvelope.js`) and appended to the tenant's `auditEvents` bucket. In the Supabase-backed implementation, they will be written to a `finance.audit_events` table with the same envelope shape.

---

## 11. Open Decisions Resolved for This Spec

The following ambiguities arose during drafting and were resolved with a documented decision:

**A. `executed` as an approvals-table status vs. aggregate state.**  
The DB schema includes neither `executed` nor any forward states beyond `cancelled` in the `status` CHECK constraint. Decision: `executed` is the target aggregate's concern (e.g., `journal_entry.status = 'posted'`). The approvals table closes at `approved`. This matches the current schema and keeps the approval record as a pure governance artifact.

**B. Amount thresholds for `medium` vs. `high`.**  
The current code uses `100_000` cents as the only threshold (for journal drafts). The governance function's fallback path uses `500_000` as `high → critical`. These two scales are inconsistent. Decision: this spec normalizes to a four-band scale (`< $1k low`, `$1k–$9,999 medium`, `$10k–$49,999 high`, `≥ $5k on deal-won path critical`). The implementation should consolidate into a `THRESHOLD_REGISTRY` constant rather than inline numbers.

**C. Self-approval for `low`/`medium` risk.**  
The governance spec requires segregation only for `high`/`critical`. Decision: for `low` and `medium`, the same actor may both request and approve. This supports small-team tenants without forcing a second-approver workflow for routine low-risk operations. This behavior must be explicitly documented in tenant onboarding.

**D. Rejection requires a reason string.**  
The `rejection_reason` column is nullable in the DB schema. Decision: the orchestrator enforces non-null at the service layer for `rejectAction` even though the DB permits null. The audit trail is unusable without a stated reason.

**E. AI actor cancellation.**  
The schema does not explicitly restrict `cancelled` to human actors. Decision: cancellation is treated as equivalent to rejection for governance purposes — it alters the audit trail and is therefore in the `AI_BLOCKED_COMMANDS` set.
