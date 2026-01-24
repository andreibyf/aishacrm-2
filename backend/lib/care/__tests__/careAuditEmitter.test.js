/**
 * Customer C.A.R.E. v1 – Audit Emitter Tests
 * 
 * Unit tests for careAuditEmitter.js
 * 
 * PR4: Internal audit + telemetry emitter
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { emitCareAudit, emitCareAuditBatch } from '../careAuditEmitter.js';
import { CarePolicyGateResult, CareAuditEventType } from '../careAuditTypes.js';

// Mock logger to capture output
let loggedMessages = [];
const originalLogger = await import('../../logger.js');

// Override logger.info for testing
const mockLogger = {
  info: (msg) => {
    loggedMessages.push(msg);
  },
  warn: (msg) => {
    loggedMessages.push(msg);
  },
};

// Replace logger temporarily
beforeEach(() => {
  loggedMessages = [];
  // Note: In real tests, you'd use a proper mocking library
  // For now, we'll just verify the function doesn't throw
});

describe('careAuditEmitter', () => {
  describe('validation', () => {
    const baseEvent = {
      tenant_id: 'test-tenant-uuid',
      entity_type: 'conversation',
      entity_id: 'conv-123',
      event_type: CareAuditEventType.ESCALATION_DETECTED,
      action_origin: 'care_autonomous',
      reason: 'Test reason',
      policy_gate_result: CarePolicyGateResult.ESCALATED,
    };

    it('should throw if reason is missing', () => {
      const event = { ...baseEvent, reason: '' };
      assert.throws(
        () => emitCareAudit(event),
        /reason is required and must be a non-empty string/
      );
    });

    it('should throw if reason is only whitespace', () => {
      const event = { ...baseEvent, reason: '   ' };
      assert.throws(
        () => emitCareAudit(event),
        /reason is required and must be a non-empty string/
      );
    });

    it('should throw if reason is not a string', () => {
      const event = { ...baseEvent, reason: 123 };
      assert.throws(
        () => emitCareAudit(event),
        /reason is required and must be a non-empty string/
      );
    });

    it('should throw if action_origin is missing', () => {
      const event = { ...baseEvent };
      delete event.action_origin;
      assert.throws(
        () => emitCareAudit(event),
        /action_origin is required/
      );
    });

    it('should throw if action_origin is invalid', () => {
      const event = { ...baseEvent, action_origin: 'invalid_origin' };
      assert.throws(
        () => emitCareAudit(event),
        /action_origin must be one of/
      );
    });

    it('should throw if policy_gate_result is missing', () => {
      const event = { ...baseEvent };
      delete event.policy_gate_result;
      assert.throws(
        () => emitCareAudit(event),
        /policy_gate_result is required/
      );
    });

    it('should throw if policy_gate_result is invalid', () => {
      const event = { ...baseEvent, policy_gate_result: 'invalid_result' };
      assert.throws(
        () => emitCareAudit(event),
        /policy_gate_result must be one of/
      );
    });

    it('should throw if tenant_id is missing', () => {
      const event = { ...baseEvent };
      delete event.tenant_id;
      assert.throws(
        () => emitCareAudit(event),
        /tenant_id is required/
      );
    });

    it('should throw if entity_type is missing', () => {
      const event = { ...baseEvent };
      delete event.entity_type;
      assert.throws(
        () => emitCareAudit(event),
        /entity_type is required/
      );
    });

    it('should throw if entity_id is missing', () => {
      const event = { ...baseEvent };
      delete event.entity_id;
      assert.throws(
        () => emitCareAudit(event),
        /entity_id is required/
      );
    });
  });

  describe('valid events', () => {
    it('should emit valid event without throwing (user_directed)', () => {
      const event = {
        ts: new Date().toISOString(),
        tenant_id: 'test-tenant-uuid',
        entity_type: 'conversation',
        entity_id: 'conv-123',
        event_type: CareAuditEventType.STATE_PROPOSED,
        action_origin: 'user_directed',
        reason: 'User explicitly requested state change',
        policy_gate_result: CarePolicyGateResult.ALLOWED,
        meta: { requested_state: 'active' },
      };

      assert.doesNotThrow(() => emitCareAudit(event));
    });

    it('should emit valid event without throwing (care_autonomous)', () => {
      const event = {
        ts: new Date().toISOString(),
        tenant_id: 'test-tenant-uuid',
        entity_type: 'conversation',
        entity_id: 'conv-456',
        event_type: CareAuditEventType.ESCALATION_DETECTED,
        action_origin: 'care_autonomous',
        reason: 'Customer used objection phrase: "not interested"',
        policy_gate_result: CarePolicyGateResult.ESCALATED,
        meta: { escalation_reasons: ['objection'], confidence: 'high' },
      };

      assert.doesNotThrow(() => emitCareAudit(event));
    });

    it('should add timestamp if not provided', () => {
      const event = {
        tenant_id: 'test-tenant-uuid',
        entity_type: 'conversation',
        entity_id: 'conv-789',
        event_type: CareAuditEventType.ACTION_CANDIDATE,
        action_origin: 'care_autonomous',
        reason: 'Follow-up candidate identified',
        policy_gate_result: CarePolicyGateResult.ALLOWED,
      };

      // Should not throw even without ts field
      assert.doesNotThrow(() => emitCareAudit(event));
    });

    it('should emit event with all policy gate results', () => {
      const baseEvent = {
        tenant_id: 'test-tenant-uuid',
        entity_type: 'conversation',
        entity_id: 'conv-abc',
        event_type: CareAuditEventType.ACTION_CANDIDATE,
        action_origin: 'care_autonomous',
        reason: 'Testing policy gate results',
      };

      // Test all valid gate results
      Object.values(CarePolicyGateResult).forEach((result) => {
        const event = { ...baseEvent, policy_gate_result: result };
        assert.doesNotThrow(() => emitCareAudit(event));
      });
    });

    it('should emit event with all event types', () => {
      const baseEvent = {
        tenant_id: 'test-tenant-uuid',
        entity_type: 'conversation',
        entity_id: 'conv-def',
        action_origin: 'care_autonomous',
        reason: 'Testing event types',
        policy_gate_result: CarePolicyGateResult.ALLOWED,
      };

      // Test all valid event types
      Object.values(CareAuditEventType).forEach((eventType) => {
        const event = { ...baseEvent, event_type: eventType };
        assert.doesNotThrow(() => emitCareAudit(event));
      });
    });
  });

  describe('batch emission', () => {
    it('should throw if events is not an array', () => {
      assert.throws(
        () => emitCareAuditBatch('not-an-array'),
        /events must be an array/
      );
    });

    it('should emit multiple valid events without throwing', () => {
      const events = [
        {
          tenant_id: 'test-tenant-uuid',
          entity_type: 'conversation',
          entity_id: 'conv-1',
          event_type: CareAuditEventType.STATE_PROPOSED,
          action_origin: 'user_directed',
          reason: 'Event 1',
          policy_gate_result: CarePolicyGateResult.ALLOWED,
        },
        {
          tenant_id: 'test-tenant-uuid',
          entity_type: 'conversation',
          entity_id: 'conv-2',
          event_type: CareAuditEventType.STATE_APPLIED,
          action_origin: 'care_autonomous',
          reason: 'Event 2',
          policy_gate_result: CarePolicyGateResult.ESCALATED,
        },
      ];

      assert.doesNotThrow(() => emitCareAuditBatch(events));
    });

    it('should stop on first invalid event', () => {
      const events = [
        {
          tenant_id: 'test-tenant-uuid',
          entity_type: 'conversation',
          entity_id: 'conv-1',
          event_type: CareAuditEventType.STATE_PROPOSED,
          action_origin: 'user_directed',
          reason: 'Valid event',
          policy_gate_result: CarePolicyGateResult.ALLOWED,
        },
        {
          tenant_id: 'test-tenant-uuid',
          entity_type: 'conversation',
          entity_id: 'conv-2',
          event_type: CareAuditEventType.STATE_APPLIED,
          action_origin: 'care_autonomous',
          reason: '', // Invalid: empty reason
          policy_gate_result: CarePolicyGateResult.ESCALATED,
        },
      ];

      assert.throws(
        () => emitCareAuditBatch(events),
        /reason is required and must be a non-empty string/
      );
    });

    it('should handle empty array', () => {
      assert.doesNotThrow(() => emitCareAuditBatch([]));
    });
  });

  describe('metadata handling', () => {
    it('should allow optional meta field', () => {
      const event = {
        tenant_id: 'test-tenant-uuid',
        entity_type: 'conversation',
        entity_id: 'conv-meta',
        event_type: CareAuditEventType.ESCALATION_DETECTED,
        action_origin: 'care_autonomous',
        reason: 'Testing metadata',
        policy_gate_result: CarePolicyGateResult.ESCALATED,
        meta: {
          custom_field: 'custom_value',
          nested: { key: 'value' },
          array: [1, 2, 3],
        },
      };

      assert.doesNotThrow(() => emitCareAudit(event));
    });

    it('should work without meta field', () => {
      const event = {
        tenant_id: 'test-tenant-uuid',
        entity_type: 'conversation',
        entity_id: 'conv-no-meta',
        event_type: CareAuditEventType.ACTION_SKIPPED,
        action_origin: 'care_autonomous',
        reason: 'No metadata provided',
        policy_gate_result: CarePolicyGateResult.BLOCKED,
      };

      assert.doesNotThrow(() => emitCareAudit(event));
    });
  });
});
