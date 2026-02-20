/**
 * PEP Emitter — Resolved Pattern → Four Compilation Artifacts
 *
 * Takes a fully resolved pattern and emits:
 *   - semantic_frame.json — normalized intent representation
 *   - braid_ir.json — execution graph (instruction nodes)
 *   - plan.json — ordered human-readable steps
 *   - audit.json — risk flags, cost estimate, policy check
 *
 * All emitters are pure functions: no I/O, no LLM, deterministic output.
 */

'use strict';

import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of a string.
 * @param {string} str
 * @returns {string}
 */
function sha256(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

const PROGRAM_ID = 'cashflow-recurring-policy-v1';

/**
 * Emit the semantic frame from a resolved pattern.
 *
 * @param {object} resolved - Output of resolver.resolve() with resolved === true
 * @returns {object} semantic_frame
 */
function emitSemanticFrame(resolved) {
  return {
    version: '1.0.0',
    program_id: PROGRAM_ID,
    intent: 'AutomateRecurringTransaction',
    trigger: {
      entity: resolved.entity.id,
      event: resolved.event,
      condition: resolved.triggerCondition,
    },
    action: {
      capability: resolved.action.capability.id,
      operation: resolved.action.operation,
      entity: resolved.action.entity_id,
      derived_from: resolved.action.derived_from,
      date_offset: {
        field: resolved.timeResolution.field,
        resolve: resolved.timeResolution.resolve,
      },
    },
    fallback: resolved.fallback
      ? {
          condition: 'action.failed',
          capability: resolved.fallback.capability.id,
          target: resolved.fallback.target,
        }
      : null,
    policies: [...resolved.policies, 'DataScope'],
    effects: resolved.effects,
  };
}

/**
 * Emit the Braid IR (instruction graph) from a resolved pattern.
 *
 * @param {object} resolved
 * @returns {object} braid_ir
 */
function emitBraidIR(resolved) {
  const instructions = [
    {
      op: 'load_entity',
      entity: resolved.entity.id,
      binding: 'trigger.entity',
      assign: '__t0',
    },
    {
      op: 'check_condition',
      field: '__t0.is_recurring',
      operator: 'eq',
      value: true,
      assign: '__t1',
    },
    {
      op: 'call_capability',
      capability: 'compute_next_date',
      args: { pattern: '__t0.recurrence_pattern' },
      assign: '__t2',
    },
    {
      op: 'call_capability',
      capability: 'persist_entity',
      operation: 'create',
      entity: resolved.entity.id,
      derive_from: '__t0',
      overrides: {
        transaction_date: '__t2',
        entry_method: 'recurring_auto',
      },
      assign: '__t3',
    },
  ];

  // Add match instruction with Ok/Err arms if there's a fallback
  if (resolved.fallback) {
    instructions.push({
      op: 'match',
      input: '__t3',
      arms: [
        {
          pattern: 'Ok',
          assign: '__t4',
          instructions: [],
        },
        {
          pattern: 'Err',
          assign: '__t5',
          instructions: [
            {
              op: 'call_capability',
              capability: resolved.fallback.capability.id,
              target: resolved.fallback.target,
              message: 'Recurring transaction creation failed',
              assign: '__t6',
            },
          ],
        },
      ],
    });
  }

  return {
    version: '1.0.0',
    program_id: PROGRAM_ID,
    instructions,
    effects: resolved.effects,
    policy: resolved.policies.includes('WRITE_OPERATIONS') ? 'WRITE_OPERATIONS' : 'READ_ONLY',
  };
}

/**
 * Emit the execution plan from a resolved pattern.
 *
 * @param {object} resolved
 * @returns {object} plan
 */
function emitPlan(resolved) {
  const steps = [
    {
      order: 1,
      op: 'load_entity',
      description: `Load the triggering ${resolved.entity.id}`,
    },
    {
      order: 2,
      op: 'check_condition',
      description: 'Verify is_recurring is true',
    },
    {
      order: 3,
      op: 'compute_next_date',
      description: 'Calculate next transaction_date from recurrence_pattern',
    },
    {
      order: 4,
      op: 'create_entity',
      description: `Create new ${resolved.entity.id} with entry_method=recurring_auto`,
    },
  ];

  if (resolved.fallback) {
    steps.push({
      order: 5,
      op: 'on_failure',
      description: `Notify ${resolved.fallback.target} if creation failed`,
    });
  }

  return {
    version: '1.0.0',
    program_id: PROGRAM_ID,
    steps,
    estimated_steps: steps.length,
    reversible: false,
    requires_confirmation: false,
  };
}

/**
 * Emit the audit report from a resolved pattern.
 *
 * @param {object} resolved
 * @param {string} sourceText - original English source for hash
 * @returns {object} audit
 */
function emitAudit(resolved, sourceText) {
  const riskFlags = [];

  // Check for write capabilities
  if (resolved.policies.includes('WRITE_OPERATIONS')) {
    riskFlags.push({
      severity: 'low',
      flag: 'WRITE_CAPABILITY',
      detail: 'Program creates new database records',
    });
  }

  // Check for notification capabilities
  if (resolved.fallback && resolved.fallback.capability.id === 'notify_role') {
    riskFlags.push({
      severity: 'info',
      flag: 'NOTIFICATION_CAPABILITY',
      detail: 'Program may send notifications on failure',
    });
  }

  // Calculate cost estimate
  const costEstimate = {
    db_writes:
      resolved.action.operation === 'create' || resolved.action.operation === 'update' ? 1 : 0,
    db_reads: 1, // load_entity
    notifications: resolved.fallback ? '0-1' : '0',
    llm_calls: 0,
  };

  return {
    version: '1.0.0',
    program_id: PROGRAM_ID,
    compiled_at: new Date().toISOString(),
    source_hash: sha256(sourceText),
    risk_flags: riskFlags,
    cost_estimate: costEstimate,
    policy_check: {
      passed: true,
      policies_applied: [...resolved.policies, 'DataScope'],
    },
    unresolved: [],
    warnings: [],
  };
}

/**
 * Emit all four artifacts from a resolved pattern.
 *
 * @param {object} resolved - Output of resolver.resolve() with resolved === true
 * @param {string} sourceText - The original English source text
 * @returns {{ semantic_frame: object, braid_ir: object, plan: object, audit: object }}
 */
function emit(resolved, sourceText) {
  return {
    semantic_frame: emitSemanticFrame(resolved),
    braid_ir: emitBraidIR(resolved),
    plan: emitPlan(resolved),
    audit: emitAudit(resolved, sourceText),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Query emitter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emit a query_entity IR node from a resolved query frame.
 *
 * @param {object} resolvedQuery - Output of resolveQuery() with resolved === true
 * @param {string} sourceText - Original English source
 * @returns {object} braid_ir for a query program
 */
function emitQuery(resolvedQuery, sourceText) {
  const programId = `query-${resolvedQuery.target.toLowerCase()}-${Date.now()}`;

  const braidIr = {
    version: '1.0.0',
    program_id: programId,
    instructions: [
      {
        op: 'query_entity',
        target: resolvedQuery.target,
        target_kind: resolvedQuery.target_kind,
        table: resolvedQuery.table,
        route: resolvedQuery.route || null,
        filters: resolvedQuery.filters.map((f) => ({
          field: f.field,
          operator: f.operator,
          value: f.value,
        })),
        sort: resolvedQuery.sort || null,
        limit: resolvedQuery.limit,
        assign: 'results',
      },
    ],
    effects: [],
    policy: 'READ_ONLY',
  };

  const semanticFrame = {
    version: '1.0.0',
    program_id: programId,
    intent: 'QueryEntity',
    target: resolvedQuery.target,
    target_kind: resolvedQuery.target_kind,
    filter_count: resolvedQuery.filters.length,
    has_sort: resolvedQuery.sort != null,
    limit: resolvedQuery.limit,
    policies: ['READ_ONLY', 'DataScope'],
    effects: [],
  };

  const plan = {
    version: '1.0.0',
    program_id: programId,
    steps: [
      {
        order: 1,
        op: 'query_entity',
        description: `Query ${resolvedQuery.target} with ${resolvedQuery.filters.length} filter(s)`,
      },
    ],
    estimated_steps: 1,
    reversible: true,
    requires_confirmation: false,
  };

  const audit = {
    version: '1.0.0',
    program_id: programId,
    compiled_at: new Date().toISOString(),
    source_hash: sha256(sourceText),
    risk_flags: [],
    cost_estimate: {
      db_writes: 0,
      db_reads: 1,
      notifications: '0',
      llm_calls: 0,
    },
    policy_check: {
      passed: true,
      policies_applied: ['READ_ONLY', 'DataScope'],
    },
    unresolved: [],
    warnings: [],
  };

  return { semantic_frame: semanticFrame, braid_ir: braidIr, plan, audit };
}

/**
 * Build a human-readable confirmation string from a resolved query frame.
 * Called at compile time — date tokens are left as-is (resolved at query time).
 *
 * @param {object} resolvedQuery - Output of resolveQuery()
 * @returns {string}
 */
function buildConfirmationString(resolvedQuery) {
  const parts = [];

  const filterDescs = resolvedQuery.filters.map((f) => {
    if (f.operator === 'is_null') return `${f.field} is empty`;
    if (f.operator === 'is_not_null') return `${f.field} is not empty`;
    if (f.operator === 'in')
      return `${f.field} in [${Array.isArray(f.value) ? f.value.join(', ') : f.value}]`;
    if (f.operator === 'contains') return `${f.field} contains "${f.value}"`;
    // Format employee token
    const val =
      typeof f.value === 'string' && f.value.startsWith('{{resolve_employee:')
        ? f.value.replace(/{{resolve_employee:\s*(.+?)}}/, '$1')
        : f.value;
    // Format date token
    const displayVal =
      typeof val === 'string' && val.startsWith('{{date:')
        ? val.replace(/{{date:\s*(.+?)}}/, '$1').replace(/_/g, ' ')
        : val;
    const opLabel =
      { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' }[f.operator] || f.operator;
    return `${f.field} ${opLabel} ${displayVal}`;
  });

  parts.push(`Showing ${resolvedQuery.target}`);
  if (filterDescs.length > 0) {
    parts.push(`where ${filterDescs.join(', ')}`);
  }
  if (resolvedQuery.sort) {
    parts.push(`sorted by ${resolvedQuery.sort.field} ${resolvedQuery.sort.direction}`);
  }
  parts.push(`(limit ${resolvedQuery.limit})`);

  return parts.join(' ');
}

export {
  emit,
  emitSemanticFrame,
  emitBraidIR,
  emitPlan,
  emitAudit,
  sha256,
  emitQuery,
  buildConfirmationString,
};
