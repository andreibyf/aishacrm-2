/**
 * Tests for C.A.R.E. Policy Gate
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCarePolicy, CarePolicyGateResult } from './carePolicyGate.js';

describe('carePolicyGate', () => {
  describe('evaluateCarePolicy', () => {
    // Basic validation
    it('should block when action_origin is missing', () => {
      const result = evaluateCarePolicy({
        proposed_action_type: 'message',
        text: 'Hello'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.BLOCKED);
      assert.equal(result.escalate, false);
      assert.deepEqual(result.reasons, ['Missing action_origin']);
    });

    it('should block when proposed_action_type is missing', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        text: 'Hello'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.BLOCKED);
      assert.equal(result.escalate, false);
      assert.deepEqual(result.reasons, ['Missing proposed_action_type']);
    });

    // Hard prohibitions (all origins)
    it('should block impersonation attempts', () => {
      const result = evaluateCarePolicy({
        action_origin: 'user_directed',
        proposed_action_type: 'message',
        text: 'Best regards, John Smith'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.BLOCKED);
      assert.equal(result.escalate, false);
      assert.ok(result.reasons[0].includes('impersonation'));
    });

    it('should block binding commitments', () => {
      const result = evaluateCarePolicy({
        action_origin: 'user_directed',
        proposed_action_type: 'message',
        text: 'I guarantee that we will deliver by Friday'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.BLOCKED);
      assert.equal(result.escalate, false);
      assert.ok(result.reasons[0].includes('Binding commitment'));
    });

    it('should block pricing negotiations', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'message',
        text: 'Special discount of $500 just for you'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.BLOCKED);
      assert.equal(result.escalate, false);
      assert.ok(result.reasons[0].includes('Pricing negotiation'));
    });

    it('should block GDPR deletion requests', () => {
      const result = evaluateCarePolicy({
        action_origin: 'user_directed',
        proposed_action_type: 'workflow',
        text: 'Delete all your data from our systems'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.BLOCKED);
      assert.equal(result.escalate, false);
      assert.ok(result.reasons[0].includes('GDPR'));
    });

    // Autonomous-specific prohibitions
    it('should escalate autonomous commitments', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'message',
        text: 'We will definitely have this ready by tomorrow'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ESCALATED);
      assert.equal(result.escalate, true);
      assert.ok(result.reasons[0].includes('commitment'));
    });

    it('should escalate autonomous messages (not low-risk type)', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'message',
        text: 'Just following up on our conversation'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ESCALATED);
      assert.equal(result.escalate, true);
      assert.ok(result.reasons[0].includes('human approval'));
    });

    it('should allow autonomous low-risk actions (note)', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'note',
        text: 'Customer expressed interest in product demo'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ALLOWED);
      assert.equal(result.escalate, false);
      assert.ok(result.reasons[0].includes('approved'));
    });

    it('should allow autonomous low-risk actions (task)', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'task',
        text: 'Follow up with customer next week'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ALLOWED);
      assert.equal(result.escalate, false);
    });

    it('should allow autonomous low-risk actions (follow_up)', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'follow_up',
        text: 'Schedule callback in 3 days'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ALLOWED);
      assert.equal(result.escalate, false);
    });

    // User-directed actions
    it('should allow user-directed messages without risk signals', () => {
      const result = evaluateCarePolicy({
        action_origin: 'user_directed',
        proposed_action_type: 'message',
        text: 'Thank you for your interest in our product'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ALLOWED);
      assert.equal(result.escalate, false);
    });

    it('should escalate user-directed actions with legal references', () => {
      const result = evaluateCarePolicy({
        action_origin: 'user_directed',
        proposed_action_type: 'message',
        text: 'Please review the contract terms and conditions'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ESCALATED);
      assert.equal(result.escalate, true);
      assert.ok(result.reasons[0].includes('Legal document'));
    });

    it('should escalate user-directed actions with large amounts', () => {
      const result = evaluateCarePolicy({
        action_origin: 'user_directed',
        proposed_action_type: 'message',
        text: 'The total cost is $50,000 for this project'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ESCALATED);
      assert.equal(result.escalate, true);
      assert.ok(result.reasons[0].includes('financial amount'));
    });

    // Edge cases
    it('should handle empty text', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'note',
        text: ''
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ALLOWED);
    });

    it('should handle missing text', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'task'
      });
      
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ALLOWED);
    });

    it('should allow AI/Care signatures (not impersonation)', () => {
      const result = evaluateCarePolicy({
        action_origin: 'care_autonomous',
        proposed_action_type: 'note',
        text: 'Best regards, AI Care System'
      });
      
      // Should NOT trigger impersonation (regex excludes ai|care|system)
      assert.equal(result.policy_gate_result, CarePolicyGateResult.ALLOWED);
    });
  });
});
