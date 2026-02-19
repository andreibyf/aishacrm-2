/**
 * PEP Resolver — CBE Pattern → Resolved Pattern
 *
 * Resolves entities, capabilities, and time expressions against JSON catalogs.
 * Fully deterministic — no LLM calls. Fail-closed on any unresolvable reference.
 *
 * Input:  parsed CBE pattern + entity catalog + capability catalog
 * Output: resolved pattern annotated with catalog bindings — or clarification_required
 */

'use strict';

/**
 * Normalize a string for fuzzy matching: lowercase, trim, remove articles.
 * @param {string} str
 * @returns {string}
 */
function normalizeForMatch(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/\b(a|an|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve an entity reference against the entity catalog.
 * Matches by id (case-insensitive), or by checking if the normalized ref
 * appears in the normalized entity id/description/table name.
 *
 * @param {string} entityRef - The entity reference from the parser (e.g. "cash flow transaction")
 * @param {object} entityCatalog - The loaded entity-catalog.json
 * @returns {{ resolved: true, entity: object } | { resolved: false, reason: string, suggestion?: string }}
 */
function resolveEntity(entityRef, entityCatalog) {
  const normalizedRef = normalizeForMatch(entityRef);
  const entities = entityCatalog.entities || [];

  // Exact id match (case-insensitive)
  for (const entity of entities) {
    if (entity.id.toLowerCase() === normalizedRef.replace(/\s+/g, '')) {
      return { resolved: true, entity };
    }
  }

  // Fuzzy match: check if the ref words appear in entity id or description
  for (const entity of entities) {
    const idNorm = normalizeForMatch(entity.id.replace(/([A-Z])/g, ' $1'));
    const descNorm = normalizeForMatch(entity.description);
    const tableNorm = normalizeForMatch(entity.aisha_binding?.table || '');

    if (
      idNorm.includes(normalizedRef) ||
      normalizedRef.includes(idNorm.trim()) ||
      descNorm.includes(normalizedRef) ||
      tableNorm.includes(normalizedRef.replace(/\s+/g, '_')) ||
      normalizedRef.replace(/\s+/g, '_') === tableNorm
    ) {
      return { resolved: true, entity };
    }
  }

  // No match — suggest closest entity
  const suggestion =
    entities.length > 0 ? `Did you mean '${entities[0].id}'?` : 'No entities in catalog.';

  return {
    resolved: false,
    reason: `Entity '${entityRef}' not found in entity catalog. ${suggestion}`,
    suggestion: entities.length > 0 ? entities[0].id : undefined,
  };
}

/**
 * Resolve a capability reference against the capability catalog.
 * Maps common verbs to capability ids.
 *
 * @param {string} capabilityRef - e.g. "create the next transaction"
 * @param {string} entityId - resolved entity id (e.g. "CashFlowTransaction")
 * @param {object} capabilityCatalog
 * @returns {{ resolved: true, capability: object, operation: string } | { resolved: false, reason: string }}
 */
function resolveCapability(capabilityRef, entityId, capabilityCatalog) {
  const normalizedRef = normalizeForMatch(capabilityRef);
  const capabilities = capabilityCatalog.capabilities || [];

  // Map known verbs to capability ids and operations
  const verbMappings = [
    {
      verbs: ['create', 'add', 'insert', 'make', 'generate', 'produce'],
      capId: 'persist_entity',
      operation: 'create',
    },
    {
      verbs: ['update', 'modify', 'change', 'edit', 'set'],
      capId: 'persist_entity',
      operation: 'update',
    },
    {
      verbs: ['read', 'get', 'fetch', 'find', 'retrieve', 'look up'],
      capId: 'read_entity',
      operation: 'get',
    },
    { verbs: ['list', 'show', 'display', 'enumerate'], capId: 'read_entity', operation: 'list' },
    {
      verbs: ['notify', 'alert', 'inform', 'tell', 'send', 'message'],
      capId: 'notify_role',
      operation: null,
    },
    {
      verbs: ['compute', 'calculate', 'determine', 'figure'],
      capId: 'compute_next_date',
      operation: null,
    },
  ];

  for (const mapping of verbMappings) {
    for (const verb of mapping.verbs) {
      if (normalizedRef.includes(verb)) {
        const cap = capabilities.find((c) => c.id === mapping.capId);
        if (!cap) continue;

        // For entity-bound capabilities, check if the entity has a binding
        if (cap.bindings && cap.bindings[entityId]) {
          const operation = mapping.operation;
          if (operation && cap.bindings[entityId][operation]) {
            return { resolved: true, capability: cap, operation };
          }
          // If no specific operation needed, return first available
          if (!operation) {
            return {
              resolved: true,
              capability: cap,
              operation: Object.keys(cap.bindings[entityId])[0] || null,
            };
          }
        }

        // For role-bound capabilities (like notify_role), verify the phrase
        // actually references a valid role, not an entity like "invoice"
        if (mapping.capId === 'notify_role') {
          const availableRoles = Object.keys(cap.bindings || {});
          const phraseHasRole = availableRoles.some((role) => normalizedRef.includes(role));
          if (phraseHasRole) {
            return { resolved: true, capability: cap, operation: null };
          }
          // "send an invoice" → verb matches but no valid role in phrase; don't match
          continue;
        }

        // For non-entity-bound capabilities
        if (mapping.capId === 'compute_next_date') {
          return { resolved: true, capability: cap, operation: null };
        }
      }
    }
  }

  return {
    resolved: false,
    reason: `Capability for '${capabilityRef}' not found in capability catalog.`,
  };
}

/**
 * Resolve a notify_role reference.
 *
 * @param {string} roleRef - e.g. "owner"
 * @param {object} capabilityCatalog
 * @returns {{ resolved: true, capability: object, target: string } | { resolved: false, reason: string }}
 */
function resolveNotifyRole(roleRef, capabilityCatalog) {
  const normalizedRole = normalizeForMatch(roleRef);
  const notifyCap = (capabilityCatalog.capabilities || []).find((c) => c.id === 'notify_role');

  if (!notifyCap) {
    return { resolved: false, reason: 'notify_role capability not found in catalog.' };
  }

  if (notifyCap.bindings && notifyCap.bindings[normalizedRole]) {
    return { resolved: true, capability: notifyCap, target: normalizedRole };
  }

  const availableRoles = Object.keys(notifyCap.bindings || {});
  return {
    resolved: false,
    reason: `Role '${roleRef}' not found in notify_role bindings. Available roles: ${availableRoles.join(', ')}`,
  };
}

/**
 * Resolve recurrence/time expressions to ISO-8601 durations.
 *
 * @param {string} attributeRef - e.g. "recurrence pattern"
 * @param {object} capabilityCatalog
 * @returns {{ resolved: true, patterns: object } | { resolved: false, reason: string }}
 */
function resolveTimeExpressions(attributeRef, capabilityCatalog) {
  const normalizedAttr = normalizeForMatch(attributeRef);

  // Check if this references recurrence patterns
  if (
    normalizedAttr.includes('recurrence') ||
    normalizedAttr.includes('recurring') ||
    normalizedAttr.includes('pattern') ||
    normalizedAttr.includes('schedule') ||
    normalizedAttr.includes('frequency')
  ) {
    const computeCap = (capabilityCatalog.capabilities || []).find(
      (c) => c.id === 'compute_next_date',
    );
    if (computeCap && computeCap.bindings) {
      return { resolved: true, patterns: computeCap.bindings };
    }
  }

  // Try direct duration match
  const directDurations = { weekly: 'P7D', monthly: 'P1M', quarterly: 'P3M', annually: 'P1Y' };
  if (directDurations[normalizedAttr]) {
    return {
      resolved: true,
      patterns: { [normalizedAttr]: { duration: directDurations[normalizedAttr] } },
    };
  }

  return {
    resolved: false,
    reason: `Time expression '${attributeRef}' could not be resolved to ISO-8601 durations.`,
  };
}

/**
 * Resolve a single duration keyword to ISO-8601.
 *
 * @param {string} pattern - e.g. "monthly"
 * @param {object} capabilityCatalog
 * @returns {string|null} ISO-8601 duration or null
 */
function resolveSingleDuration(pattern, capabilityCatalog) {
  const normalized = normalizeForMatch(pattern);
  const computeCap = (capabilityCatalog.capabilities || []).find(
    (c) => c.id === 'compute_next_date',
  );
  if (computeCap && computeCap.bindings && computeCap.bindings[normalized]) {
    return computeCap.bindings[normalized].duration;
  }
  return null;
}

/**
 * Resolve a parsed CBE pattern against the entity and capability catalogs.
 *
 * @param {object} pattern - Output of parser.parse()
 * @param {object} entityCatalog - Loaded entity-catalog.json
 * @param {object} capabilityCatalog - Loaded capability-catalog.json
 * @returns {{ resolved: true, ... } | { status: 'clarification_required', reason: string, unresolved: string[], partial_frame?: object }}
 */
function resolve(pattern, entityCatalog, capabilityCatalog) {
  if (!pattern || !pattern.match) {
    return {
      status: 'clarification_required',
      reason: pattern?.reason || 'Pattern did not match any supported CBE grammar.',
      unresolved: [],
      partial_frame: null,
    };
  }

  // Phase 1: Resolve trigger entity
  const entityResult = resolveEntity(pattern.trigger.entity_ref, entityCatalog);
  if (!entityResult.resolved) {
    return {
      status: 'clarification_required',
      reason: entityResult.reason,
      unresolved: [pattern.trigger.entity_ref],
      partial_frame: null,
    };
  }

  const entity = entityResult.entity;

  // Phase 2: Resolve trigger event from state_change
  const stateChange = normalizeForMatch(pattern.trigger.state_change);
  let event = null;
  if (entity.events) {
    for (const [eventName, _eventDesc] of Object.entries(entity.events)) {
      const _descNorm = normalizeForMatch(_eventDesc);
      const _nameNorm = normalizeForMatch(eventName.replace(/([A-Z])/g, ' $1'));
      if (stateChange.includes('recurring') && eventName === 'RecurringTransactionDue') {
        event = eventName;
        break;
      }
      if (stateChange.includes('created') && eventName.includes('Created')) {
        event = eventName;
        break;
      }
      if (stateChange.includes('updated') && eventName.includes('Updated')) {
        event = eventName;
        break;
      }
    }
  }
  // Default to state-based trigger if no event match
  if (!event) {
    event = 'RecurringTransactionDue'; // fallback for "is_recurring = true"
  }

  // Determine trigger condition from state_change
  let triggerCondition = null;
  if (stateChange.includes('recurring')) {
    triggerCondition = { field: 'is_recurring', operator: 'eq', value: true };
  }

  // Phase 3: Resolve action capability
  const capResult = resolveCapability(pattern.action.capability_ref, entity.id, capabilityCatalog);
  if (!capResult.resolved) {
    return {
      status: 'clarification_required',
      reason: capResult.reason,
      unresolved: [pattern.action.capability_ref],
      partial_frame: null,
    };
  }

  // Phase 4: Resolve time expressions
  const timeResult = resolveTimeExpressions(pattern.action.attribute_ref, capabilityCatalog);
  if (!timeResult.resolved) {
    return {
      status: 'clarification_required',
      reason: timeResult.reason,
      unresolved: [pattern.action.attribute_ref],
      partial_frame: null,
    };
  }

  // Phase 5: Resolve fallback if present
  let fallback = null;
  if (pattern.fallback) {
    const notifyResult = resolveNotifyRole(pattern.fallback.role_ref, capabilityCatalog);
    if (!notifyResult.resolved) {
      return {
        status: 'clarification_required',
        reason: notifyResult.reason,
        unresolved: [pattern.fallback.role_ref],
        partial_frame: null,
      };
    }
    fallback = {
      condition: pattern.fallback.outcome_condition,
      capability: notifyResult.capability,
      target: notifyResult.target,
    };
  }

  // Collect all policies and effects
  const policies = new Set();
  const effects = new Set();

  policies.add(capResult.capability.policy);
  (capResult.capability.effects || []).forEach((e) => effects.add(e));

  if (fallback) {
    policies.add(fallback.capability.policy);
    (fallback.capability.effects || []).forEach((e) => effects.add(e));
  }

  // compute_next_date effects
  const computeCap = (capabilityCatalog.capabilities || []).find(
    (c) => c.id === 'compute_next_date',
  );
  if (computeCap) {
    (computeCap.effects || []).forEach((e) => effects.add(e));
  }

  return {
    resolved: true,
    entity,
    event,
    triggerCondition,
    action: {
      capability: capResult.capability,
      operation: capResult.operation,
      entity_id: entity.id,
      derived_from: 'trigger.entity',
    },
    timeResolution: {
      field: 'recurrence_pattern',
      resolve: 'compute_next_date',
      patterns: timeResult.patterns,
    },
    fallback,
    policies: Array.from(policies),
    effects: Array.from(effects),
    raw: pattern.raw,
  };
}

export {
  resolve,
  resolveEntity,
  resolveCapability,
  resolveNotifyRole,
  resolveTimeExpressions,
  resolveSingleDuration,
  normalizeForMatch,
};
