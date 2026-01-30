/**
 * Customer C.A.R.E. State Engine Tests
 * 
 * Unit tests for the C.A.R.E. state engine (PR2).
 * 
 * Test coverage:
 * - State validation
 * - Default state assignment
 * - Transition proposal logic (all 9 rules)
 * - Transition application (with mock store)
 * - Edge cases and error handling
 * 
 * Run with: node --test backend/lib/care/__tests__/careStateEngine.test.js
 */

import { describe, _it, test } from 'node:test';
import assert from 'node:assert';
import {
  validateCareState,
  validateEntityType,
  getDefaultCareState,
  proposeTransition,
  applyTransition
} from '../careStateEngine.js';

// ============================================================================
// State Validation Tests
// ============================================================================

describe('validateCareState', () => {
  test('should accept all valid states', () => {
    const validStates = [
      'unaware', 'aware', 'engaged', 'evaluating', 'committed',
      'active', 'at_risk', 'dormant', 'reactivated', 'lost'
    ];
    
    validStates.forEach(state => {
      assert.strictEqual(validateCareState(state), state);
    });
  });
  
  test('should reject invalid state', () => {
    assert.throws(
      () => validateCareState('invalid_state'),
      /Invalid C.A.R.E. state/
    );
  });
  
  test('should reject empty string', () => {
    assert.throws(
      () => validateCareState(''),
      /must be a non-empty string/
    );
  });
  
  test('should reject null', () => {
    assert.throws(
      () => validateCareState(null),
      /must be a non-empty string/
    );
  });
});

describe('validateEntityType', () => {
  test('should accept valid entity types', () => {
    assert.strictEqual(validateEntityType('lead'), 'lead');
    assert.strictEqual(validateEntityType('contact'), 'contact');
    assert.strictEqual(validateEntityType('account'), 'account');
  });
  
  test('should reject invalid entity type', () => {
    assert.throws(
      () => validateEntityType('customer'),
      /Invalid entity type/
    );
  });
});

// ============================================================================
// Default State Tests
// ============================================================================

describe('getDefaultCareState', () => {
  test('should return unaware for all entity types', () => {
    assert.strictEqual(getDefaultCareState('lead'), 'unaware');
    assert.strictEqual(getDefaultCareState('contact'), 'unaware');
    assert.strictEqual(getDefaultCareState('account'), 'unaware');
  });
  
  test('should reject invalid entity type', () => {
    assert.throws(
      () => getDefaultCareState('invalid'),
      /Invalid entity type/
    );
  });
});

// ============================================================================
// Transition Proposal Tests
// ============================================================================

describe('proposeTransition', () => {
  // Rule 1: unaware -> aware (first inbound)
  test('should propose unaware -> aware when first inbound received', () => {
    const proposal = proposeTransition({
      current_state: 'unaware',
      signals: {
        last_inbound_at: new Date()
      }
    });
    
    assert.strictEqual(proposal.from_state, 'unaware');
    assert.strictEqual(proposal.to_state, 'aware');
    assert.ok(proposal.reason.includes('First inbound'));
  });
  
  // Rule 2: aware -> engaged (bidirectional)
  test('should propose aware -> engaged when bidirectional exchange occurs', () => {
    const proposal = proposeTransition({
      current_state: 'aware',
      signals: {
        has_bidirectional: true
      }
    });
    
    assert.strictEqual(proposal.from_state, 'aware');
    assert.strictEqual(proposal.to_state, 'engaged');
    assert.ok(proposal.reason.includes('Bidirectional'));
  });
  
  // Rule 3: engaged -> evaluating (proposal sent)
  test('should propose engaged -> evaluating when proposal sent', () => {
    const proposal = proposeTransition({
      current_state: 'engaged',
      signals: {
        proposal_sent: true
      }
    });
    
    assert.strictEqual(proposal.from_state, 'engaged');
    assert.strictEqual(proposal.to_state, 'evaluating');
    assert.ok(proposal.reason.includes('proposal sent'));
  });
  
  // Rule 4: evaluating -> committed (commitment recorded)
  test('should propose evaluating -> committed when commitment recorded', () => {
    const proposal = proposeTransition({
      current_state: 'evaluating',
      signals: {
        commitment_recorded: true
      }
    });
    
    assert.strictEqual(proposal.from_state, 'evaluating');
    assert.strictEqual(proposal.to_state, 'committed');
    assert.ok(proposal.reason.includes('commitment'));
  });
  
  // Rule 5: committed -> active (contract/payment/meeting)
  test('should propose committed -> active when contract signed', () => {
    const proposal = proposeTransition({
      current_state: 'committed',
      signals: {
        contract_signed: true
      }
    });
    
    assert.strictEqual(proposal.from_state, 'committed');
    assert.strictEqual(proposal.to_state, 'active');
    assert.ok(proposal.reason.includes('contract signed'));
  });
  
  test('should propose committed -> active when payment received', () => {
    const proposal = proposeTransition({
      current_state: 'committed',
      signals: {
        payment_received: true
      }
    });
    
    assert.strictEqual(proposal.from_state, 'committed');
    assert.strictEqual(proposal.to_state, 'active');
    assert.ok(proposal.reason.includes('payment received'));
  });
  
  // Rule 6: any -> at_risk (moderate silence)
  test('should propose any -> at_risk when silence >= 14 days', () => {
    const lastInbound = new Date();
    lastInbound.setDate(lastInbound.getDate() - 15); // 15 days ago
    
    const proposal = proposeTransition({
      current_state: 'engaged',
      signals: {
        last_inbound_at: lastInbound,
        silence_days: 15
      }
    });
    
    assert.strictEqual(proposal.from_state, 'engaged');
    assert.strictEqual(proposal.to_state, 'at_risk');
    assert.ok(proposal.reason.includes('15 days'));
  });
  
  test('should NOT propose at_risk if already at_risk', () => {
    const proposal = proposeTransition({
      current_state: 'at_risk',
      signals: {
        silence_days: 15
      }
    });
    
    // Should propose dormant instead (rule 7)
    assert.ok(proposal === null || proposal.to_state === 'dormant');
  });
  
  // Rule 7: at_risk -> dormant (extended silence)
  test('should propose at_risk -> dormant when silence >= 30 days', () => {
    const proposal = proposeTransition({
      current_state: 'at_risk',
      signals: {
        silence_days: 35
      }
    });
    
    assert.strictEqual(proposal.from_state, 'at_risk');
    assert.strictEqual(proposal.to_state, 'dormant');
    assert.ok(proposal.reason.includes('35 days'));
  });
  
  // Rule 8: dormant -> reactivated (inbound after dormancy)
  test('should propose dormant -> reactivated when inbound received', () => {
    const proposal = proposeTransition({
      current_state: 'dormant',
      signals: {
        last_inbound_at: new Date()
      }
    });
    
    assert.strictEqual(proposal.from_state, 'dormant');
    assert.strictEqual(proposal.to_state, 'reactivated');
    assert.ok(proposal.reason.includes('re-engaged'));
  });
  
  // Rule 9: any -> lost (explicit rejection, highest priority)
  test('should propose any -> lost when explicit rejection detected', () => {
    const proposal = proposeTransition({
      current_state: 'engaged',
      signals: {
        explicit_rejection: true
      }
    });
    
    assert.strictEqual(proposal.from_state, 'engaged');
    assert.strictEqual(proposal.to_state, 'lost');
    assert.ok(proposal.reason.includes('rejection'));
  });
  
  test('explicit rejection should override other signals', () => {
    const proposal = proposeTransition({
      current_state: 'engaged',
      signals: {
        explicit_rejection: true,
        proposal_sent: true, // Would normally trigger evaluating
        has_bidirectional: true
      }
    });
    
    // Explicit rejection has priority
    assert.strictEqual(proposal.to_state, 'lost');
  });
  
  // No transition cases
  test('should return null when no signals trigger transition', () => {
    const proposal = proposeTransition({
      current_state: 'aware',
      signals: {} // No signals
    });
    
    assert.strictEqual(proposal, null);
  });
  
  test('should return null when already in terminal state with no reactivation', () => {
    const proposal = proposeTransition({
      current_state: 'lost',
      signals: {
        silence_days: 100
      }
    });
    
    assert.strictEqual(proposal, null);
  });
});

// ============================================================================
// Apply Transition Tests (with mock store)
// ============================================================================

// Mock store for testing (shared across test suites)
function createMockStore() {
    const stateRecords = {};
    const historyRecords = [];
    
    return {
      upsertCareState: async (ctx, patch) => {
        const key = `${ctx.tenant_id}:${ctx.entity_type}:${ctx.entity_id}`;
        stateRecords[key] = {
          id: 'mock-id',
          tenant_id: ctx.tenant_id,
          entity_type: ctx.entity_type,
          entity_id: ctx.entity_id,
          ...patch
        };
        return stateRecords[key];
      },
      
      appendCareHistory: async (ctx, event) => {
        const record = {
          id: 'mock-history-id',
          tenant_id: ctx.tenant_id,
          entity_type: ctx.entity_type,
          entity_id: ctx.entity_id,
          ...event,
          created_at: new Date()
        };
        historyRecords.push(record);
        return record;
      },
      
      getStateRecords: () => stateRecords,
      getHistoryRecords: () => historyRecords
    };
}

describe('applyTransition', () => {
  test('should apply transition and write state + history', async () => {
    const store = createMockStore();
    
    const ctx = {
      tenant_id: 'test-tenant-id',
      entity_type: 'lead',
      entity_id: 'test-lead-id'
    };
    
    const proposal = {
      from_state: 'unaware',
      to_state: 'aware',
      reason: 'First inbound received',
      meta: { test: true }
    };
    
    const result = await applyTransition({ ctx, proposal, store });
    
    // Check state was updated
    assert.strictEqual(result.care_state, 'aware');
    assert.strictEqual(result.tenant_id, ctx.tenant_id);
    assert.strictEqual(result.entity_type, ctx.entity_type);
    assert.strictEqual(result.entity_id, ctx.entity_id);
    
    // Check history was written
    const history = store.getHistoryRecords();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].from_state, 'unaware');
    assert.strictEqual(history[0].to_state, 'aware');
    assert.strictEqual(history[0].event_type, 'state_applied');
    assert.strictEqual(history[0].reason, 'First inbound received');
  });
  
  test('should reject transition without reason', async () => {
    const store = createMockStore();
    
    const ctx = {
      tenant_id: 'test-tenant-id',
      entity_type: 'lead',
      entity_id: 'test-lead-id'
    };
    
    const proposal = {
      from_state: 'unaware',
      to_state: 'aware',
      reason: '' // Empty reason
    };
    
    await assert.rejects(
      async () => applyTransition({ ctx, proposal, store }),
      /non-empty reason is required/
    );
  });
  
  test('should reject transition without to_state', async () => {
    const store = createMockStore();
    
    const ctx = {
      tenant_id: 'test-tenant-id',
      entity_type: 'lead',
      entity_id: 'test-lead-id'
    };
    
    const proposal = {
      from_state: 'unaware',
      reason: 'Test'
      // Missing to_state
    };
    
    await assert.rejects(
      async () => applyTransition({ ctx, proposal, store }),
      /to_state is required/
    );
  });
  
  test('should reject invalid context', async () => {
    const store = createMockStore();
    
    const ctx = {
      tenant_id: 'test-tenant-id'
      // Missing entity_type and entity_id
    };
    
    const proposal = {
      to_state: 'aware',
      reason: 'Test'
    };
    
    await assert.rejects(
      async () => applyTransition({ ctx, proposal, store }),
      /tenant_id, entity_type, and entity_id are required/
    );
  });
  
  test('should include actor info in history when provided', async () => {
    const store = createMockStore();
    
    const ctx = {
      tenant_id: 'test-tenant-id',
      entity_type: 'lead',
      entity_id: 'test-lead-id'
    };
    
    const proposal = {
      from_state: 'aware',
      to_state: 'engaged',
      reason: 'Manual override'
    };
    
    const actor = {
      type: 'user',
      id: 'user-123'
    };
    
    await applyTransition({ ctx, proposal, store, actor });
    
    const history = store.getHistoryRecords();
    assert.strictEqual(history[0].actor_type, 'user');
    assert.strictEqual(history[0].actor_id, 'user-123');
  });
  
  test('should default actor to system when not provided', async () => {
    const store = createMockStore();
    
    const ctx = {
      tenant_id: 'test-tenant-id',
      entity_type: 'lead',
      entity_id: 'test-lead-id'
    };
    
    const proposal = {
      from_state: 'aware',
      to_state: 'engaged',
      reason: 'Automated transition'
    };
    
    await applyTransition({ ctx, proposal, store });
    
    const history = store.getHistoryRecords();
    assert.strictEqual(history[0].actor_type, 'system');
  });
});

// ============================================================================
// Integration Test: Full State Progression
// ============================================================================

describe('Full state progression (integration)', () => {
  test('should progress through happy path: unaware -> active', async () => {
    const store = createMockStore();
    
    const ctx = {
      tenant_id: 'test-tenant-id',
      entity_type: 'lead',
      entity_id: 'test-lead-id'
    };
    
    // Start: unaware
    let currentState = 'unaware';
    
    // Step 1: unaware -> aware (first inbound)
    let proposal = proposeTransition({
      current_state: currentState,
      signals: { last_inbound_at: new Date() }
    });
    assert.strictEqual(proposal.to_state, 'aware');
    await applyTransition({ ctx, proposal, store });
    currentState = 'aware';
    
    // Step 2: aware -> engaged (bidirectional)
    proposal = proposeTransition({
      current_state: currentState,
      signals: { has_bidirectional: true }
    });
    assert.strictEqual(proposal.to_state, 'engaged');
    await applyTransition({ ctx, proposal, store });
    currentState = 'engaged';
    
    // Step 3: engaged -> evaluating (proposal sent)
    proposal = proposeTransition({
      current_state: currentState,
      signals: { proposal_sent: true }
    });
    assert.strictEqual(proposal.to_state, 'evaluating');
    await applyTransition({ ctx, proposal, store });
    currentState = 'evaluating';
    
    // Step 4: evaluating -> committed (commitment recorded)
    proposal = proposeTransition({
      current_state: currentState,
      signals: { commitment_recorded: true }
    });
    assert.strictEqual(proposal.to_state, 'committed');
    await applyTransition({ ctx, proposal, store });
    currentState = 'committed';
    
    // Step 5: committed -> active (contract signed)
    proposal = proposeTransition({
      current_state: currentState,
      signals: { contract_signed: true }
    });
    assert.strictEqual(proposal.to_state, 'active');
    await applyTransition({ ctx, proposal, store });
    currentState = 'active';
    
    // Verify history shows all 5 transitions
    const history = store.getHistoryRecords();
    assert.strictEqual(history.length, 5);
    assert.strictEqual(history[0].to_state, 'aware');
    assert.strictEqual(history[1].to_state, 'engaged');
    assert.strictEqual(history[2].to_state, 'evaluating');
    assert.strictEqual(history[3].to_state, 'committed');
    assert.strictEqual(history[4].to_state, 'active');
  });
});
