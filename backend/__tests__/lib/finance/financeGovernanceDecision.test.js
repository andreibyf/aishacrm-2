import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import evaluateFinanceGovernance from '../../../lib/finance/financeGovernanceDecision.js';

// ── AI_BLOCKED_COMMANDS — hard block for ai_agent actors ──────────────────────

describe('AI_BLOCKED_COMMANDS — hard block for ai_agent', () => {
  const blockedCommands = [
    'ApproveFinanceActionCommand',
    'RejectFinanceActionCommand',
    'PostJournalEntryCommand',
    'RefundCommand',
    'IssueRefundCommand',
    'VoidInvoiceCommand',
    'VoidJournalEntryCommand',
  ];

  for (const cmd of blockedCommands) {
    test(`ai_agent is hard-blocked for ${cmd}`, () => {
      const result = evaluateFinanceGovernance({ commandType: cmd, actorType: 'ai_agent' });
      assert.equal(result.allowed, false, `${cmd} must be blocked for ai_agent`);
      assert.ok(result.blocked_actions.includes(cmd), `${cmd} must appear in blocked_actions`);
      assert.equal(result.risk_level, 'critical');
      assert.equal(result.approval_policy, 'finance.ai.no_money_movement');
    });

    test(`human actor is NOT hard-blocked for ${cmd}`, () => {
      const result = evaluateFinanceGovernance({ commandType: cmd, actorType: 'human' });
      // Human actors reach the default fallback — allowed but requires approval
      assert.equal(result.allowed, true, `${cmd} must not be hard-blocked for human`);
    });
  }
});

// ── T-6: QueueAccountingAdapterSyncCommand — ai_agent requires approval ───────

describe('T-6: QueueAccountingAdapterSyncCommand actor policy', () => {
  test('T-6: ai_agent actor requires approval for adapter sync', () => {
    const result = evaluateFinanceGovernance({
      commandType: 'QueueAccountingAdapterSyncCommand',
      actorType: 'ai_agent',
    });
    assert.equal(result.allowed, true, 'adapter sync is not hard-blocked for ai_agent');
    assert.equal(
      result.requires_approval,
      true,
      'ai_agent adapter sync must require human approval',
    );
    assert.equal(result.risk_level, 'high');
    assert.equal(result.approval_policy, 'finance.adapter_sync.ai_requires_approval');
  });

  test('T-6: human actor does not require approval for adapter sync', () => {
    const result = evaluateFinanceGovernance({
      commandType: 'QueueAccountingAdapterSyncCommand',
      actorType: 'human',
    });
    assert.equal(result.allowed, true);
    assert.equal(result.requires_approval, false, 'human adapter sync requires no approval');
    assert.equal(result.risk_level, 'medium');
  });
});

// ── T-13: Unknown command + ai_agent must be hard-blocked ─────────────────────

describe('T-13: Unknown commandType with ai_agent actor', () => {
  test('T-13: completely unknown command is hard-blocked for ai_agent', () => {
    const result = evaluateFinanceGovernance({
      commandType: 'SomeUnknownFutureCommand',
      actorType: 'ai_agent',
    });
    assert.equal(result.allowed, false, 'unknown command must be hard-blocked for ai_agent');
    assert.equal(result.risk_level, 'critical');
    assert.equal(result.approval_policy, 'finance.ai.unknown_command_blocked');
    assert.ok(
      result.blocked_actions.includes('SomeUnknownFutureCommand'),
      'blocked_actions must name the unknown command',
    );
  });

  test('T-13: human actor reaches requires-approval fallback for unknown command', () => {
    const result = evaluateFinanceGovernance({
      commandType: 'SomeUnknownFutureCommand',
      actorType: 'human',
    });
    // Human actors get the default approval-required fallback, not a hard block
    assert.equal(result.allowed, true, 'unknown command must be allowed for human (with approval)');
    assert.equal(result.requires_approval, true);
  });

  test('T-13: null commandType is hard-blocked for ai_agent', () => {
    const result = evaluateFinanceGovernance({ commandType: null, actorType: 'ai_agent' });
    assert.equal(result.allowed, false);
    assert.equal(result.approval_policy, 'finance.ai.unknown_command_blocked');
  });
});

// ── Known non-blocked commands for both actor types ───────────────────────────

describe('draft operations — allowed for both human and ai_agent', () => {
  const draftCommands = ['CreateDraftInvoiceCommand', 'UpdateDraftInvoiceCommand'];

  for (const cmd of draftCommands) {
    test(`${cmd} is allowed for human without approval`, () => {
      const result = evaluateFinanceGovernance({ commandType: cmd, actorType: 'human' });
      assert.equal(result.allowed, true);
      assert.equal(result.requires_approval, false);
      assert.equal(result.risk_level, 'low');
    });

    test(`${cmd} is allowed for ai_agent without approval`, () => {
      const result = evaluateFinanceGovernance({ commandType: cmd, actorType: 'ai_agent' });
      assert.equal(result.allowed, true);
      assert.equal(result.requires_approval, false);
    });
  }
});

describe('RequestJournalReversalCommand — always requires approval', () => {
  test('human reversal requires approval', () => {
    const result = evaluateFinanceGovernance({
      commandType: 'RequestJournalReversalCommand',
      actorType: 'human',
    });
    assert.equal(result.allowed, true);
    assert.equal(result.requires_approval, true);
    assert.equal(result.risk_level, 'high');
    assert.equal(result.approval_policy, 'finance.reversal.approval_required');
  });

  // Note: ai_agent reversal falls through to RequestJournalReversalCommand branch
  // before hitting the ai_agent unknown command block, so it also requires approval (not hard-blocked)
  test('ai_agent reversal is allowed but requires approval', () => {
    const result = evaluateFinanceGovernance({
      commandType: 'RequestJournalReversalCommand',
      actorType: 'ai_agent',
    });
    assert.equal(result.allowed, true);
    assert.equal(result.requires_approval, true);
  });
});
