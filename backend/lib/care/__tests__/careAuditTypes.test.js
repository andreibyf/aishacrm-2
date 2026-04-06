import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CarePolicyGateResult, CareAuditEventType, createAuditEvent } from '../careAuditTypes.js';

describe('careAuditTypes', () => {
  it('exports canonical gate results and audit event types', () => {
    assert.equal(CarePolicyGateResult.ALLOWED, 'allowed');
    assert.equal(CarePolicyGateResult.ESCALATED, 'escalated');
    assert.equal(CarePolicyGateResult.BLOCKED, 'blocked');

    assert.equal(CareAuditEventType.STATE_PROPOSED, 'state_proposed');
    assert.equal(CareAuditEventType.ACTION_OUTCOME, 'action_outcome');
  });

  it('creates structured audit events with timestamp and payload fields', () => {
    const event = createAuditEvent({
      tenant_id: 'tenant-1',
      entity_type: 'lead',
      entity_id: 'lead-1',
      event_type: CareAuditEventType.STATE_APPLIED,
      action_origin: 'care_autonomous',
      reason: 'state advanced after signal',
      policy_gate_result: CarePolicyGateResult.ALLOWED,
      meta: { confidence: 'high' },
    });

    assert.ok(typeof event.ts === 'string');
    assert.equal(event.tenant_id, 'tenant-1');
    assert.equal(event.entity_type, 'lead');
    assert.equal(event.entity_id, 'lead-1');
    assert.equal(event.event_type, CareAuditEventType.STATE_APPLIED);
    assert.equal(event.action_origin, 'care_autonomous');
    assert.equal(event.reason, 'state advanced after signal');
    assert.equal(event.policy_gate_result, CarePolicyGateResult.ALLOWED);
    assert.deepEqual(event.meta, { confidence: 'high' });
  });
});
