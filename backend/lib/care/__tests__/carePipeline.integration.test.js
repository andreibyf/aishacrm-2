/**
 * C.A.R.E. Full Pipeline Integration Test
 * 
 * Tests the complete flow: trigger context arrives → signal adapter converts →
 * state engine proposes → escalation detector checks → policy gate evaluates →
 * audit emitter logs → workflow trigger fires.
 * 
 * All external dependencies (Supabase, fetch, logger) are mocked.
 * 
 * Run with: node --test backend/lib/care/__tests__/carePipeline.integration.test.js
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---- Pure modules (no external deps) ----
import { proposeTransition, validateCareState, validateEntityType } from '../careStateEngine.js';
import { detectEscalation } from '../careEscalationDetector.js';
import { evaluateCarePolicy, CarePolicyGateResult } from '../carePolicyGate.js';
import { enrichSignals, calculateSilenceDays, SIGNAL_THRESHOLDS } from '../careSignals.js';
import { VALID_CARE_STATES, VALID_ENTITY_TYPES, VALID_SIGNAL_ENTITY_TYPES } from '../careTypes.js';
import { ESCALATION_REASONS, CONFIDENCE_LEVELS } from '../careEscalationTypes.js';
import { createAuditEvent, CareAuditEventType, CarePolicyGateResult as AuditGateResult } from '../careAuditTypes.js';

// ============================================================================
// Mock infrastructure
// ============================================================================

/** Mock state store — in-memory, mimics Supabase operations */
function createMockStore() {
  const states = new Map(); // key: "tenant:type:id" → state record
  const history = [];

  function key(ctx) {
    return `${ctx.tenant_id}:${ctx.entity_type}:${ctx.entity_id}`;
  }

  return {
    states,
    history,

    async getCareState(ctx) {
      return states.get(key(ctx)) || null;
    },

    async upsertCareState(ctx, patch) {
      const k = key(ctx);
      const existing = states.get(k) || {
        id: `mock-${Date.now()}`,
        tenant_id: ctx.tenant_id,
        entity_type: ctx.entity_type,
        entity_id: ctx.entity_id,
        hands_off_enabled: false,
        escalation_status: null,
        created_at: new Date().toISOString(),
      };
      const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
      states.set(k, updated);
      return updated;
    },

    async appendCareHistory(ctx, event) {
      const record = {
        id: `hist-${history.length}`,
        tenant_id: ctx.tenant_id,
        entity_type: ctx.entity_type,
        entity_id: ctx.entity_id,
        ...event,
        created_at: new Date().toISOString(),
      };
      history.push(record);
      return record;
    },
  };
}

/** Mock audit log — captures emitted events */
function createMockAuditLog() {
  const events = [];
  return {
    events,
    emit(event) {
      events.push({ ...event, ts: event.ts || new Date().toISOString() });
    },
  };
}

/** Mock workflow trigger — captures webhook calls */
function createMockWebhookClient() {
  const calls = [];
  let shouldFail = false;

  return {
    calls,
    setFail(fail) { shouldFail = fail; },

    async trigger({ url, payload }) {
      const record = { url, payload, ts: new Date().toISOString() };
      calls.push(record);
      if (shouldFail) {
        return { success: false, error: 'Mock failure' };
      }
      return { success: true };
    },
  };
}

// ============================================================================
// Pipeline helper — wires all components together
// ============================================================================

/**
 * Simulate the full CARE pipeline for a single trigger.
 * This mirrors what aiTriggersWorker.js does, but with injected deps.
 */
async function runPipeline({
  trigger_type,
  context,
  entity_type,
  entity_id,
  tenant_id,
  current_state, // if null, treated as new entity (unaware)
  store,
  auditLog,
  webhookClient,
  webhookUrl = 'http://localhost:3001/api/workflows/test/webhook',
  shadow_mode = false,
  state_write_enabled = true,
}) {
  const result = {
    signals: null,
    proposal: null,
    escalation: null,
    policyResult: null,
    auditEvents: [],
    webhookFired: false,
    finalState: current_state || 'unaware',
    error: null,
  };

  const ctx = { tenant_id, entity_type, entity_id };

  try {
    // Step 1: Build signals from trigger context (simplified — no adapter import needed)
    const rawSignals = { ...context };
    result.signals = enrichSignals(rawSignals);

    // Step 2: Determine current state
    const effectiveState = current_state || 'unaware';

    // Step 3: Propose state transition
    result.proposal = proposeTransition({
      current_state: effectiveState,
      signals: result.signals,
    });

    // Step 4: Run escalation detection on any available text
    const escalationText = context.text || context.reason || context.subject || '';
    result.escalation = detectEscalation({
      text: escalationText,
      sentiment: context.sentiment,
      action_origin: 'care_autonomous',
    });

    // Step 5: Policy gate (only if we have a proposed action)
    if (result.proposal || result.escalation.escalate) {
      result.policyResult = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'workflow',
        text: escalationText,
      });
    }

    // Step 6: Audit — always log what happened
    const auditEvent = createAuditEvent({
      tenant_id,
      entity_type,
      entity_id,
      event_type: result.escalation.escalate
        ? CareAuditEventType.ESCALATION_DETECTED
        : result.proposal
          ? CareAuditEventType.STATE_PROPOSED
          : CareAuditEventType.ACTION_SKIPPED,
      action_origin: 'care_autonomous',
      reason: result.proposal?.reason || result.escalation?.reasons?.join(', ') || 'No action required',
      policy_gate_result: result.policyResult?.policy_gate_result || AuditGateResult.ALLOWED,
      meta: {
        trigger_type,
        proposal: result.proposal,
        escalation: result.escalation,
        shadow_mode,
      },
    });
    auditLog.emit(auditEvent);
    result.auditEvents.push(auditEvent);

    // Step 7: Apply state transition (if enabled and not shadow)
    if (result.proposal && state_write_enabled && !shadow_mode) {
      const { applyTransition } = await import('../careStateEngine.js');
      await applyTransition({ ctx, proposal: result.proposal, store });
      result.finalState = result.proposal.to_state;

      // Audit the applied state
      const appliedEvent = createAuditEvent({
        tenant_id,
        entity_type,
        entity_id,
        event_type: CareAuditEventType.STATE_APPLIED,
        action_origin: 'care_autonomous',
        reason: result.proposal.reason,
        policy_gate_result: AuditGateResult.ALLOWED,
        meta: { from: result.proposal.from_state, to: result.proposal.to_state },
      });
      auditLog.emit(appliedEvent);
      result.auditEvents.push(appliedEvent);
    }

    // Step 8: Fire webhook (if enabled and policy allows)
    if (!shadow_mode && webhookUrl) {
      const gateAllows = !result.policyResult || result.policyResult.policy_gate_result !== CarePolicyGateResult.BLOCKED;
      if (gateAllows && (result.proposal || result.escalation.escalate)) {
        const webhookResult = await webhookClient.trigger({
          url: webhookUrl,
          payload: {
            event_id: `trigger-${Date.now()}-test`,
            type: result.escalation.escalate ? 'care.escalation_detected' : 'care.trigger_detected',
            ts: new Date().toISOString(),
            tenant_id,
            entity_type,
            entity_id,
            trigger_type,
            care_state: result.finalState,
            previous_state: result.proposal?.from_state || null,
            escalation_status: result.escalation.escalate ? 'open' : null,
            reason: result.proposal?.reason || result.escalation.reasons?.join(', '),
            meta: context,
          },
        });
        result.webhookFired = webhookResult.success;
      }
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

// ============================================================================
// Tests
// ============================================================================

describe('C.A.R.E. Full Pipeline Integration', () => {
  let store, auditLog, webhookClient;

  beforeEach(() => {
    store = createMockStore();
    auditLog = createMockAuditLog();
    webhookClient = createMockWebhookClient();
  });

  // --------------------------------------------------------------------------
  // Happy path: lead stagnant → at_risk
  // --------------------------------------------------------------------------
  describe('Lead stagnant trigger (happy path)', () => {
    test('full pipeline: stagnant lead transitions to at_risk, fires webhook', async () => {
      const result = await runPipeline({
        trigger_type: 'lead_stagnant',
        context: { silence_days: 20, lead_name: 'Jane Doe', status: 'new' },
        entity_type: 'lead',
        entity_id: 'lead-001',
        tenant_id: 'tenant-001',
        current_state: 'aware',
        store,
        auditLog,
        webhookClient,
      });

      // State transition proposed and applied
      assert.ok(result.proposal, 'Should propose a transition');
      assert.equal(result.proposal.to_state, 'at_risk');
      assert.equal(result.finalState, 'at_risk');

      // State persisted
      const persisted = await store.getCareState({
        tenant_id: 'tenant-001',
        entity_type: 'lead',
        entity_id: 'lead-001',
      });
      assert.equal(persisted.care_state, 'at_risk');

      // History recorded
      assert.ok(store.history.length >= 1, 'History should have at least 1 entry');
      assert.equal(store.history[0].to_state, 'at_risk');

      // Audit events emitted
      assert.ok(auditLog.events.length >= 2, 'Should have proposal + applied audit events');
      assert.equal(auditLog.events[0].event_type, CareAuditEventType.STATE_PROPOSED);
      assert.equal(auditLog.events[1].event_type, CareAuditEventType.STATE_APPLIED);

      // Webhook fired
      assert.equal(result.webhookFired, true);
      assert.equal(webhookClient.calls.length, 1);
      assert.equal(webhookClient.calls[0].payload.type, 'care.trigger_detected');
      assert.equal(webhookClient.calls[0].payload.care_state, 'at_risk');
    });
  });

  // --------------------------------------------------------------------------
  // Escalation path: compliance phrase in text
  // --------------------------------------------------------------------------
  describe('Escalation detection in pipeline', () => {
    test('compliance phrase triggers escalation, webhook fires as escalation event', async () => {
      const result = await runPipeline({
        trigger_type: 'activity_overdue',
        context: {
          silence_days: 5,
          subject: 'Review HIPAA compliance docs',
          text: 'We need to discuss HIPAA compliance requirements',
        },
        entity_type: 'contact',
        entity_id: 'contact-001',
        tenant_id: 'tenant-001',
        current_state: 'engaged',
        store,
        auditLog,
        webhookClient,
      });

      // Escalation detected
      assert.ok(result.escalation.escalate, 'Should flag escalation');
      assert.ok(result.escalation.reasons.includes(ESCALATION_REASONS.COMPLIANCE_SENSITIVE));
      assert.equal(result.escalation.confidence, CONFIDENCE_LEVELS.HIGH);

      // Webhook fired as escalation
      assert.equal(result.webhookFired, true);
      assert.equal(webhookClient.calls[0].payload.type, 'care.escalation_detected');
      assert.equal(webhookClient.calls[0].payload.escalation_status, 'open');

      // Audit logged as escalation
      assert.equal(auditLog.events[0].event_type, CareAuditEventType.ESCALATION_DETECTED);
    });
  });

  // --------------------------------------------------------------------------
  // Shadow mode: everything runs but no writes or webhooks
  // --------------------------------------------------------------------------
  describe('Shadow mode', () => {
    test('shadow mode logs but does not write state or fire webhook', async () => {
      const result = await runPipeline({
        trigger_type: 'lead_stagnant',
        context: { silence_days: 20 },
        entity_type: 'lead',
        entity_id: 'lead-002',
        tenant_id: 'tenant-001',
        current_state: 'aware',
        store,
        auditLog,
        webhookClient,
        shadow_mode: true,
      });

      // Proposal generated
      assert.ok(result.proposal, 'Should still propose');
      assert.equal(result.proposal.to_state, 'at_risk');

      // But state NOT persisted
      const persisted = await store.getCareState({
        tenant_id: 'tenant-001',
        entity_type: 'lead',
        entity_id: 'lead-002',
      });
      assert.equal(persisted, null, 'State should NOT be written in shadow mode');

      // Webhook NOT fired
      assert.equal(result.webhookFired, false);
      assert.equal(webhookClient.calls.length, 0);

      // Audit still logged
      assert.ok(auditLog.events.length >= 1, 'Audit should still be logged in shadow mode');
      assert.equal(auditLog.events[0].meta.shadow_mode, true);
    });
  });

  // --------------------------------------------------------------------------
  // Policy gate blocks prohibited content
  // --------------------------------------------------------------------------
  describe('Policy gate blocking', () => {
    test('policy gate blocks trigger with legal threat text, no webhook fires', async () => {
      const result = await runPipeline({
        trigger_type: 'deal_decay',
        context: {
          silence_days: 16,
          text: 'I will pursue a lawsuit against your company',
        },
        entity_type: 'opportunity',
        entity_id: 'opp-001',
        tenant_id: 'tenant-001',
        current_state: 'evaluating',
        store,
        auditLog,
        webhookClient,
      });

      // Policy gate blocked
      assert.ok(result.policyResult, 'Policy should have been evaluated');
      assert.equal(result.policyResult.policy_gate_result, CarePolicyGateResult.BLOCKED);

      // Webhook NOT fired (blocked)
      assert.equal(result.webhookFired, false);
    });
  });

  // --------------------------------------------------------------------------
  // Full lifecycle: unaware → aware → engaged → at_risk → dormant → reactivated → engaged
  // --------------------------------------------------------------------------
  describe('Full lifecycle progression', () => {
    test('entity progresses through multiple states across pipeline runs', async () => {
      const ctx = {
        entity_type: 'contact',
        entity_id: 'contact-lifecycle',
        tenant_id: 'tenant-001',
      };

      // Step 1: unaware → aware (first inbound)
      let result = await runPipeline({
        ...ctx,
        trigger_type: 'followup_needed',
        context: { last_inbound_at: new Date() },
        current_state: 'unaware',
        store, auditLog, webhookClient,
      });
      assert.equal(result.finalState, 'aware');

      // Step 2: aware → engaged (bidirectional)
      result = await runPipeline({
        ...ctx,
        trigger_type: 'followup_needed',
        context: { has_bidirectional: true, last_inbound_at: new Date() },
        current_state: 'aware',
        store, auditLog, webhookClient,
      });
      assert.equal(result.finalState, 'engaged');

      // Step 3: engaged → at_risk (silence)
      result = await runPipeline({
        ...ctx,
        trigger_type: 'contact_inactive',
        context: { silence_days: 20 },
        current_state: 'engaged',
        store, auditLog, webhookClient,
      });
      assert.equal(result.finalState, 'at_risk');

      // Step 4: at_risk → dormant (extended silence)
      result = await runPipeline({
        ...ctx,
        trigger_type: 'contact_inactive',
        context: { silence_days: 35 },
        current_state: 'at_risk',
        store, auditLog, webhookClient,
      });
      assert.equal(result.finalState, 'dormant');

      // Step 5: dormant → reactivated (new inbound)
      result = await runPipeline({
        ...ctx,
        trigger_type: 'followup_needed',
        context: { last_inbound_at: new Date() },
        current_state: 'dormant',
        store, auditLog, webhookClient,
      });
      assert.equal(result.finalState, 'reactivated');

      // Step 6: reactivated → engaged (bidirectional, fix #1)
      result = await runPipeline({
        ...ctx,
        trigger_type: 'followup_needed',
        context: { has_bidirectional: true, last_inbound_at: new Date() },
        current_state: 'reactivated',
        store, auditLog, webhookClient,
      });
      assert.equal(result.finalState, 'engaged');

      // Verify cumulative audit trail
      assert.ok(auditLog.events.length >= 12, `Should have many audit events, got ${auditLog.events.length}`);

      // Verify cumulative webhook calls
      assert.ok(webhookClient.calls.length >= 6, `Should have fired webhooks for each transition, got ${webhookClient.calls.length}`);
    });
  });

  // --------------------------------------------------------------------------
  // Fix 9: enrichSignals overrides stale silence_days
  // --------------------------------------------------------------------------
  describe('Composite signal scoring (fix 9)', () => {
    test('fresh inbound overrides stale silence_days, prevents false at_risk', async () => {
      // Scenario: trigger worker computed silence_days=20 from DB,
      // but last_inbound_at is only 2 days ago (inbound arrived after query)
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      const result = await runPipeline({
        trigger_type: 'lead_stagnant',
        context: {
          silence_days: 20, // stale
          last_inbound_at: twoDaysAgo, // fresh — should override
        },
        entity_type: 'lead',
        entity_id: 'lead-003',
        tenant_id: 'tenant-001',
        current_state: 'aware',
        store,
        auditLog,
        webhookClient,
      });

      // enrichSignals should have corrected silence_days to ~2
      assert.ok(result.signals.silence_days <= 3, `Silence should be ~2 days, got ${result.signals.silence_days}`);
      assert.equal(result.signals.meta?.silence_days_overridden, true, 'Should flag override');

      // No at_risk transition (silence is only ~2 days, threshold is 14)
      assert.equal(result.proposal, null, 'Should NOT propose at_risk with only 2 days silence');
      assert.equal(result.finalState, 'aware', 'Should stay in aware');
    });

    test('enrichSignals adds engagement_score', () => {
      const enriched = enrichSignals({
        has_bidirectional: true,
        proposal_sent: true,
        silence_days: 3,
      });
      
      assert.ok(typeof enriched.engagement_score === 'number', 'Should have engagement_score');
      assert.ok(enriched.engagement_score > 0, 'Active engagement should be positive');
    });

    test('negative signals reduce engagement_score', () => {
      const enriched = enrichSignals({
        explicit_rejection: true,
        negative_sentiment: true,
        silence_days: 35,
      });
      
      assert.ok(enriched.engagement_score < 0, 'Rejection + silence should be negative');
    });
  });

  // --------------------------------------------------------------------------
  // Fix 2 validation: entity types
  // --------------------------------------------------------------------------
  describe('Entity type validation (fix 2)', () => {
    test('VALID_ENTITY_TYPES excludes activity (signal-only)', () => {
      assert.ok(!VALID_ENTITY_TYPES.has('activity'), 'activity should not be in state entity types');
      assert.ok(VALID_ENTITY_TYPES.has('opportunity'), 'opportunity should be in state entity types');
    });

    test('VALID_SIGNAL_ENTITY_TYPES includes all five', () => {
      assert.ok(VALID_SIGNAL_ENTITY_TYPES.has('activity'), 'activity should be in signal types');
      assert.ok(VALID_SIGNAL_ENTITY_TYPES.has('opportunity'));
      assert.ok(VALID_SIGNAL_ENTITY_TYPES.has('lead'));
      assert.ok(VALID_SIGNAL_ENTITY_TYPES.has('contact'));
      assert.ok(VALID_SIGNAL_ENTITY_TYPES.has('account'));
    });
  });

  // --------------------------------------------------------------------------
  // No-op case: no transition, no escalation
  // --------------------------------------------------------------------------
  describe('No-op pipeline run', () => {
    test('benign trigger with no transition needed produces audit but no webhook', async () => {
      const result = await runPipeline({
        trigger_type: 'followup_needed',
        context: { silence_days: 2 }, // well under threshold
        entity_type: 'contact',
        entity_id: 'contact-noop',
        tenant_id: 'tenant-001',
        current_state: 'engaged',
        store,
        auditLog,
        webhookClient,
      });

      assert.equal(result.proposal, null, 'No transition proposed');
      assert.equal(result.escalation.escalate, false, 'No escalation');
      assert.equal(result.webhookFired, false, 'No webhook');
      assert.equal(result.finalState, 'engaged', 'State unchanged');

      // Audit still logged (action_skipped)
      assert.ok(auditLog.events.length >= 1);
      assert.equal(auditLog.events[0].event_type, CareAuditEventType.ACTION_SKIPPED);
    });
  });

  // --------------------------------------------------------------------------
  // Webhook failure handling
  // --------------------------------------------------------------------------
  describe('Webhook failure resilience', () => {
    test('pipeline completes even when webhook fails', async () => {
      webhookClient.setFail(true);

      const result = await runPipeline({
        trigger_type: 'lead_stagnant',
        context: { silence_days: 20 },
        entity_type: 'lead',
        entity_id: 'lead-fail',
        tenant_id: 'tenant-001',
        current_state: 'aware',
        store,
        auditLog,
        webhookClient,
      });

      // State still applied
      assert.equal(result.finalState, 'at_risk');

      // Webhook attempted but failed
      assert.equal(result.webhookFired, false);
      assert.equal(webhookClient.calls.length, 1, 'Should have attempted');

      // Audit still logged
      assert.ok(auditLog.events.length >= 2);
    });
  });
});
