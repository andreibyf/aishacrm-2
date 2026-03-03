# C.A.R.E. Autonomy Playbook — Implementation Plan

**Status:** PARKED — Ready to build when prioritized  
**Last Updated:** March 2, 2026  
**Depends On:** PR0–PR8 (all complete), aiTriggersWorker, careStateEngine, carePolicyGate

---

## Problem Statement

CARE currently detects signals, proposes state transitions, persists state, and fires webhooks — but all autonomous **actions** are skipped (`ACTION_SKIPPED`). The system observes but doesn't act.

To close this loop, tenants need a way to define **what happens** when CARE detects something. This must be per-tenant configurable because different businesses have different:

- Response timing (follow up in 1 day vs 7 days)
- Preferred channels (email, task, WhatsApp, Slack)
- Action sequences (email first → task if no response → escalate)
- Trigger sensitivity (how stagnant is "stagnant"?)

## Design Decision: Hybrid Execution Model

**Simple Mode (native playbooks)** — Built-in action templates configured in CareSettings. Covers 80% of use cases without leaving AishaCRM. No external tooling required.

**Advanced Mode (external webhooks)** — Fire webhooks to Pabbly/n8n/BRAID for tenants who need full customization. Already wired via `careWorkflowTriggerClient.js`.

Both modes can coexist. A tenant can use native playbooks for lead stagnation but route escalations to a custom Pabbly flow.

---

## Architecture

```
CARE Detection (existing)
    ↓
Trigger Event (lead_stagnant, deal_decay, etc.)
    ↓
┌─────────────────────────────────────────┐
│         Playbook Router (NEW)           │
│                                         │
│  1. Look up tenant's playbook config    │
│  2. Match trigger_type → playbook       │
│  3. Check cooldown / dedup              │
│  4. Route to execution mode:            │
│     ├─ Native → PlaybookExecutor        │
│     └─ Webhook → careWorkflowTrigger    │
└─────────────────────────────────────────┘
    ↓                       ↓
Native Actions          External Webhook
(email, task,           (Pabbly, n8n,
 notification,           BRAID workflow)
 assignment)
    ↓                       ↓
    └──── Audit Trail ──────┘
```

---

## Data Model

### New Table: `care_playbook`

One playbook per tenant per trigger type. Stores the ordered action sequence.

```sql
CREATE TABLE IF NOT EXISTS public.care_playbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,

    -- Which trigger this playbook responds to
    trigger_type TEXT NOT NULL,
    -- e.g. 'lead_stagnant', 'deal_decay', 'activity_overdue',
    --      'account_risk', 'escalation_detected'

    -- Display
    name TEXT NOT NULL,
    description TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT true,

    -- Execution mode
    execution_mode TEXT NOT NULL DEFAULT 'native',
    -- 'native' = use built-in actions
    -- 'webhook' = fire to external URL
    -- 'both' = native first, then webhook

    -- For webhook mode
    webhook_url TEXT,
    webhook_secret TEXT,

    -- Ordered action steps (native mode)
    -- JSON array of action objects (see Action Step Schema below)
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Trigger-level overrides (optional, falls back to system defaults)
    trigger_config JSONB DEFAULT '{}'::jsonb,
    -- e.g. { "stagnant_days": 5, "decay_days": 10 }

    -- Cooldown: minimum time between executions for same entity
    cooldown_minutes INTEGER NOT NULL DEFAULT 1440, -- 24 hours

    -- Limits
    max_executions_per_day INTEGER DEFAULT 50,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One playbook per trigger type per tenant
    CONSTRAINT care_playbook_unique_trigger
        UNIQUE (tenant_id, trigger_type),

    CONSTRAINT care_playbook_execution_mode_check
        CHECK (execution_mode IN ('native', 'webhook', 'both'))
);
```

### Action Step Schema (inside `steps` JSONB)

Each step is an object in the ordered array:

```jsonc
{
  "step_id": "step_1",
  "action_type": "send_email", // see Available Action Types
  "delay_minutes": 0, // delay before executing (0 = immediate)
  "config": {
    "template": "lead_followup_1", // or inline subject/body
    "subject": "Just checking in, {{lead_name}}",
    "body_prompt": "Write a friendly follow-up to {{lead_name}} at {{company}}...",
    "use_ai_generation": true, // let AiSHA draft the content
  },
  "condition": null, // optional: skip if condition not met
  "stop_on_engagement": true, // abort remaining steps if entity re-engages
}
```

### Available Action Types (Simple Mode)

| Action Type         | Description                          | Config Fields                                                                                    |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `send_email`        | Send email to entity or assigned rep | `to` (entity/owner/custom), `subject`, `body_prompt`, `use_ai_generation`                        |
| `create_task`       | Create activity/task                 | `subject`, `description`, `assigned_to` (owner/manager/specific), `priority`, `due_offset_hours` |
| `send_notification` | In-app notification to rep           | `message`, `priority`, `target` (owner/manager/team)                                             |
| `reassign`          | Reassign entity                      | `strategy` (round_robin/manager/specific), `target_id`                                           |
| `update_field`      | Update entity field                  | `field`, `value`                                                                                 |
| `send_whatsapp`     | Send WhatsApp message                | `template`, `body_prompt`, `use_ai_generation`                                                   |
| `escalate`          | Flag for human review                | `severity`, `message`, `notify` (manager/admin/specific)                                         |
| `webhook`           | Fire webhook mid-sequence            | `url`, `payload_template`                                                                        |

### New Table: `care_playbook_execution`

Tracks each playbook run for audit and cooldown enforcement.

```sql
CREATE TABLE IF NOT EXISTS public.care_playbook_execution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
    playbook_id UUID NOT NULL REFERENCES public.care_playbook(id) ON DELETE CASCADE,

    -- What triggered it
    trigger_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,

    -- Execution status
    status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending', 'in_progress', 'completed', 'failed', 'cancelled', 'cooldown_skipped'

    -- Step progress
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER NOT NULL,
    step_results JSONB DEFAULT '[]'::jsonb,

    -- Scheduling
    next_step_at TIMESTAMPTZ,  -- when the next delayed step should run

    -- Outcome
    stopped_reason TEXT,  -- 'completed', 'engagement_detected', 'error', 'manual_cancel'

    -- Audit
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,

    CONSTRAINT care_playbook_execution_status_check
        CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'cooldown_skipped'))
);

-- Index for cooldown lookups
CREATE INDEX idx_care_playbook_exec_cooldown
    ON care_playbook_execution(tenant_id, playbook_id, entity_id, started_at DESC);

-- Index for pending step scheduling
CREATE INDEX idx_care_playbook_exec_pending
    ON care_playbook_execution(status, next_step_at)
    WHERE status = 'in_progress';
```

---

## Backend Implementation Plan

### Phase 1: Playbook Router (in aiTriggersWorker.js)

Modify the existing trigger processing to check for playbooks before creating suggestions:

```
For each trigger detected:
  1. Look up care_playbook WHERE tenant_id AND trigger_type AND is_enabled
  2. If no playbook → fall through to existing suggestion creation (backward compatible)
  3. If playbook found:
     a. Check cooldown (last execution for this entity > cooldown_minutes ago?)
     b. Check daily limit (executions today < max_executions_per_day?)
     c. If execution_mode = 'native' → queue PlaybookExecutor job
     d. If execution_mode = 'webhook' → fire careWorkflowTriggerClient (existing)
     e. If execution_mode = 'both' → do both
     f. Create care_playbook_execution record
     g. Emit care audit event
```

### Phase 2: PlaybookExecutor Service

New service: `backend/services/carePlaybookExecutor.js`

Processes action steps sequentially with delay support:

```
Execute playbook for entity:
  1. Load playbook steps
  2. For each step:
     a. If delay_minutes > 0 → schedule via Bull queue, set next_step_at, return
     b. Check stop_on_engagement → query entity for recent activity, abort if engaged
     c. Pass through carePolicyGate → ALLOWED/ESCALATED/BLOCKED
     d. Execute action:
        - send_email → emailService (existing)
        - create_task → Activity.create (existing)
        - send_notification → notificationService (existing)
        - reassign → entity.update assigned_to (existing)
        - send_whatsapp → WhatsApp v2 service (existing)
        - escalate → create escalation + notification
     e. Record step result in care_playbook_execution.step_results
     f. Emit care audit event per step
  3. Mark execution completed
```

### Phase 3: Delayed Step Processor

Add a Bull queue job type for delayed playbook steps:

```
carePlaybookStepQueue:
  - Picks up jobs where next_step_at <= now()
  - Resumes playbook execution from current_step
  - Re-checks stop_on_engagement before each delayed step
```

This reuses the existing Bull/Redis infrastructure from workflowQueue.

### Phase 4: Engagement Detection (stop_on_engagement)

Query pattern to detect if entity re-engaged since playbook started:

```sql
-- Did this lead/contact have any new activity since the playbook started?
SELECT EXISTS (
  SELECT 1 FROM activities
  WHERE related_id = $entity_id
    AND created_at > $playbook_started_at
    AND type IN ('email', 'call', 'meeting')
)
```

If engaged → cancel remaining steps, mark execution `stopped_reason = 'engagement_detected'`.

---

## Frontend Implementation Plan

### CareSettings Enhancement

Extend `CareSettings.jsx` to include a Playbooks tab:

**Playbook List View:**

- Table: trigger type, name, enabled toggle, execution mode, step count, last run
- Add/Edit/Delete playbook buttons
- Per-trigger-type badges showing which triggers have playbooks vs suggestions-only

**Playbook Editor (dialog or slide-over):**

- Trigger type selector (dropdown of available trigger types)
- Name / description
- Execution mode toggle (Native / Webhook / Both)
- If webhook: URL + secret fields
- Trigger config overrides (e.g., stagnant_days slider)
- Cooldown setting (hours/days)
- Daily execution limit

**Step Builder (drag-and-drop ordered list):**

- Add step button → action type selector
- Each step card shows: action type icon, delay badge, config summary
- Drag to reorder
- Click to expand config form
- Toggle: stop_on_engagement per step
- Delay input (minutes/hours/days)
- Action-specific config fields based on action_type

### Playbook Execution History

New section in CareSettings or entity detail panels:

- Recent executions table: entity, trigger, status, steps completed, outcome
- Click to expand step-by-step results
- Filter by trigger type, status, date range

---

## Per-Tenant Trigger Configuration

The `trigger_config` JSONB on each playbook allows tenants to override system defaults:

```jsonc
// Playbook for lead_stagnant with custom timing
{
  "trigger_type": "lead_stagnant",
  "trigger_config": {
    "stagnant_days": 3       // this tenant wants faster follow-up (default: 7)
  },
  "steps": [...]
}

// Playbook for deal_decay with custom threshold
{
  "trigger_type": "deal_decay",
  "trigger_config": {
    "decay_days": 7          // more aggressive than default 14
  },
  "steps": [...]
}
```

The aiTriggersWorker reads these overrides when evaluating triggers for that tenant, falling back to system defaults (env vars) when not specified.

---

## Example Playbooks

### Lead Follow-Up Sequence (Simple)

```jsonc
{
  "trigger_type": "lead_stagnant",
  "name": "Lead Re-engagement Sequence",
  "execution_mode": "native",
  "cooldown_minutes": 10080, // 7 days
  "steps": [
    {
      "step_id": "step_1",
      "action_type": "send_email",
      "delay_minutes": 0,
      "config": {
        "to": "entity",
        "subject": "Quick follow-up",
        "body_prompt": "Write a brief, friendly follow-up email to {{lead_name}} who we haven't heard from in {{days_stagnant}} days. Reference their interest in {{company_industry}}.",
        "use_ai_generation": true,
      },
      "stop_on_engagement": true,
    },
    {
      "step_id": "step_2",
      "action_type": "create_task",
      "delay_minutes": 4320, // 3 days later
      "config": {
        "subject": "Call {{lead_name}} - no email response",
        "assigned_to": "owner",
        "priority": "high",
        "due_offset_hours": 24,
      },
      "stop_on_engagement": true,
    },
    {
      "step_id": "step_3",
      "action_type": "escalate",
      "delay_minutes": 10080, // 7 days after task
      "config": {
        "severity": "medium",
        "message": "Lead {{lead_name}} unresponsive after email + call attempt",
        "notify": "manager",
      },
      "stop_on_engagement": false,
    },
  ],
}
```

### Deal Decay Alert (Notification Only)

```jsonc
{
  "trigger_type": "deal_decay",
  "name": "Stale Deal Alert",
  "execution_mode": "native",
  "cooldown_minutes": 2880, // 2 days
  "trigger_config": { "decay_days": 10 },
  "steps": [
    {
      "step_id": "step_1",
      "action_type": "send_notification",
      "delay_minutes": 0,
      "config": {
        "message": "Deal '{{opportunity_name}}' (${{amount}}) has had no activity in {{days_inactive}} days",
        "priority": "high",
        "target": "owner",
      },
    },
  ],
}
```

### Escalation → Pabbly (Advanced)

```jsonc
{
  "trigger_type": "escalation_detected",
  "name": "Escalation to External CRM",
  "execution_mode": "webhook",
  "webhook_url": "https://connect.pabbly.com/workflow/sendwebhookdata/abc123",
  "cooldown_minutes": 60,
  "steps": [],
}
```

---

## Migration Path

This is fully backward compatible:

1. **No playbook configured** → existing behavior (suggestion created in `ai_suggestions` table for human review). Zero disruption.
2. **Playbook configured** → new behavior (automated execution). Opt-in per tenant per trigger.
3. **Shadow mode playbooks** → Add a `shadow_mode` boolean to playbook. Steps are logged but not executed. Good for testing before going live.

---

## Implementation Order

| Step | Work                                                          | Effort | Depends On |
| ---- | ------------------------------------------------------------- | ------ | ---------- |
| 1    | Migration: `care_playbook` + `care_playbook_execution` tables | S      | —          |
| 2    | Backend: Playbook Router in aiTriggersWorker                  | M      | Step 1     |
| 3    | Backend: PlaybookExecutor service (immediate actions only)    | M      | Step 2     |
| 4    | Backend: API routes for playbook CRUD                         | S      | Step 1     |
| 5    | Frontend: Playbook list + editor in CareSettings              | L      | Step 4     |
| 6    | Backend: Delayed step processor (Bull queue)                  | M      | Step 3     |
| 7    | Frontend: Step builder with drag-and-drop                     | M      | Step 5     |
| 8    | Backend: Engagement detection + stop_on_engagement            | S      | Step 3     |
| 9    | Frontend: Execution history view                              | S      | Step 4     |
| 10   | Testing: Shadow mode, cooldown, dedup, multi-tenant isolation | M      | All        |

**Total estimated effort: ~2-3 weeks of focused development**

---

## Open Questions (To Resolve Before Building)

1. **AI-generated content review** — Should AI-drafted emails go through a human approval queue before sending, or is the policy gate sufficient? Consider a `require_approval` flag per step.

2. **WhatsApp template constraints** — WhatsApp Business API requires pre-approved templates for outbound messages. How does this interact with `use_ai_generation`? May need a template registry.

3. **Multi-entity sequences** — A stagnant lead might trigger a playbook, but what if the lead converts to a contact mid-sequence? Need entity lifecycle awareness.

4. **Playbook conflicts** — What if both `lead_stagnant` and `deal_decay` fire for the same lead+opportunity? Need conflict resolution rules (priority ranking, or let both run).

5. **Billing implications** — AI-generated content costs tokens. Should playbook executions count toward a tenant's AI usage quota?

---

## References

- Existing CARE modules: `backend/lib/care/` (20+ files)
- State engine: `careStateEngine.js`
- Policy gate: `carePolicyGate.js`
- Webhook client: `careWorkflowTriggerClient.js`
- Architecture doc: `docs/architecture/CARE_CUSTOMER_ADAPTIVE_RESPONSE_ENGINE.md`
- Behavioral contract: `docs/product/customer-care-v1.md`
- DB schema: `backend/migrations/116_customer_care_state.sql`
- CareSettings UI: `src/components/settings/CareSettings.jsx`
- AI Triggers Worker: `backend/lib/aiTriggersWorker.js`
- Workflow queue (Bull): `backend/services/workflowQueue.js`
