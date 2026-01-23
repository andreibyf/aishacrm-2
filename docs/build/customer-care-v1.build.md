# Customer C.A.R.E. v1 – Copilot Build Brief

## Status
Version: v1.0
Depends on: docs/product/customer-care-v1.md (immutable)
Audience: Copilot, Engineering, AI Agents

This document defines **what must be built next** to implement Customer C.A.R.E. v1.
All work MUST comply with the behavioral contract in `customer-care-v1.md`.

---

## 1. Build Objective

Implement a **Customer-level Cognitive Relationship Management layer** that:
- Operates independently of UI dashboards
- Assumes responsibility for customer momentum
- Enforces Hands-Off Mode by default
- Escalates only when human judgment is required

This is **not** a CRM feature set.
It is a **behavioral execution layer**.

---

## 2. Core System Components (to be built or aligned)

### 2.1 Customer C.A.R.E. State Engine

**Purpose**: Maintain and advance the customer’s behavioral state.

**Requirements**:
- Represent all canonical C.A.R.E. states
- Persist current state per customer
- Record state transition history
- Expose explainable reasons for each transition

**Acceptance Criteria**:
- A customer always has exactly one active C.A.R.E. state
- State transitions are logged with timestamps and causes
- No transition occurs without justification

---

### 2.2 Hands-Off Mode Controller

**Purpose**: Enforce autonomous operation boundaries.

**Requirements**:
- Hands-Off Mode ON by default
- Allow per-customer override (ON/OFF)
- Enforce prohibited actions strictly
- Block any action violating the product contract

**Acceptance Criteria**:
- Autonomous actions occur without human prompts
- Escalation is triggered only under defined conditions
- Violations are prevented, not logged after the fact

---

### 2.3 Escalation Detection Module

**Purpose**: Detect when human involvement is required.

**Escalation Triggers**:
- Explicit objections
- Pricing or contractual questions
- Negative sentiment
- Compliance-sensitive language

**Requirements**:
- Classify inbound messages and signals
- Emit escalation events
- Pause autonomous actions until resolved

**Acceptance Criteria**:
- Escalation always precedes human notification
- No autonomous action continues during escalation

---

### 2.4 Action Executor

**Purpose**: Perform allowed autonomous actions.

**Allowed Actions**:
- Follow-up messages
- Scheduling prompts
- Cadence adjustments
- Channel switching
- Dormant reactivation

**Prohibited Actions**:
- Negotiation
- Pricing changes
- Binding commitments

**Acceptance Criteria**:
- All actions are validated against state + Hands-Off rules
- All actions are auditable and explainable

---

## 3. C.A.R.E. State → Behavior Mapping

Each state must have a defined behavior set.

Example:

STATE: Evaluating
- Monitor silence duration
- Send follow-ups on adaptive cadence
- Detect objections
- Escalate on pricing questions

No state may be passive.

---

## 4. Explainability & Audit Layer

**Requirements**:
- Every autonomous action must be explainable in plain language
- State changes must be human-readable
- Audit trail must be queryable

**Acceptance Criteria**:
- User can answer: “Why did AiSHA do this?”
- No opaque or unexplained behavior exists

---

## 5. Coexistence Rules (Hard Constraints)

The system MUST:
- Read from systems of record
- Never overwrite authoritative data
- Never assume ownership of policies, billing, or contracts

Violations are blocking defects.

---

## 6. Explicit Non-Goals (Out of Scope)

Do NOT build:
- CRM dashboards as the primary interface
- Policy, underwriting, or billing logic
- Free-form AI chat driving actions
- Manual task lists as a fallback mechanism

---

## 7. Build Order (Recommended)

1. Implement C.A.R.E. state engine
2. Implement Hands-Off Mode controller
3. Implement escalation detection
4. Wire action executor
5. Add audit + explainability

UI comes last.

---

## 8. Copilot Instructions (Mandatory)

When using Copilot:

- Reference `docs/product/customer-care-v1.md`
- Reject any implementation that violates the contract
- Prefer enforcement over flexibility
- Default to escalation on uncertainty

---

## End of Build Brief

