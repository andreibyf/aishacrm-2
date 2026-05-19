export function createGovernanceDecision({
  allowed = true,
  requiresApproval = false,
  riskLevel = 'low',
  blockedActions = [],
  approvalPolicy = null,
  escalationTarget = null,
  explanation = '',
  policyTrace = [],
  braidTraceId = null,
  model = null,
  promptHash = null,
  evaluatedAt = new Date().toISOString(),
} = {}) {
  return {
    allowed,
    requires_approval: requiresApproval,
    risk_level: riskLevel,
    blocked_actions: blockedActions,
    approval_policy: approvalPolicy,
    escalation_target: escalationTarget,
    explanation,
    policy_trace: policyTrace,
    braid_trace_id: braidTraceId,
    model,
    prompt_hash: promptHash,
    evaluated_at: evaluatedAt,
  };
}

const AI_BLOCKED_COMMANDS = new Set([
  'ApproveFinanceActionCommand',
  'RejectFinanceActionCommand',
  'PostJournalEntryCommand',
]);

export function evaluateFinanceGovernance({
  commandType,
  actorType = 'human',
  amountCents = 0,
  braidTraceId = null,
} = {}) {
  if (actorType === 'ai_agent' && AI_BLOCKED_COMMANDS.has(commandType)) {
    return createGovernanceDecision({
      allowed: false,
      requiresApproval: true,
      riskLevel: 'critical',
      blockedActions: [commandType],
      approvalPolicy: 'finance.ai.no_money_movement',
      escalationTarget: 'finance_controller',
      explanation: 'AI actors cannot approve finance actions or post ledger truth.',
      braidTraceId,
      policyTrace: [
        {
          policy: 'finance.ai.no_money_movement',
          result: 'block',
          reason: 'AI actor cannot approve or execute restricted finance actions',
        },
      ],
    });
  }

  if (commandType === 'RequestJournalReversalCommand') {
    return createGovernanceDecision({
      allowed: true,
      requiresApproval: true,
      riskLevel: 'high',
      approvalPolicy: 'finance.reversal.approval_required',
      escalationTarget: 'finance_controller',
      explanation: 'Reversals must create a new controlled journal flow and require review.',
      braidTraceId,
      policyTrace: [
        {
          policy: 'finance.reversal.approval_required',
          result: 'approval_required',
          reason: 'Ledger corrections must preserve an approval trail',
        },
      ],
    });
  }

  if (commandType === 'QueueAccountingAdapterSyncCommand') {
    return createGovernanceDecision({
      allowed: true,
      requiresApproval: false,
      riskLevel: 'medium',
      explanation: 'Adapter sync may be queued, but runtime remains mock-only in v1 scaffold.',
      braidTraceId,
    });
  }

  if (commandType === 'CreateDraftInvoiceCommand' || commandType === 'UpdateDraftInvoiceCommand') {
    return createGovernanceDecision({
      allowed: true,
      requiresApproval: false,
      riskLevel: 'low',
      explanation: 'Draft invoice operations are permitted without posting money movement.',
      braidTraceId,
    });
  }

  if (commandType === 'CreateJournalDraftCommand') {
    return createGovernanceDecision({
      allowed: true,
      requiresApproval: false,
      riskLevel: amountCents >= 100000 ? 'medium' : 'low',
      explanation: 'Journal drafts are allowed, but posting remains separately governed.',
      braidTraceId,
    });
  }

  return createGovernanceDecision({
    allowed: true,
    requiresApproval: true,
    riskLevel: amountCents >= 500000 ? 'critical' : 'high',
    approvalPolicy: 'finance.high_value.approval_required',
    escalationTarget: 'finance_controller',
    explanation: 'This finance action requires human review before execution.',
    braidTraceId,
    policyTrace: [
      {
        policy: 'finance.high_value.approval_required',
        result: 'approval_required',
        reason: 'High-risk finance action requires human approval',
      },
    ],
  });
}

export default evaluateFinanceGovernance;
