# C.A.R.E. Event Payload Contract

> **Version:** 1.0.0  
> **Last Updated:** January 2026  
> **Status:** Canonical

This document defines the standard payload shape for all C.A.R.E. (Customer Autonomous Relationship Engine) events, including workflow triggers, audit events, and state transitions.

---

## Canonical Payload Shape

```json
{
  "event_id": "trigger-1706234567890-abc123def",
  "type": "care.trigger_detected",
  "ts": "2026-01-26T12:34:56.789Z",
  "tenant_id": "a11dfb63-4b18-4eb8-872e-747af2e37c46",

  "entity_type": "contact",
  "entity_id": "CONTACT_UUID",

  "signal_entity_type": "activity",
  "signal_entity_id": "ACTIVITY_UUID",

  "trigger_type": "activity_overdue",
  "action_origin": "care_autonomous",
  "policy_gate_result": "allowed",
  "reason": "Activity overdue by 16 days",

  "care_state": "at_risk",
  "previous_state": "aware",
  "escalation_status": null,

  "deep_link": "/app/contacts/CONTACT_UUID",
  "intent": "triage_trigger",

  "meta": {
    "subject": "Return the package",
    "days_overdue": 16,
    "type": "task",
    "state_transition": "aware → at_risk"
  }
}
```

---

## Field Definitions

### Top-Level Fields

| Field       | Type    | Required | Description                                                     |
| ----------- | ------- | -------- | --------------------------------------------------------------- |
| `event_id`  | string  | Yes      | Unique event identifier with timestamp and random suffix        |
| `type`      | string  | Yes      | Event type: `care.trigger_detected`, `care.escalation_detected` |
| `ts`        | ISO8601 | Yes      | Event timestamp                                                 |
| `tenant_id` | UUID    | Yes      | Tenant identifier                                               |

### Relationship Anchor (entity\_\*)

**The entity that C.A.R.E. state is keyed on — the "who" of the relationship.**

| Field         | Type   | Required | Description                     |
| ------------- | ------ | -------- | ------------------------------- |
| `entity_type` | string | Yes      | `lead`, `contact`, or `account` |
| `entity_id`   | UUID   | Yes      | Entity UUID                     |

### Signal Source (signal*entity*\*)

**The entity that triggered this event — the "what happened."**

| Field                | Type   | Required | Description                         |
| -------------------- | ------ | -------- | ----------------------------------- |
| `signal_entity_type` | string | Yes      | Entity type that caused the trigger |
| `signal_entity_id`   | UUID   | Yes      | Entity UUID of the signal source    |

### Common Signal Types

| Signal Entity Type | Description                 | Trigger Types                   |
| ------------------ | --------------------------- | ------------------------------- |
| `lead`             | Lead inactivity/stagnation  | `lead_stagnant`                 |
| `activity`         | Overdue task, call, meeting | `activity_overdue`              |
| `opportunity`      | Deal decay, hot opportunity | `deal_decay`, `opportunity_hot` |
| `message`          | Email/SMS communication     | `followup_needed`               |
| `call`             | Call transcript analysis    | `call_summary`                  |

### C.A.R.E. State Fields

| Field               | Type   | Required | Description                          |
| ------------------- | ------ | -------- | ------------------------------------ |
| `care_state`        | string | Yes      | Current state after any transition   |
| `previous_state`    | string | No       | State before transition (if changed) |
| `escalation_status` | string | No       | Escalation severity if detected      |

**Valid States:**

- `unaware` — Initial state, no engagement
- `aware` — First inbound communication
- `engaged` — Bidirectional conversation
- `evaluating` — Proposal sent
- `committed` — Commitment recorded
- `active` — Stable relationship
- `at_risk` — Silence >= 14 days
- `dormant` — Silence >= 30 days
- `reactivated` — Re-engaged after dormancy
- `lost` — Explicit rejection

### Trigger Metadata

| Field                | Type   | Required | Description                |
| -------------------- | ------ | -------- | -------------------------- |
| `trigger_type`       | string | Yes      | Trigger classification     |
| `action_origin`      | string | Yes      | Always `care_autonomous`   |
| `policy_gate_result` | string | Yes      | Always `allowed`           |
| `reason`             | string | Yes      | Human-readable explanation |
| `deep_link`          | string | Yes      | UI navigation path         |
| `intent`             | string | Yes      | Currently `triage_trigger` |

### Meta Object

**Descriptive details only — never used for routing or keying.**

| Field                 | Type   | Description                               |
| --------------------- | ------ | ----------------------------------------- |
| `subject`             | string | Activity subject (activity_overdue)       |
| `days_overdue`        | number | Days overdue (activity_overdue)           |
| `days_stagnant`       | number | Days stagnant (lead_stagnant)             |
| `days_inactive`       | number | Days inactive (deal_decay)                |
| `amount`              | number | Deal amount (deal_decay, opportunity_hot) |
| `stage`               | string | Pipeline stage                            |
| `state_transition`    | string | "from → to" string if state changed       |
| `escalation_reason`   | string | Escalation details if detected            |
| `escalation_severity` | string | Escalation level                          |

---

## Mental Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    RELATIONSHIP ANCHOR                          │
│                    (entity_type / entity_id)                    │
│                                                                 │
│  This is the thing C.A.R.E. state is keyed on:                 │
│  - contact (Jane Doe, customer relationship)                   │
│  - account (Acme Corp, company relationship)                   │
│  - lead (potential customer, pre-conversion)                   │
│                                                                 │
│  ───────────────────────────────────────────────────────────── │
│                                                                 │
│                      SIGNAL SOURCE                              │
│              (signal_entity_type / signal_entity_id)            │
│                                                                 │
│  This is the thing that triggered the evaluation:              │
│  - activity (overdue task, missed call)                        │
│  - opportunity (stage stall, won/lost)                         │
│  - message (email, SMS)                                        │
│  - call (transcript analysis)                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Trigger Type Reference

### lead_stagnant

- **entity_type:** `lead`
- **signal_entity_type:** `lead` (self-triggered)
- **Trigger Condition:** Lead inactive for N days
- **Meta Fields:** `days_stagnant`, `lead_name`, `status`

### activity_overdue

- **entity_type:** `contact` or `account` (normalized from activity.related_to)
- **signal_entity_type:** `activity`
- **Trigger Condition:** Activity past due date
- **Meta Fields:** `days_overdue`, `subject`, `type`

### deal_decay

- **entity_type:** `opportunity`
- **signal_entity_type:** `opportunity` (self-triggered)
- **Trigger Condition:** Opportunity inactive for N days
- **Meta Fields:** `days_inactive`, `amount`, `stage`, `deal_name`

### opportunity_hot

- **entity_type:** `opportunity`
- **signal_entity_type:** `opportunity` (self-triggered)
- **Trigger Condition:** High probability + close date approaching
- **Meta Fields:** `probability`, `amount`, `days_to_close`, `stage`

---

## Workflow Integration

### Accessing Fields in Workflow Builder

```javascript
// Relationship anchor
{
  {
    trigger.entity_type;
  }
} // "contact"
{
  {
    trigger.entity_id;
  }
} // "UUID"

// Signal source
{
  {
    trigger.signal_entity_type;
  }
} // "activity"
{
  {
    trigger.signal_entity_id;
  }
} // "UUID"

// State
{
  {
    trigger.care_state;
  }
} // "at_risk"
{
  {
    trigger.previous_state;
  }
} // "aware"

// Details
{
  {
    trigger.meta.days_overdue;
  }
} // 16
{
  {
    trigger.meta.subject;
  }
} // "Return the package"
```

### Deep Link Navigation

Use `signal_entity_id` for linking to the triggering entity:

```javascript
// Link to the activity that caused this event
/app/activities/{{ trigger.signal_entity_id }}

// Link to the relationship (contact/account)
/app/{{ trigger.entity_type }}s/{{ trigger.entity_id }}
```

---

## Migration Notes

### Deprecated Fields

The following fields in `meta` are deprecated and will be removed in a future version:

- `meta.source_entity_type` → Use top-level `signal_entity_type`
- `meta.source_entity_id` → Use top-level `signal_entity_id`

### Backward Compatibility

During migration, check for signal fields in this order:

```javascript
const signalType = payload.signal_entity_type || payload.meta?.source_entity_type;
const signalId = payload.signal_entity_id || payload.meta?.source_entity_id;
```

---

## Best Practices

### Do

- Use `entity_*` for relationship-level operations (state, escalation)
- Use `signal_entity_*` for provenance tracking and deep links
- Keep `meta` for display-only details
- Include `state_transition` string when state changes

### Don't

- Store C.A.R.E. state keyed on signal entities
- Overload `entity_type` with signal information
- Put routing logic in `meta` fields
- Remove signal metadata entirely (audit trail)
