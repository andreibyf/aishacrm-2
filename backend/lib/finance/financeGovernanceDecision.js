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

// Commands that AI actors can NEVER execute, regardless of approval status.
// Invariant #3: AI actors cannot approve, post, refund, or move money.
// B-3: Refund and void commands added explicitly so they are blocked by default
// rather than falling through to the approval-required fallback.
const AI_BLOCKED_COMMANDS = new Set([
  'ApproveFinanceActionCommand',
  'RejectFinanceActionCommand',
  'PostJournalEntryCommand',
  // Refund / void — must be human-executed
  'RefundCommand',
  'IssueRefundCommand',
  'VoidInvoiceCommand',
  'VoidJournalEntryCommand',
]);

export function evaluateFinanceGovernance({
  commandType,
  actorType = 'human',
  amountCents = 0,
  braidTraceId = null,
} = {}) {
  // ── Hard block for AI actors on restricted commands ────────────────────────
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

  // ── Journal reversal — always requires approval ────────────────────────────
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

  // ── Adapter sync — allowed, but AI actors require approval ─────────────────
  // B-4 / R-4: QueueAccountingAdapterSyncCommand has no actorType guard in the
  // original scaffold, meaning an AI actor can queue an external accounting sync
  // without human review. Phase 2 will promote this from mock-only to live writes,
  // at which point an unguarded allow would bypass Invariant #3.
  if (commandType === 'QueueAccountingAdapterSyncCommand') {
    if (actorType === 'ai_agent') {
      return createGovernanceDecision({
        allowed: true,
        requiresApproval: true,
        riskLevel: 'high',
        approvalPolicy: 'finance.adapter_sync.ai_requires_approval',
        escalationTarget: 'finance_controller',
        explanation:
          'AI actors may queue adapter sync, but execution requires human approval. Adapter sync will promote to live writes in Phase 2.',
        braidTraceId,
        policyTrace: [
          {
            policy: 'finance.adapter_sync.ai_requires_approval',
            result: 'approval_required',
            reason: 'AI-triggered adapter sync requires human sign-off before Phase 2 promotion',
          },
        ],
      });
    }
    return createGovernanceDecision({
      allowed: true,
      requiresApproval: false,
      riskLevel: 'medium',
      explanation: 'Adapter sync may be queued; runtime remains mock-only in v1 scaffold.',
      braidTraceId,
    });
  }

  // ── Draft invoice operations — low risk, no approval needed ───────────────
  if (commandType === 'CreateDraftInvoiceCommand' || commandType === 'UpdateDraftInvoiceCommand') {
    return createGovernanceDecision({
      allowed: true,
      requiresApproval: false,
      riskLevel: 'low',
      explanation: 'Draft invoice operations are permitted without posting money movement.',
      braidTraceId,
    });
  }

  // ── Draft journal creation — low-to-medium risk ───────────────────────────
  if (commandType === 'CreateJournalDraftCommand') {
    return createGovernanceDecision({
      allowed: true,
      requiresApproval: false,
      riskLevel: amountCents >= 100000 ? 'medium' : 'low',
      explanation: 'Journal drafts are allowed, but posting remains separately governed.',
      braidTraceId,
    });
  }

  // ── Default fallback ───────────────────────────────────────────────────────
  // M-4: AI actors must be hard-blocked for unknown commands. The previous fallback
  // returned allowed:true for all actors including ai_agent, which means any new
  // refund/void command not yet in AI_BLOCKED_COMMANDS would silently be allowed
  // with approval for AI actors. Fail-closed instead.
  if (actorType === 'ai_agent') {
    return createGovernanceDecision({
      allowed: false,
      requiresApproval: true,
      riskLevel: 'critical',
      blockedActions: [commandType],
      approvalPolicy: 'finance.ai.unknown_command_blocked',
      escalationTarget: 'finance_controller',
      explanation:
        'Unknown finance command is blocked for AI actors. Add an explicit governance rule before allowing.',
      braidTraceId,
      policyTrace: [
        {
          policy: 'finance.ai.unknown_command_blocked',
          result: 'block',
          reason: 'Fail-closed: AI actors blocked on unrecognized command types',
        },
      ],
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
