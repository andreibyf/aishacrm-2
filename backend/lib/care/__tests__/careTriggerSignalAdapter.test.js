/**
 * C.A.R.E. Trigger Signal Adapter Tests
 * 
 * Tests signal derivation from trigger context.
 * Part of PR6: Triggers Worker Shadow Wiring
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signalsFromTrigger, buildTriggerEscalationText } from '../careTriggerSignalAdapter.js';
import { TRIGGER_TYPES } from '../../aiTriggersWorker.js';

describe('careTriggerSignalAdapter', () => {
  describe('signalsFromTrigger', () => {
    it('should derive silence_days from stagnant lead', () => {
      const signals = signalsFromTrigger({
        trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
        context: {
          lead_name: 'John Doe',
          days_stagnant: 10,
          status: 'new',
        },
        record_type: 'lead',
        record_id: 'lead-123',
      });

      assert.equal(signals.silence_days, 10);
      assert.equal(signals.has_bidirectional, false);
      assert.equal(signals.meta.trigger_type, TRIGGER_TYPES.LEAD_STAGNANT);
      assert.equal(signals.meta.lead_name, 'John Doe');
    });

    it('should derive silence_days from deal decay', () => {
      const signals = signalsFromTrigger({
        trigger_type: TRIGGER_TYPES.DEAL_DECAY,
        context: {
          deal_name: 'Big Contract',
          days_inactive: 20,
          stage: 'negotiation',
          amount: 50000,
        },
        record_type: 'opportunity',
        record_id: 'opp-456',
      });

      assert.equal(signals.silence_days, 20);
      assert.equal(signals.has_bidirectional, false);
      assert.equal(signals.meta.deal_name, 'Big Contract');
      assert.equal(signals.meta.stage, 'negotiation');
      assert.equal(signals.meta.amount, 50000);
    });

    it('should set overdue meta for overdue activity', () => {
      const signals = signalsFromTrigger({
        trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
        context: {
          subject: 'Follow-up call',
          type: 'call',
          days_overdue: 3,
        },
        record_type: 'activity',
        record_id: 'act-789',
      });

      assert.equal(signals.meta.overdue, true);
      assert.equal(signals.meta.days_overdue, 3);
      assert.equal(signals.meta.activity_type, 'call');
      assert.equal(signals.meta.subject, 'Follow-up call');
    });

    it('should set positive engagement signals for hot opportunity', () => {
      const signals = signalsFromTrigger({
        trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
        context: {
          deal_name: 'Urgent Deal',
          probability: 85,
          days_to_close: 5,
          amount: 100000,
        },
        record_type: 'opportunity',
        record_id: 'opp-hot',
      });

      assert.equal(signals.has_bidirectional, true);
      assert.equal(signals.proposal_sent, true);
      assert.equal(signals.meta.probability, 85);
      assert.equal(signals.meta.days_to_close, 5);
    });

    it('should handle contact inactive trigger', () => {
      const signals = signalsFromTrigger({
        trigger_type: TRIGGER_TYPES.CONTACT_INACTIVE,
        context: {
          contact_name: 'Jane Smith',
          days_inactive: 45,
        },
        record_type: 'contact',
        record_id: 'contact-abc',
      });

      assert.equal(signals.silence_days, 45);
      assert.equal(signals.has_bidirectional, false);
      assert.equal(signals.meta.contact_name, 'Jane Smith');
    });

    it('should handle deal regression trigger', () => {
      const signals = signalsFromTrigger({
        trigger_type: TRIGGER_TYPES.DEAL_REGRESSION,
        context: {
          stage: 'proposal',
          previous_stage: 'negotiation',
        },
        record_type: 'opportunity',
        record_id: 'opp-regress',
      });

      assert.equal(signals.has_bidirectional, false);
      assert.equal(signals.meta.regression, true);
      assert.equal(signals.meta.stage, 'proposal');
      assert.equal(signals.meta.previous_stage, 'negotiation');
    });

    it('should handle account risk trigger', () => {
      const signals = signalsFromTrigger({
        trigger_type: TRIGGER_TYPES.ACCOUNT_RISK,
        context: {
          risk_level: 'high',
          risk_factors: ['payment_delay', 'low_engagement'],
          days_since_contact: 30,
        },
        record_type: 'account',
        record_id: 'account-risk',
      });

      assert.equal(signals.silence_days, 30);
      assert.equal(signals.meta.risk_level, 'high');
      assert.deepEqual(signals.meta.risk_factors, ['payment_delay', 'low_engagement']);
    });

    it('should handle followup needed trigger', () => {
      const signals = signalsFromTrigger({
        trigger_type: TRIGGER_TYPES.FOLLOWUP_NEEDED,
        context: {
          reason: 'post_meeting',
        },
        record_type: 'contact',
        record_id: 'contact-followup',
      });

      assert.equal(signals.has_bidirectional, true);
      assert.equal(signals.meta.followup_reason, 'post_meeting');
    });

    it('should handle unknown trigger type gracefully', () => {
      const signals = signalsFromTrigger({
        trigger_type: 'unknown_trigger',
        context: {},
        record_type: 'unknown',
        record_id: 'unknown-123',
      });

      assert.equal(signals.meta.unknown_trigger, true);
      assert.equal(signals.meta.trigger_type, 'unknown_trigger');
    });

    it('should use defaults when context is empty', () => {
      const signals = signalsFromTrigger({
        trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
        context: {},
        record_type: 'lead',
        record_id: 'lead-empty',
      });

      assert.equal(signals.silence_days, 7); // Default for stagnant lead
      assert.equal(signals.has_bidirectional, false);
    });
  });

  describe('buildTriggerEscalationText', () => {
    it('should build text for stagnant lead', () => {
      const text = buildTriggerEscalationText({
        trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
        context: {
          lead_name: 'John Doe',
          days_stagnant: 10,
          status: 'new',
        },
      });

      assert.ok(text.includes('lead stagnant'));
      assert.ok(text.includes('John Doe'));
      assert.ok(text.includes('10 days'));
      assert.ok(text.includes('Status: new'));
    });

    it('should build text for deal decay', () => {
      const text = buildTriggerEscalationText({
        trigger_type: TRIGGER_TYPES.DEAL_DECAY,
        context: {
          deal_name: 'Big Contract',
          days_inactive: 20,
          stage: 'negotiation',
          amount: 50000,
        },
      });

      assert.ok(text.includes('deal decay'));
      assert.ok(text.includes('Big Contract'));
      assert.ok(text.includes('20 days'));
      assert.ok(text.includes('negotiation'));
      assert.ok(text.includes('$50000'));
    });

    it('should build text for overdue activity', () => {
      const text = buildTriggerEscalationText({
        trigger_type: TRIGGER_TYPES.ACTIVITY_OVERDUE,
        context: {
          subject: 'Follow-up call',
          days_overdue: 3,
          type: 'call',
        },
      });

      assert.ok(text.includes('activity overdue'));
      assert.ok(text.includes('Follow-up call'));
      assert.ok(text.includes('3 days'));
      assert.ok(text.includes('Type: call'));
    });

    it('should build text for hot opportunity', () => {
      const text = buildTriggerEscalationText({
        trigger_type: TRIGGER_TYPES.OPPORTUNITY_HOT,
        context: {
          deal_name: 'Urgent Deal',
          probability: 85,
          days_to_close: 5,
          amount: 100000,
        },
      });

      assert.ok(text.includes('opportunity hot'));
      assert.ok(text.includes('Urgent Deal'));
      assert.ok(text.includes('85%'));
      assert.ok(text.includes('5 days'));
      assert.ok(text.includes('$100000'));
    });

    it('should handle empty context gracefully', () => {
      const text = buildTriggerEscalationText({
        trigger_type: TRIGGER_TYPES.LEAD_STAGNANT,
        context: {},
      });

      assert.ok(text.includes('lead stagnant'));
      // Empty context = only trigger type (no trailing period)
      assert.ok(text.length > 0);
    });
  });
});
