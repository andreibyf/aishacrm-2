# Customer C.A.R.E. – Action Origin Classification

**Version:** 1.0  
**Status:** Canonical  
**Part of:** Customer C.A.R.E. v1 Behavioral Contract  
**Updated:** January 23, 2026

---

## Overview

**Action Origin Classification** is the safety contract that ensures C.A.R.E. autonomous actions coexist safely with:
- Explicit user instructions
- Office Agent tasks
- Manual user actions

Every action AiSHA performs **MUST** be classified to prevent autonomous behavior from interfering with user intent.

---

## ActionOrigin Values

### `user_directed`
**Definition:** Action initiated by an explicit user instruction

**Examples:**
- User assigns task to Office Agent: "Draft follow-up email for John Doe"
- User manually triggers workflow: "Send proposal to Acme Corp"
- User executes action via UI: "Schedule meeting with prospect"

**Gate Behavior:**
- ✅ MUST NOT be blocked by Hands-Off Mode gates
- ✅ MUST NOT be degraded by C.A.R.E. state constraints
- ⚠️ MAY be escalated for hard safety prohibitions (binding commitments, regulated actions)

---

### `care_autonomous`
**Definition:** Action initiated by AiSHA without explicit user instruction (Hands-Off Mode)

**Examples:**
- Automatic follow-up after 14 days of silence
- Proactive outreach based on state transition
- Scheduled relationship maintenance action

**Gate Behavior:**
- ✅ MUST pass global kill switch check
- ✅ MUST pass shadow mode check
- ✅ MUST pass C.A.R.E. state constraints
- ✅ MUST pass escalation triggers
- ✅ MUST pass prohibited action list
- ⚠️ If ANY gate fails: escalate or block (never execute)

---

## Hard Rules

### Rule 1: Autonomous Action Gating
`care_autonomous` actions MUST pass **ALL** Hands-Off Mode gates:

1. **Global Kill Switch** (`CARE_AUTONOMY_ENABLED === true`)
2. **Shadow Mode** (`CARE_SHADOW_MODE === false`)
3. **Entity-Level Hands-Off Flag** (`hands_off_enabled === true`)
4. **C.A.R.E. State Constraints** (e.g., not in `lost` or `escalated` state)
5. **Escalation Status** (`escalation_status !== 'open'`)
6. **Prohibited Actions** (per action type, tenant config)

**If any gate fails:** Action MUST be blocked or escalated. Never execute.

---

### Rule 2: User-Directed Action Priority
`user_directed` actions MUST NOT be blocked by Hands-Off Mode gates **except** for hard safety prohibitions.

**Hard Safety Prohibitions:**
- Binding commitments without explicit approval
- Regulated actions (insurance underwriting, legal advice)
- Financial transactions beyond authorized limits
- Actions that violate tenant-specific policies

**If prohibition detected:**
1. Escalate to human
2. Request explicit confirmation / handling
3. Do NOT execute the prohibited behavior
4. Record escalation with clear reason

---

### Rule 3: Fail-Safe on Uncertainty
When action origin is **unclear or ambiguous**:

1. **Default to `care_autonomous`** (more restrictive)
2. **Escalate rather than act**
3. **Record uncertainty in audit trail**

**Examples of uncertainty:**
- Implicit instruction: "We should probably follow up with them"
- Context-dependent action: Email reply triggered by detection logic
- Scheduled action from previous user instruction (now stale)

**Resolution:** When in doubt, treat as autonomous and apply full gating.

---

## Audit Requirements

Every action MUST record:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action_origin` | `user_directed` \| `care_autonomous` | ✅ Yes | How action was initiated |
| `reason` | TEXT | ✅ Yes | Non-empty explanation |
| `policy_gate_result` | `allowed` \| `escalated` \| `blocked` | ✅ Yes | Gate decision outcome |
| `user_instruction` | TEXT | If user_directed | Original user instruction |
| `gate_failures` | JSONB | If blocked | Which gates failed |

**Storage:**
- Primary: `customer_care_state_history` table (`meta` JSONB field)
- Future: Dedicated `action_audit` table (PR8+)

---

## Implementation Phases

### PR2 (Current) — Type Definitions Only
- ✅ Add `ActionOrigin` typedef to `careTypes.js`
- ✅ Add `PolicyGateResult` typedef
- ✅ Document in behavioral contract
- ❌ No action execution yet

### PR7 — Action Executor (Triple-Gated)
- 🎯 Implement `classifyActionOrigin()` helper
- 🎯 Enforce gating logic for `care_autonomous`
- 🎯 Allow `user_directed` with minimal gating
- 🎯 Record `action_origin` in all action audits

### PR8+ — Office Agent Integration
- 🎯 Wire Office Agent tasks as `user_directed`
- 🎯 Ensure no C.A.R.E. interference with explicit tasks
- 🎯 Add UI indicators for action origin

---

## Examples

### Example 1: Autonomous Follow-Up (care_autonomous)

```javascript
// PR7+ implementation
const action = {
  type: 'send_followup_email',
  entity: { tenant_id, entity_type: 'lead', entity_id },
  action_origin: 'care_autonomous', // ← MUST be classified
  reason: 'Lead silent for 15 days after proposal sent'
};

// Gate checks (ALL must pass)
if (!isCareAutonomyEnabled(ctx)) {
  return { result: 'blocked', reason: 'Global kill switch OFF' };
}

if (!state.hands_off_enabled) {
  return { result: 'blocked', reason: 'Entity not opted into Hands-Off Mode' };
}

if (state.escalation_status === 'open') {
  return { result: 'escalated', reason: 'Escalation pending' };
}

// All gates pass → execute action
await executeAction(action);
await recordAudit({ action_origin: 'care_autonomous', policy_gate_result: 'allowed' });
```

---

### Example 2: User-Directed Task (user_directed)

```javascript
// User assigns task to Office Agent: "Send proposal to Acme Corp"
const action = {
  type: 'send_proposal',
  entity: { tenant_id, entity_type: 'account', entity_id },
  action_origin: 'user_directed', // ← User explicit instruction
  user_instruction: 'Send proposal to Acme Corp',
  reason: 'User requested via Office Agent task assignment'
};

// Minimal gating (only hard safety prohibitions)
if (isProhibitedAction(action)) {
  return { 
    result: 'escalated', 
    reason: 'Proposal requires manual review (regulatory compliance)' 
  };
}

// No Hands-Off Mode gates applied → execute immediately
await executeAction(action);
await recordAudit({ 
  action_origin: 'user_directed', 
  policy_gate_result: 'allowed',
  user_instruction: action.user_instruction 
});
```

---

### Example 3: Uncertain Origin (fail-safe)

```javascript
// Email reply detected from customer after proposal sent
// Unclear if this is:
// - User-directed: user said "reply when they respond"
// - Autonomous: C.A.R.E. state machine detected engagement signal

const action = {
  type: 'send_reply',
  entity: { tenant_id, entity_type: 'lead', entity_id },
  action_origin: 'care_autonomous', // ← Default to autonomous on uncertainty
  reason: 'Inbound email detected, origin unclear',
  meta: { uncertainty: true }
};

// Fail-safe: treat as autonomous → apply full gating
// Result: escalate for human decision
return { 
  result: 'escalated', 
  reason: 'Action origin uncertain, escalating for human review' 
};
```

---

## Testing Requirements

### PR7 Tests (Action Executor)

**Required test scenarios:**

1. ✅ `care_autonomous` action blocked when global kill switch OFF
2. ✅ `care_autonomous` action blocked when shadow mode ON
3. ✅ `care_autonomous` action blocked when `hands_off_enabled === false`
4. ✅ `care_autonomous` action blocked when escalation open
5. ✅ `care_autonomous` action allowed when ALL gates pass
6. ✅ `user_directed` action allowed despite Hands-Off Mode OFF
7. ✅ `user_directed` action allowed despite shadow mode ON
8. ✅ `user_directed` action escalated for hard safety prohibition
9. ✅ Uncertain origin defaults to `care_autonomous` and escalates
10. ✅ All actions record `action_origin` in audit trail

---

## Compliance

**This is a HARD CONTRACT.**

Any implementation that:
- Fails to classify action origin
- Blocks user-directed actions for C.A.R.E. reasons
- Executes care_autonomous without full gating
- Fails to fail-safe on uncertainty

**...is in VIOLATION of the Customer C.A.R.E. behavioral contract.**

---

## References

- **Behavioral Contract:** `docs/product/customer-care-v1.md` (Section 8)
- **Type Definitions:** `backend/lib/care/careTypes.js`
- **Implementation Plan:** `docs/build/customer-care-v1.tasks.md` (PR7)
- **Testing Plan:** `docs/audits/customer-care-PR7-checklist.md` (future)

---

**Status:** ✅ Documented in behavioral contract  
**Implementation:** PR7 (Action Executor)  
**Current PR2:** Type definitions added, no runtime behavior
