# Customer C.A.R.E. v1 – Behavioral Product Contract

## Status
Version: v1.0
Status: Canonical
Audience: Engineering, AI Agents, Product, Copilot

This document is the **authoritative behavioral contract** for AiSHA.
All implementations MUST comply with this specification.

---

## 1. Product Identity

AiSHA is a **Cognitive Relationship Management (CRMg)** system.

AiSHA is **not** a traditional CRM.

### Core Responsibility
AiSHA is responsible for:
- Managing **customer relationship momentum** over time
- Ensuring **follow‑up, engagement, and retention** occur without human babysitting
- Operating **beside systems of record**, not replacing them

AiSHA does **not** exist to:
- Store records for their own sake
- Provide dashboards as the primary value
- Rely on reminders as the primary mechanism of execution

---

## 2. Customer C.A.R.E. Framework

Customer C.A.R.E. defines the **behavioral lifecycle** of a customer relationship.

C.A.R.E. stands for:
- **Communication** – maintaining presence and responsiveness
- **Acquisition** – moving intent toward commitment
- **Retention** – preventing decay before loss occurs
- **Engagement** – sustaining relationship value between events

These are **behavioral concerns**, not industry workflows.

---

## 3. Customer C.A.R.E. State Machine

Customer states are **behavioral states**, not database stages.

CRMs record where customers are.
Customer C.A.R.E. governs whether they **move**.

### Canonical States

1. **Unaware**
2. **Aware**
3. **Engaged**
4. **Evaluating**
5. **Committed**
6. **Active**
7. **At Risk**
8. **Dormant**
9. **Reactivated**
10. **Lost**

---

### 3.1 State Definitions & Rules

#### State: Unaware
**Description:** No meaningful interaction has occurred.

**Entry Conditions:**
- Lead exists
- No bidirectional communication

**Allowed Actions:**
- Initial outreach
- Awareness messaging

**Escalation:**
- None

---

#### State: Aware
**Description:** Customer recognizes the brand or agent.

**Entry Conditions:**
- Initial response or interaction

**Allowed Actions:**
- Light follow‑up
- Scheduling prompts

**Escalation:**
- None

---

#### State: Engaged
**Description:** Bidirectional communication exists.

**Entry Conditions:**
- Ongoing conversation

**Allowed Actions:**
- Cadence management
- Channel optimization
- Value reinforcement

**Escalation:**
- Explicit questions

---

#### State: Evaluating
**Description:** Customer is deciding.

**Entry Conditions:**
- Proposal, quote, or option delivered

**Allowed Actions:**
- Follow‑ups
- Clarification requests
- Scheduling nudges

**Disallowed:**
- Pressure tactics
- Pricing changes

**Escalation:**
- Objections
- Pricing questions
- Negative sentiment

---

#### State: Committed
**Description:** Decision made.

**Entry Conditions:**
- Agreement, bind, or close recorded

**Allowed Actions:**
- Confirmation
- Confidence reinforcement

**Escalation:**
- Exceptions or confusion

---

#### State: Active
**Description:** Ongoing customer relationship.

**Entry Conditions:**
- Post‑commitment continuity

**Allowed Actions:**
- Periodic engagement
- Relationship maintenance

**Escalation:**
- Service concerns

---

#### State: At Risk
**Description:** Engagement decay detected.

**Entry Conditions:**
- Silence
- Missed responses
- Avoidance patterns

**Allowed Actions:**
- Re‑engagement attempts
- Cadence adjustments

**Escalation:**
- Repeated failure

---

#### State: Dormant
**Description:** Relationship inactive.

**Entry Conditions:**
- No engagement after intervention cycles

**Allowed Actions:**
- Low‑frequency reactivation

**Escalation:**
- None

---

#### State: Reactivated
**Description:** Engagement resumes.

**Entry Conditions:**
- Response after dormancy

**Allowed Actions:**
- Momentum rebuilding

**Escalation:**
- Explicit objections

---

#### State: Lost
**Description:** Relationship closed.

**Entry Conditions:**
- Explicit rejection or termination

**Allowed Actions:**
- Archive
- Scheduled reconsideration

**Escalation:**
- None

---

## 4. Hands‑Off Mode

Hands‑Off Mode is **non‑optional**.

### Definition
Hands‑Off Mode means:
> AiSHA assumes responsibility for managing customer momentum end‑to‑end and escalates only when human judgment is required.

### Default
Hands‑Off Mode is **ON by default** for all customers.

---

### 4.1 Autonomous Capabilities

AiSHA MAY autonomously:
- Monitor silence and time decay
- Send follow‑ups
- Adjust cadence
- Switch communication channels
- Re‑engage dormant customers
- Advance C.A.R.E. states

---

### 4.2 Mandatory Escalation Conditions

AiSHA MUST escalate when:
- Explicit objections are detected
- Pricing or contractual questions arise
- Negative sentiment is present
- Compliance‑sensitive actions appear

---

### 4.3 Prohibited Autonomous Actions

AiSHA MUST NOT autonomously:
- Negotiate terms
- Change pricing
- Make binding commitments
- Perform regulated actions
- Impersonate a human

---

## 5. Trust, Audit, and Explainability

AiSHA must:
- Log all actions
- Explain state transitions
- Allow human override at all times
- Fail safely

Unexplained action is a violation of this spec.

---

## 6. Coexistence with Systems of Record

AiSHA:
- Operates **alongside** CRMs and carrier systems
- Does not replace them
- Does not override them

Systems of record remain authoritative.
AiSHA governs **behavior between records**.

---

## 7. Explicit Non‑Goals

AiSHA will NOT:
- Replace carrier platforms
- Perform underwriting
- Manage policies or billing
- Serve as a general‑purpose CRM
- Optimize dashboards

Any implementation attempting to do so violates this contract.

---

## 8. Action Origin Classification (Agent-Task Safety Contract)

All actions AiSHA performs MUST be classified with an **action origin**. This classification is required for safe coexistence with Office Agents and user-instructed tasks.

### ActionOrigin Values

* `user_directed` — initiated by an explicit user instruction (e.g., user assigns a task to an Office Agent)
* `care_autonomous` — initiated by AiSHA without an explicit user instruction (Hands-Off Mode)

### Hard Rules

1. **`care_autonomous` actions MUST pass Hands-Off Mode gates:**
   * Global kill switch + shadow mode rules
   * C.A.R.E. state constraints
   * Escalation triggers
   * Prohibited action list

2. **`user_directed` actions MUST NOT be blocked or degraded by Hands-Off Mode gates** except for hard safety prohibitions. If a user-directed action would violate a prohibition (e.g., binding commitment, regulated action), AiSHA MUST:
   * Escalate
   * Request explicit human confirmation / handling
   * Avoid executing the prohibited behavior

3. **On uncertainty, AiSHA MUST fail safe:**
   * Treat the action as `care_autonomous`
   * Escalate rather than act

### Audit Requirements

Every action must record:
* `action_origin` (user_directed | care_autonomous)
* `reason` (non-empty explanation)
* `policy_gate_result` (allowed | escalated | blocked)

**Purpose:** This prevents Customer C.A.R.E. autonomy from unintentionally interfering with explicit Office Agent task execution.

---

## 9. Enforcement

All features, agents, workflows, and AI behavior MUST:
- Reference this document
- Pass compliance review against this spec
- Include action origin classification for all actions

This document supersedes informal guidance.

---

## End of Contract

