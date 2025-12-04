# Phase 3: Autonomous Operations - Implementation Summary

## Overview

Phase 3 implements the **AI Suggestion System** - a human-in-the-loop autonomous operations layer that detects opportunities for CRM improvements and surfaces actionable suggestions for human review and approval.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TRIGGER ENGINE                                │
│   aiTriggersWorker.js (60s interval polling)                        │
│   - Lead Stagnation (7+ days)                                       │
│   - Deal Decay (14+ days inactive)                                  │
│   - Activity Overdue (3+ days)                                      │
│   - Opportunity Hot (>70% probability, closing soon)                │
│   - Account Risk, Contact Inactive, Followup Needed                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Triggers detected
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SUGGESTION ENGINE                               │
│   - AI Brain integration (propose_actions mode)                     │
│   - Template-based fallback                                         │
│   - Confidence scoring (0.0 - 1.0)                                 │
│   - Priority assignment (urgent/high/normal/low)                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Suggestions created
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SUGGESTION QUEUE                                 │
│   ai_suggestions table (PostgreSQL + RLS)                           │
│   Status: pending → approved → applied                              │
│           pending → rejected                                        │
│           pending → expired                                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Human review
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        REVIEW UI                                     │
│   SuggestionQueue.jsx - Full review interface                       │
│   SuggestionBadge.jsx - Notification badge with quick actions       │
│   - View reasoning and proposed action                              │
│   - Approve / Reject / Defer controls                               │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ User approves
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SAFE APPLY ENGINE                                │
│   POST /api/suggestions/:id/apply                                   │
│   - Executes via Braid tools                                        │
│   - Full audit logging                                              │
│   - Error handling with rollback to 'approved' status               │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ Outcome tracked
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        TELEMETRY                                     │
│   ai_suggestion_metrics - Aggregated performance data               │
│   ai_suggestion_feedback - Individual feedback events               │
│   - Feedback ratings (1-5 stars)                                    │
│   - Outcome tracking (positive/negative)                            │
│   - Metrics aggregation by trigger type                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Files Created/Modified

### Backend

| File | Description |
|------|-------------|
| `backend/lib/aiTriggersWorker.js` | Core trigger detection worker (NEW) |
| `backend/routes/suggestions.js` | REST API for suggestions (NEW) |
| `backend/server.js` | Added worker startup and route mounting (MODIFIED) |
| `backend/migrations/080_ai_suggestions_table.sql` | Base suggestions table (NEW) |
| `backend/migrations/081_ai_suggestions_telemetry.sql` | Telemetry tables (NEW) |

### Frontend

| File | Description |
|------|-------------|
| `src/components/ai/SuggestionQueue.jsx` | Full review UI component (NEW) |
| `src/components/ai/SuggestionBadge.jsx` | Notification badge with dropdown (NEW) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/suggestions` | List suggestions (filterable by status, trigger_type) |
| GET | `/api/suggestions/:id` | Get suggestion details |
| POST | `/api/suggestions/:id/approve` | Approve a suggestion |
| POST | `/api/suggestions/:id/reject` | Reject a suggestion |
| POST | `/api/suggestions/:id/apply` | Execute approved suggestion |
| POST | `/api/suggestions/:id/feedback` | Submit feedback (rating, outcome) |
| POST | `/api/suggestions/trigger` | Manual trigger for testing |
| GET | `/api/suggestions/stats` | Summary statistics |
| GET | `/api/suggestions/metrics` | Aggregated telemetry data |
| POST | `/api/suggestions/aggregate` | Run metrics aggregation |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_TRIGGERS_WORKER_ENABLED` | `false` | Enable the trigger worker |
| `AI_TRIGGERS_WORKER_INTERVAL_MS` | `60000` | Polling interval (1 minute) |
| `AI_USE_BRAIN_FOR_SUGGESTIONS` | `true` | Use AI Brain vs templates |
| `LEAD_STAGNANT_DAYS` | `7` | Days before lead is flagged |
| `DEAL_DECAY_DAYS` | `14` | Days of inactivity for deals |

## Trigger Types

| Trigger | Description | Default Threshold |
|---------|-------------|-------------------|
| `lead_stagnant` | Lead with no activity | 7 days |
| `deal_decay` | Opportunity with no updates | 14 days |
| `activity_overdue` | Task/call past due date | 3 days |
| `opportunity_hot` | High probability, closing soon | >70%, <7 days |
| `contact_inactive` | Contact with no engagement | 30 days |
| `account_risk` | Account with declining metrics | Various |
| `followup_needed` | Meeting without follow-up | 3 days |

## Database Schema

### ai_suggestions
- `id` (uuid, PK)
- `tenant_id` (uuid, FK → tenants)
- `trigger_type` (text)
- `record_type` (text: lead, opportunity, activity, etc.)
- `record_id` (uuid)
- `action` (jsonb: { tool_name, tool_args })
- `reasoning` (text)
- `confidence` (numeric 0.0-1.0)
- `priority` (enum: urgent, high, normal, low)
- `status` (enum: pending, approved, rejected, applied, expired)
- `reviewed_at`, `reviewed_by`, `applied_at`, `apply_result`
- `feedback_rating`, `feedback_comment`, `outcome_positive`
- `expires_at`, `created_at`, `updated_at`

### ai_suggestion_metrics
- Aggregated by `time_bucket`, `bucket_size`, `trigger_type`
- Counts: generated, approved, rejected, applied, expired
- Quality: avg_confidence, avg_rating, positive/negative outcomes

### ai_suggestion_feedback
- Individual feedback events
- Types: rating, comment, outcome, correction

## Usage

### Enable the Worker
```bash
# In backend/.env
AI_TRIGGERS_WORKER_ENABLED=true
```

### Manual Trigger (Testing)
```bash
curl -X POST http://localhost:4001/api/suggestions/trigger \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "your-tenant-uuid"}'
```

### Approve and Apply
```bash
# 1. Approve
curl -X POST http://localhost:4001/api/suggestions/{id}/approve \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "your-tenant-uuid"}'

# 2. Apply
curl -X POST http://localhost:4001/api/suggestions/{id}/apply \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "your-tenant-uuid"}'
```

### Submit Feedback
```bash
curl -X POST http://localhost:4001/api/suggestions/{id}/feedback \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "your-tenant-uuid", "rating": 5, "outcome_positive": true}'
```

## Safety Guarantees

1. **Human-in-the-Loop**: All suggestions require explicit approval before execution
2. **Audit Trail**: Full logging of who approved, when, and what was executed
3. **Rollback-Ready**: Failed executions revert to 'approved' status for retry
4. **Tenant Isolation**: RLS policies enforce multi-tenant data isolation
5. **Expiration**: Stale suggestions automatically expire (7 days default)
6. **Advisory Locks**: Prevents duplicate worker runs across instances

## Next Steps

1. **Enable in production**: Set `AI_TRIGGERS_WORKER_ENABLED=true`
2. **Run migrations**: Apply 080 and 081 SQL files
3. **Add SuggestionBadge to header**: Import in Layout.jsx
4. **Create dashboard page**: Dedicated /Suggestions route
5. **Configure cron**: Schedule `/api/suggestions/aggregate` for daily metrics
