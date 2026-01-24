# Customer C.A.R.E. v1 — Safety-Gated PR Plan

Depends on:

* `docs/product/customer-care-v1.md` (behavioral contract — **IMMUTABLE**)
* `docs/build/customer-care-v1.build.md` (Copilot build brief)

Rules:

* No PR may change user-visible behavior unless explicitly allowed by this plan.
* Default posture is **observe-only**.
* Autonomy is opt-in, gated, auditable, and reversible.
* If behavior is uncertain, **escalate, do not act**.

---

## Phase 0 — Hard Safety Rails (MUST BE FIRST)

### PR0 — Global Kill Switch + Shadow Mode

**Customer impact:** NONE

**Purpose:** Guarantee zero risk to existing clients before any logic is wired.

**Tasks**

* Add environment variables:

  * `CARE_AUTONOMY_ENABLED=false`
  * `CARE_SHADOW_MODE=true`
* Add helper:

  * `isCareAutonomyEnabled(ctx)`
* Logic:

  * Returns `true` **only if**:

    * `CARE_AUTONOMY_ENABLED === true`
    * `CARE_SHADOW_MODE === false`
* Enforce rule:

  * If autonomy is disabled:

    * ❌ No outbound messages
    * ❌ No scheduling actions
    * ❌ No workflow execution
    * ✅ State proposals allowed
    * ✅ Audits allowed
    * ✅ Telemetry allowed

**Acceptance**

* Deploying this PR produces **zero runtime behavior change**
* Any future executor must call `isCareAutonomyEnabled`

---

## Phase 1 — Passive Intelligence (Safe to Deploy)

### PR1 — Database: Customer C.A.R.E. State Tables

**Customer impact:** NONE

**Purpose:** Persist relationship state without affecting flows.

**Tasks**

* Add tables:

  * `customer_care_state`
  * `customer_care_state_history`
* Required columns:

  * `tenant_id`
  * `entity_type` (lead | contact | account)
  * `entity_id`
  * `care_state`
  * `hands_off_enabled` (default **false** for existing customers)
  * `escalation_status` (null | open | closed)
  * `last_signal_at`
  * `created_at`
  * `updated_at`
* Add indexes:

  * unique (`tenant_id`, `entity_type`, `entity_id`)
  * (`tenant_id`, `care_state`)

**Acceptance**

* Tables exist and migrate cleanly
* No existing queries or workers break
* No jobs depend on these tables yet

---

### PR2 — C.A.R.E. State Engine (Pure Logic)

**Customer impact:** NONE

**Purpose:** Encode the behavioral state machine without side effects.

**Tasks**

* Create:

  * `backend/lib/care/careStateEngine.ts`
* Implement:

  * `getCurrentState()`
  * `proposeTransition()`
  * `applyTransition()`
* Enforce:

  * Only canonical states allowed
  * Every transition requires a non-empty reason

**Acceptance**

* Engine can propose transitions without persisting
* No hooks, no outbound actions, no UI impact

---

### PR3 — Escalation Detector (Read-Only)

**Customer impact:** NONE

**Purpose:** Detect when humans must intervene.

**Tasks**

* Create:

  * `backend/lib/care/careEscalationDetector.ts`
* Detect:

  * Explicit objections
  * Pricing or contract language
  * Negative sentiment
  * Compliance-sensitive markers
* Output:

  * `{ escalate: boolean, reasons: string[] }`

**Acceptance**

* Detector never executes actions
* Detector output is logged only

---

### PR4 — Audit + Telemetry (Internal Only)

**Customer impact:** NONE

**Purpose:** Make all future decisions explainable.

**Tasks**

* Create:

  * `backend/lib/care/careAuditEmitter.ts`
* Log:

  * `proposed_state_change`
  * `would_escalate`
  * `would_execute_action`
* Emit telemetry events (non-UI, internal only)

**Acceptance**

* Audit logs exist
* No new activities, notifications, or messages appear for users

---

## Phase 2 — Shadow Mode Wiring (Still Safe)

### PR5 — Call Flow Hook (Shadow Mode Only)

**Customer impact:** NONE

**Purpose:** Observe what would happen after calls without acting.

**Tasks**

* In `callFlowHandler`:

  * After transcript + sentiment analysis:

    * Resolve customer entity
    * Propose C.A.R.E. state transition
    * Run escalation detector
    * Write shadow audit entries
    * ❌ Do NOT execute actions

**Acceptance**

* Call behavior is unchanged
* Shadow logs clearly show “what AiSHA would have done”

---

### PR6 — Trigger Worker (Shadow Mode Only)

**Customer impact:** NONE

**Purpose:** Observe decay and stagnation signals safely.

**Tasks**

* In `aiTriggersWorker`:

  * Detect lead stagnation / relationship decay
  * Propose state transitions
  * Write shadow audits
  * ❌ Do NOT execute actions

**Acceptance**

* Existing suggestion behavior remains unchanged
* No outbound messages occur

---

## Phase 3 — Controlled Autonomy (Internal Only)

### PR7 — Action Executor (Triple-Gated)

**Customer impact:** NONE unless explicitly enabled

**Purpose:** Centralize and strictly control autonomous actions.

**Tasks**

* Create:

  * `backend/lib/care/careActionExecutor.ts`
* Executor may run **only if all are true**:

  1. `CARE_AUTONOMY_ENABLED === true`
  2. `CARE_SHADOW_MODE === false`
  3. `hands_off_enabled === true`
* Otherwise:

  * Log and exit immediately

**Acceptance**

* Executor cannot run accidentally
* Kill switch halts all autonomy instantly

---

### PR8 — Enable Autonomy for INTERNAL TENANT ONLY

**Customer impact:** NONE

**Purpose:** Test autonomy safely.

**Tasks**

* Hard allowlist:

  * Only internal tenant ID may execute actions
* Limit:

  * One customer
  * One action type
  * Low frequency

**Acceptance**

* No external tenant is affected
* Actions are observable and auditable

---

## Phase 4 — Client Opt-In Only

### PR9 — Hands-Off Mode Flag (Admin / Config)

**Customer impact:** OPT-IN ONLY

**Purpose:** Allow explicit customer consent.

**Tasks**

* Add admin or config flag:

  * “Enable Hands-Off Mode”
* Defaults:

  * Existing customers → OFF
  * New customers → OFF unless explicitly enabled

**Acceptance**

* No client is opted in automatically
* Opt-in is reversible

---

## Phase 5 — Hardening (Before Broad Use)

### PR10 — Throttles, Backoffs, and Quiet Hours

**Customer impact:** Safety improvement only

**Purpose:** Prevent runaway automation.

**Tasks**

* Max autonomous actions per customer per day
* Minimum interval between outbound actions
* Optional quiet hours
* Document emergency kill switch usage

**Acceptance**

* Runaway loops are impossible
* Operators can halt autonomy instantly

---

## Definition of Done (Customer C.A.R.E. v1)

* Customer C.A.R.E. state is persisted with history
* Hands-Off Mode exists and is **enforced**, not advisory
* Escalation halts autonomy immediately
* Shadow mode validates behavior before execution
* Existing client experiences **zero surprise behavior**

---

End of Document
