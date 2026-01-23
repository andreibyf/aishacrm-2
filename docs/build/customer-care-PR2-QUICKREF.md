# Customer C.A.R.E. PR2 — Quick Reference

## ✅ PR2 Complete

All files created and tested. Ready for git operations.

---

## Files Created (5)

1. **careTypes.js** (135 lines) — Type definitions
2. **careSignals.js** (130 lines) — Signal schema
3. **careStateEngine.js** (285 lines) — State machine
4. **careStateStore.js** (220 lines) — Database helpers
5. **__tests__/careStateEngine.test.js** (550 lines) — Unit tests

**Total:** 1,320 lines of production code + tests

---

## Test Results

```bash
node --test backend/lib/care/__tests__/careStateEngine.test.js
```

**Result:** ✅ **29/29 tests passing**

---

## Git Commands

### 1. Create Branch
```bash
git checkout -b copilot/customer-care-pr2-state-engine
```

### 2. Stage Files
```bash
git add backend/lib/care/careTypes.js
git add backend/lib/care/careSignals.js
git add backend/lib/care/careStateEngine.js
git add backend/lib/care/careStateStore.js
git add backend/lib/care/__tests__/careStateEngine.test.js
git add docs/build/customer-care-PR2-SUMMARY.md
git add docs/build/customer-care-PR2-QUICKREF.md
```

### 3. Commit
```bash
git commit -m "Add Customer C.A.R.E. PR2: State Engine (Pure Logic)

- Add careTypes.js: Canonical state/entity type definitions
- Add careSignals.js: Signal schema and thresholds
- Add careStateEngine.js: Deterministic state machine (9 rules)
- Add careStateStore.js: Database access helpers
- Add careStateEngine.test.js: Comprehensive unit tests (29/29 passing)

Safety:
- Zero runtime behavior change (no production hooks)
- No autonomous actions (pure logic only)
- No existing table modifications
- All transitions require non-empty reason

Depends on: PR1 (customer_care_state tables)
Next: PR3 (Escalation Detector)

Refs: docs/product/customer-care-v1.md
Refs: docs/build/customer-care-v1.tasks.md (Phase 1, PR2)"
```

### 4. Push
```bash
git push origin copilot/customer-care-pr2-state-engine
```

---

## State Transition Rules (Quick Reference)

| From | To | Trigger | Signal |
|------|----|---------| -------|
| unaware | aware | First contact | `last_inbound_at` |
| aware | engaged | Conversation starts | `has_bidirectional` |
| engaged | evaluating | Proposal sent | `proposal_sent` |
| evaluating | committed | Commitment made | `commitment_recorded` |
| committed | active | Deal closes | `contract_signed` / `payment_received` |
| any | at_risk | Silence 14+ days | `silence_days >= 14` |
| at_risk | dormant | Silence 30+ days | `silence_days >= 30` |
| dormant | reactivated | Inbound after dormancy | `last_inbound_at` |
| any | lost | Explicit rejection | `explicit_rejection` |

---

## API Surface (Functions)

### careStateEngine.js

```javascript
import {
  validateCareState,
  validateEntityType,
  getDefaultCareState,
  proposeTransition,
  applyTransition
} from './backend/lib/care/careStateEngine.js';

// Validate state
validateCareState('engaged'); // ✅ 'engaged'
validateCareState('invalid'); // ❌ throws

// Get default
getDefaultCareState('lead'); // 'unaware'

// Propose transition
const proposal = proposeTransition({
  current_state: 'unaware',
  signals: { last_inbound_at: new Date() }
});
// { from_state: 'unaware', to_state: 'aware', reason: '...', meta: {...} }

// Apply transition (writes to DB)
await applyTransition({
  ctx: { tenant_id, entity_type, entity_id },
  proposal,
  store,
  actor: { type: 'system', id: null }
});
```

### careStateStore.js

```javascript
import {
  getCareState,
  upsertCareState,
  appendCareHistory,
  getCareHistory
} from './backend/lib/care/careStateStore.js';

// Read current state
const state = await getCareState({ tenant_id, entity_type, entity_id });
// { care_state: 'engaged', hands_off_enabled: false, ... }

// Write state
await upsertCareState(
  { tenant_id, entity_type, entity_id },
  { care_state: 'aware', last_signal_at: new Date() }
);

// Append history
await appendCareHistory(
  { tenant_id, entity_type, entity_id },
  {
    from_state: 'unaware',
    to_state: 'aware',
    event_type: 'state_applied',
    reason: 'First inbound received'
  }
);

// Read history
const history = await getCareHistory(
  { tenant_id, entity_type, entity_id },
  { limit: 50 }
);
```

---

## Safety Checklist

- ✅ Zero runtime behavior change
- ✅ No production code calls these functions
- ✅ No API endpoints modified
- ✅ No autonomous actions
- ✅ No message sending
- ✅ No workflow execution
- ✅ No existing table modifications
- ✅ All tests passing (29/29)
- ✅ All transitions require non-empty reason

---

## Next PR: PR3 (Escalation Detector)

**Goal:** Read-only escalation detection logic

**Scope:**
- Add `backend/lib/care/careEscalationDetector.js`
- Detect: explicit objections, pricing discussion, negative sentiment
- Output: `{ escalate: boolean, reasons: string[] }`
- No actions, no DB writes, log only

---

**Status:** ✅ PR2 Complete — Ready for review and merge
