# PLAN

## Feature Identity

- **Description**: Add deterministic outcome classification to every C.A.R.E. trigger evaluation cycle, producing a structured `outcome_type` + `outcome_reason` on each `ai_suggestions` record and corresponding audit emission.
- **Value**: Enables C.A.R.E. to distinguish _why_ a trigger cycle produced (or did not produce) a suggestion — closing the observability gap between "trigger detected" and "suggestion persisted." Required for downstream scoring, provider-performance comparison, and C.A.R.E. readiness per `AI_RUNTIME_CONTRACT.md §C.A.R.E. Readiness Signals`.
- **In-scope**: Outcome typing for the trigger→suggestion path inside `aiTriggersWorker.js`; audit emission of new outcome fields; queryable telemetry. Classification-only — no routing, no behavioral change.
- **Out-of-scope**: Chat-level outcome classification (covered by prior PLAN.md work), UI surfaces, new API endpoints, new database tables, autonomy mode changes, webhook payload schema changes.

---

## Impacted Runtime Surfaces

| Surface | Module | Why | Change type |
|---------|--------|-----|-------------|
| Trigger worker | `backend/lib/aiTriggersWorker.js` | `createSuggestionIfNew()` is the single codepath that produces or suppresses a suggestion; outcome must be classified here | Additive |
| Audit emitter | `backend/lib/care/careAuditEmitter.js` | New `ACTION_OUTCOME` event type emitted after classification | Additive |
| Audit types | `backend/lib/care/careAuditTypes.js` | New enum value + factory support for outcome fields | Additive |
| C.A.R.E. types | `backend/lib/care/careTypes.js` | Canonical `OutcomeType` enum definition | Additive |
| `ai_suggestions` table | `backend/migrations/080_ai_suggestions_table.sql` | New `outcome_type` TEXT column on existing table | Additive (nullable column) |
| Redis | — | No Redis changes — outcomes are log + DB only | — |
| Braid | — | No Braid tool changes | — |
| AI engine | — | No LLM call changes | — |

---

## Contract Delta (C.A.R.E.)

### Task lifecycle
- No new lifecycle states. The existing `ai_suggestions.status` flow (`pending → approved|rejected|applied|expired`) is unchanged.
- Outcome classification decorates the _creation_ event, not a new stage.

### Success criteria
- A trigger evaluation that produces a persisted `ai_suggestions` row is classified `outcome_type = "suggestion_created"`.

### Failure / suppression classification
New `outcome_type` values (exhaustive, deterministic):

| `outcome_type` | Meaning | Source check |
|---|---|---|
| `suggestion_created` | Suggestion persisted successfully | Insert returned row |
| `duplicate_suppressed` | Cooldown / dedup check blocked creation | Existing `pending` or recent `rejected` row found |
| `generation_failed` | `generateAiSuggestion()` returned null/error | Return value check |
| `low_confidence` | Confidence below threshold | `confidence < MIN_CONFIDENCE` |
| `constraint_violation` | DB unique constraint (`23505`) caught | Catch block |
| `error` | Unexpected runtime error | Catch-all |

### Outcome typing
- Classification-only. No routing logic branches on `outcome_type`.

### New telemetry fields
- `outcome_type` (string, one of 6 values above) — emitted in `[CARE_AUDIT]` log and persisted on `ai_suggestions` rows where applicable.
- `outcome_reason` (string, human-readable) — emitted in `meta` of audit event.

### New outcome states
- None for `care_state` or `ai_suggestions.status`. `outcome_type` is metadata, not state.

### Observability signals
- `CareAuditEventType.ACTION_OUTCOME` — new structured log event with `outcome_type` + `outcome_reason` in `meta`.
- Queryable via `ai_suggestions.outcome_type` column for DB analytics.

---

## Data Model Impact

| Change | Detail |
|--------|--------|
| New column | `ai_suggestions.outcome_type TEXT NULL DEFAULT NULL` — nullable, no NOT NULL constraint, no index initially |
| New migration | `backend/migrations/XXX_ai_suggestions_outcome_type.sql` — single `ALTER TABLE ADD COLUMN` |
| Multi-tenant | Column inherits existing RLS policy on `ai_suggestions` — no new policy |
| RLS impact | NONE — no policy changes |
| New tables | NONE |

---

## Execution Flow Changes

```
aiTriggersWorker poll tick
  → processTriggersForTenant(tenantUuid)
    → detectTriggerCandidates (lead_stagnant, deal_decay, etc.)
      → for each candidate:
        → createSuggestionIfNew(tenantUuid, triggerData)
          ┌─────────────────────────────────────────────┐
          │ 1. Cooldown check (existing)                │
          │    → hit? outcome = duplicate_suppressed     │
          │ 2. generateAiSuggestion() (existing)        │
          │    → null? outcome = generation_failed       │
          │    → confidence < threshold?                 │
          │       outcome = low_confidence               │
          │ 3. INSERT ai_suggestions (existing)          │
          │    → success? outcome = suggestion_created   │
          │    → 23505? outcome = constraint_violation   │
          │ 4. CATCH → outcome = error                  │
          │                                              │
          │ 5. ★ NEW: classify + emit audit event       │
          │    emitCareAudit({                           │
          │      event_type: ACTION_OUTCOME,             │
          │      meta: { outcome_type, outcome_reason }  │
          │    })                                        │
          │ 6. ★ NEW: if row inserted, UPDATE           │
          │    ai_suggestions SET outcome_type            │
          └─────────────────────────────────────────────┘
```

- **Where**: Inside `createSuggestionIfNew()` at `backend/lib/aiTriggersWorker.js` (line ~1452)
- **Sync vs async**: Synchronous within the existing worker tick — no new async boundaries
- **Idempotency**: Classification is pure/deterministic from the same inputs. Re-running a trigger tick for the same entity hits the cooldown check → `duplicate_suppressed` — idempotent.

---

## Source-of-Truth Modules

| File | Change |
|------|--------|
| `backend/lib/care/careTypes.js` | Add `OUTCOME_TYPES` enum object |
| `backend/lib/care/careAuditTypes.js` | Add `ACTION_OUTCOME` to `CareAuditEventType` |
| `backend/lib/aiTriggersWorker.js` | Classify outcome in `createSuggestionIfNew()`, emit audit, persist `outcome_type` |
| `backend/migrations/XXX_ai_suggestions_outcome_type.sql` | `ALTER TABLE ai_suggestions ADD COLUMN outcome_type TEXT NULL` |
| `backend/lib/care/__tests__/careAuditEmitter.test.js` | Cover `ACTION_OUTCOME` event emission |
| `backend/lib/care/__tests__/outcomeClassification.test.js` | New test file — outcome classification paths |

---

## Ordered Implementation Steps

| # | Step | Verifiable output |
|---|------|-------------------|
| 1 | Add `OUTCOME_TYPES` frozen object to `careTypes.js` with 6 values | Import resolves; `Object.keys(OUTCOME_TYPES).length === 6` |
| 2 | Add `ACTION_OUTCOME` to `CareAuditEventType` in `careAuditTypes.js` | Enum exported and usable in `createAuditEvent()` |
| 3 | Create migration `XXX_ai_suggestions_outcome_type.sql` — `ALTER TABLE ai_suggestions ADD COLUMN outcome_type TEXT NULL` | Column exists in schema; nullable; existing rows unaffected |
| 4 | Refactor `createSuggestionIfNew()` to track `outcome_type` at each exit point — cooldown → `duplicate_suppressed`, null generation → `generation_failed`, low confidence → `low_confidence`, insert success → `suggestion_created`, 23505 → `constraint_violation`, catch-all → `error` | Every code path sets `outcome_type` before returning |
| 5 | After classification, call `emitCareAudit()` with `event_type: ACTION_OUTCOME`, `outcome_type` and `outcome_reason` in `meta` | `[CARE_AUDIT]` JSON log line contains `outcome_type` field |
| 6 | On `suggestion_created` path, include `outcome_type` in the INSERT payload (or UPDATE immediately after) | `ai_suggestions` row has non-null `outcome_type` |
| 7 | Write unit tests for all 6 outcome paths | `npm test` passes; each path exercised |
| 8 | Run `docker exec aishacrm-backend npm test` — full regression | Zero regressions |

---

## Test Strategy

**Location**: `backend/lib/care/__tests__/outcomeClassification.test.js` (new)

| Test case | Covers |
|-----------|--------|
| Trigger with no existing suggestion → `suggestion_created` | Happy path |
| Trigger with existing `pending` suggestion → `duplicate_suppressed` | Cooldown dedup |
| Trigger with recent `rejected` suggestion (within 7d) → `duplicate_suppressed` | Cooldown window |
| `generateAiSuggestion()` returns null → `generation_failed` | AI generation failure |
| Generated confidence < threshold → `low_confidence` | Confidence gate |
| Concurrent insert hits 23505 → `constraint_violation` | Race condition safety |
| Unexpected error in insert → `error` | Catch-all |
| Audit event emitted for every outcome type | Telemetry completeness |
| `outcome_type` value is always one of `OUTCOME_TYPES` values | Enum enforcement |
| Multi-tenant: outcome classification scoped to `tenant_id` | Tenant isolation |
| Re-running same trigger produces idempotent outcome | Idempotency |

**Existing test files to verify non-regression**:
- `backend/lib/care/__tests__/careAuditEmitter.test.js`
- `backend/lib/care/__tests__/carePipeline.integration.test.js`

---

## Observability & Telemetry

| Signal | Producer | Format | Query method |
|--------|----------|--------|-------------|
| `[CARE_AUDIT]` with `event_type: ACTION_OUTCOME` | `careAuditEmitter.emitCareAudit()` | Structured JSON log line | `grep '[CARE_AUDIT]' \| jq '.meta.outcome_type'` |
| `ai_suggestions.outcome_type` column | `createSuggestionIfNew()` INSERT | TEXT column in PostgreSQL | `SELECT outcome_type, COUNT(*) FROM ai_suggestions GROUP BY outcome_type` |
| Existing `braid:metrics:*` counters | Unchanged | Redis counters | Unchanged |

**C.A.R.E. readiness validation**: The `AI_RUNTIME_CONTRACT.md §C.A.R.E. Readiness Signals` requires "task-level outcome data." This feature provides it for the trigger→suggestion path:
- `suggestion_created` + `generation_failed` rates → AI reliability signal
- `duplicate_suppressed` rate → trigger noise signal
- `low_confidence` rate → model quality signal

All telemetry is additive — no existing log shapes or Redis keys are modified.

---

## Rollout & Safety

| Concern | Approach |
|---------|----------|
| **Backward compatibility** | `outcome_type` is nullable; existing rows get `NULL`; no existing code reads this field; audit event is a new type — existing consumers ignore unknown types |
| **Feature flag** | Not required — classification is passive (decorates existing writes + logs); no behavioral change |
| **Failure blast radius** | Classification error is caught inside `createSuggestionIfNew()` — suggestion creation still succeeds even if outcome logging fails; audit emission is fire-and-forget (logger, not DB) |
| **Reprocessing** | Re-running a trigger tick for the same entity produces `duplicate_suppressed` — idempotent; no data corruption risk |
| **Migration safety** | `ALTER TABLE ADD COLUMN ... NULL` is non-blocking in PostgreSQL; no default, no backfill |

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `createSuggestionIfNew()` is 300+ lines with multiple exit points — classifying each path requires careful audit of control flow | Medium | Step 4 maps each `return`/`catch` to an outcome; tests verify all paths |
| Outcome classification adds latency to each trigger evaluation | Low | Pure in-memory string assignment + one `emitCareAudit()` call (logger, not DB write); negligible |
| Future consumers may treat `outcome_type` as a routing signal, violating "classification-only" scope | Low | Document in `careTypes.js` JSDoc: "outcome_type is observability metadata — do not branch execution on it" |

---

## Definition of Done

- [ ] `OUTCOME_TYPES` enum exported from `careTypes.js` with exactly 6 values
- [ ] `ACTION_OUTCOME` present in `CareAuditEventType` enum
- [ ] Migration adds `outcome_type TEXT NULL` to `ai_suggestions`; applied without error
- [ ] Every exit path in `createSuggestionIfNew()` assigns an `outcome_type` from the enum
- [ ] `[CARE_AUDIT]` log emitted with `event_type: "ACTION_OUTCOME"` for every trigger evaluation
- [ ] `ai_suggestions` rows created with non-null `outcome_type`
- [ ] All 6 outcome paths have dedicated test cases that pass
- [ ] `docker exec aishacrm-backend npm test` — zero regressions
- [ ] No changes to `care_state` lifecycle, webhook payloads, or API response shapes
- [ ] Tenant isolation preserved — `outcome_type` scoped by existing RLS on `ai_suggestions`
