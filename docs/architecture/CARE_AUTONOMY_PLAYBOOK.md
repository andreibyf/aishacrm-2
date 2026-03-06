# C.A.R.E. Autonomy Playbook — Implementation Documentation

**Status:** Phase 1 Complete (Steps 1–10)  
**Date:** March 6, 2026  
**Depends On:** PR0–PR8, aiTriggersWorker, careStateEngine, carePolicyGate

---

## Overview

The CARE Autonomy Playbook system closes the action loop in the Customer Adaptive Response Engine. CARE previously detected signals (lead stagnation, deal decay, etc.) and logged them, but every autonomous action was skipped (`ACTION_SKIPPED`). The playbook system enables tenants to define automated response sequences that execute when CARE detects trigger conditions.

## Architecture

```
CARE Detection (aiTriggersWorker)
    ↓
processTriggeredAction()
    ↓
┌─────────────────────────────────────────┐
│         Playbook Router                  │
│  carePlaybookRouter.js                   │
│                                          │
│  1. Look up care_playbook for tenant     │
│  2. Check cooldown + daily limit         │
│  3. Create care_playbook_execution       │
│  4. Route to execution mode:             │
│     ├─ Native → Bull queue → Executor    │
│     └─ Webhook → careWorkflowTrigger     │
│  5. If no playbook → createSuggestionIfNew│
└─────────────────────────────────────────┘
    ↓                       ↓
PlaybookExecutor        External Webhook
(Bull queue)            (Pabbly, n8n, BRAID)
    ↓
Action Steps:
- send_email (→ emailWorker)
- create_task (→ activities table)
- send_notification (→ notifications table)
- reassign (→ entity update)
- update_field (→ entity update)
- send_whatsapp (→ Twilio template)
- escalate (→ notification + severity)
- webhook (→ HTTP POST mid-sequence)
    ↓
Audit Trail (careAuditEmitter)
```

## Database Tables

### care_playbook

One playbook per tenant per trigger type.

| Column                 | Type    | Description                                            |
| ---------------------- | ------- | ------------------------------------------------------ |
| id                     | UUID    | Primary key                                            |
| tenant_id              | UUID    | FK to tenant                                           |
| trigger_type           | TEXT    | e.g. 'lead_stagnant', 'deal_decay'                     |
| name                   | TEXT    | Display name                                           |
| description            | TEXT    | Optional description                                   |
| is_enabled             | BOOLEAN | Admin toggle (default: true)                           |
| shadow_mode            | BOOLEAN | Log-only mode (default: true)                          |
| priority               | INTEGER | Conflict resolution (lower = higher, default: 100)     |
| execution_mode         | TEXT    | 'native', 'webhook', or 'both'                         |
| webhook_url            | TEXT    | For webhook/both mode                                  |
| webhook_secret         | TEXT    | HMAC signing secret                                    |
| steps                  | JSONB   | Ordered array of action step objects                   |
| trigger_config         | JSONB   | Per-tenant trigger overrides                           |
| cooldown_minutes       | INTEGER | Min time between executions per entity (default: 1440) |
| max_executions_per_day | INTEGER | Daily cap (default: 50)                                |

Unique constraint: `(tenant_id, trigger_type)` — one playbook per trigger per tenant.

### care_playbook_execution

Tracks each playbook run for audit and cooldown enforcement.

| Column         | Type        | Description                                                     |
| -------------- | ----------- | --------------------------------------------------------------- |
| id             | UUID        | Primary key                                                     |
| tenant_id      | UUID        | FK to tenant                                                    |
| playbook_id    | UUID        | FK to care_playbook (CASCADE)                                   |
| trigger_type   | TEXT        | Trigger that fired                                              |
| entity_type    | TEXT        | e.g. 'lead', 'contact'                                          |
| entity_id      | UUID        | The entity being acted on                                       |
| status         | TEXT        | pending/in_progress/completed/failed/cancelled/cooldown_skipped |
| current_step   | INTEGER     | Progress tracker                                                |
| total_steps    | INTEGER     | Step count at execution time                                    |
| step_results   | JSONB       | Array of per-step result objects                                |
| next_step_at   | TIMESTAMPTZ | When next delayed step runs                                     |
| stopped_reason | TEXT        | Why execution stopped                                           |
| tokens_used    | INTEGER     | AI token consumption                                            |
| shadow_mode    | BOOLEAN     | Snapshot from playbook at execution time                        |

## RLS Policies

Both tables:

- `service_role`: Full access (ALL)
- `authenticated`: SELECT only, scoped to own tenant via JWT `app_metadata.tenant_id`

Write operations go through backend API routes protected by `requireAdminRole` middleware (superadmin + admin only).

## API Endpoints

Base: `/api/care-playbooks`

| Method | Path              | Auth          | Description                                |
| ------ | ----------------- | ------------- | ------------------------------------------ |
| GET    | `/`               | Admin         | List all playbooks for tenant              |
| GET    | `/:id`            | Admin         | Get single playbook                        |
| POST   | `/`               | Admin         | Create playbook                            |
| PUT    | `/:id`            | Admin         | Update playbook (partial)                  |
| PUT    | `/:id/toggle`     | Admin         | Toggle is_enabled                          |
| DELETE | `/:id`            | Admin         | Delete playbook + cancel active executions |
| GET    | `/executions`     | Authenticated | List execution history (with filters)      |
| GET    | `/executions/:id` | Authenticated | Get execution detail with step results     |

## Resolved Design Decisions

1. **AI content approval**: `require_approval` flag per step. Defaults to `true` for AI-generated email content. Routes to `ai_suggestions` table for human review. Exposed as toggle in Step Builder UI.

2. **WhatsApp templates**: `use_ai_generation` is disabled for WhatsApp steps. Template SID from Twilio is configured in step config. Meta requires pre-approved templates for outbound WhatsApp.

3. **Entity conversion**: Active playbook executions are cancelled when a lead converts to contact. `stopped_reason = 'entity_converted'`.

4. **Playbook conflicts**: `priority` column (lower = higher priority). When multiple playbooks fire for same entity in cooldown window, lowest priority number wins.

5. **AI billing**: `tokens_used` integer tracked per execution for steps with `use_ai_generation: true`.

## Files Created/Modified

### New Files

- `backend/lib/care/carePlaybookRouter.js` — Routing logic with 60s cache
- `backend/services/carePlaybookQueue.js` — Bull queue definition
- `backend/services/carePlaybookExecutor.js` — Step execution service
- `backend/routes/carePlaybooks.js` — CRUD API routes
- `src/components/settings/CarePlaybooks.jsx` — Playbook list + editor UI
- `src/components/settings/PlaybookStepBuilder.jsx` — Drag-reorder step builder
- `backend/lib/care/__tests__/carePlaybookRouter.test.js` — Router unit tests
- `backend/lib/care/__tests__/carePlaybookExecutor.test.js` — Executor unit tests

### Modified Files

- `backend/lib/aiTriggersWorker.js` — Import + processTriggeredAction wrapper + 4 call site replacements
- `backend/server.js` — Route mount + queue processor init + graceful shutdown
- `backend/lib/swagger.js` — Added care-playbooks tag
- `src/components/settings/CareSettings.jsx` — Added Playbooks section
- `src/pages/Settings.jsx` — Opened CARE tab to admin role

## Migration Path

Fully backward compatible:

1. **No playbook configured** → Existing behavior (suggestions created in ai_suggestions table). Zero disruption.
2. **Playbook configured, shadow mode ON (default)** → Steps logged but not executed. Safe to test.
3. **Playbook configured, shadow mode OFF** → Full autonomous execution.

## Testing

Run backend tests:

```bash
node --test backend/lib/care/__tests__/carePlaybookRouter.test.js
node --test backend/lib/care/__tests__/carePlaybookExecutor.test.js
```

Manual smoke tests:

1. Create a playbook via API or UI for `lead_stagnant` trigger
2. Verify it appears in GET /api/care-playbooks
3. Toggle shadow mode off, verify switch works
4. Wait for aiTriggersWorker to detect a stagnant lead
5. Check care_playbook_execution table for new record
6. Check step_results JSONB for per-step outcomes
7. Verify cooldown: trigger same lead again within cooldown window → status = cooldown_skipped
8. Verify daily limit: exceed max_executions_per_day → audit event with BLOCKED
