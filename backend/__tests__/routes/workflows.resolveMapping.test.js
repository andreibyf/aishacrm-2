/**
 * workflows.resolveMapping.test.js
 *
 * Unit tests for the resolveMapping helper and the create_activity
 * field_mappings execution logic inside the workflow executor.
 *
 * These tests extract and exercise the pure logic without a DB or HTTP layer.
 *
 * Run:
 *   docker compose exec backend node --test \
 *     backend/__tests__/routes/workflows.resolveMapping.test.js
 *
 * Coverage:
 *  resolveMapping — new unified shape  { target_field, source_value }
 *  resolveMapping — legacy lead shape  { lead_field, webhook_field }
 *  resolveMapping — legacy contact shape { contact_field, webhook_field }
 *  resolveMapping — dotted source_value resolves via context.variables
 *  resolveMapping — returns null for unrecognised / empty mapping
 *  resolveMapping — unresolved template is returned as-is (not stripped)
 *  create_activity field resolution — subject, body, status, due_date, assigned_to
 *  create_activity association — auto-detect from context
 *  create_activity association — explicit entity override
 *  create_activity association — field_mappings override related_to / related_id
 *  backward compat — legacy cfg.title / cfg.details still work when no field_mappings
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline the logic under test ────────────────────────────────────────────
// We inline rather than import from workflows.js because the file is an
// Express route factory (requires pgPool, Redis, etc.) and we want pure unit
// tests with no side-effects.

function buildExecutor(payload = {}, variables = {}) {
  const context = { payload, variables };

  function replaceVariables(template) {
    if (typeof template !== 'string') return template;
    return template.replace(/\{\{([^}]+)\}\}/g, (match, variable) => {
      const trimmed = String(variable).trim();
      if (context.payload && context.payload[trimmed] !== undefined)
        return context.payload[trimmed];
      const parts = trimmed.split('.');
      if (parts.length > 1) {
        let value = context.variables[parts[0]];
        for (let i = 1; i < parts.length; i++) {
          if (value && value[parts[i]] !== undefined) value = value[parts[i]];
          else { value = undefined; break; }
        }
        if (value !== undefined) return value;
      } else if (context.variables && context.variables[trimmed] !== undefined) {
        return context.variables[trimmed];
      }
      return match;
    });
  }

  function resolveMapping(m) {
    if (m.target_field) {
      const targetField = m.target_field;
      const raw = m.source_value || '';
      const template = raw.startsWith('{{') ? raw : raw ? `{{${raw}}}` : '';
      const resolved = template ? replaceVariables(template) : '';
      return { targetField, resolved };
    }
    if (m.lead_field && m.webhook_field) {
      const resolved = replaceVariables(`{{${m.webhook_field}}}`);
      return { targetField: m.lead_field, resolved };
    }
    if (m.contact_field && m.webhook_field) {
      const resolved = replaceVariables(`{{${m.webhook_field}}}`);
      return { targetField: m.contact_field, resolved };
    }
    return null;
  }

  /**
   * Mirrors the create_activity field resolution logic from the executor.
   * Returns the resolved fields object (does NOT hit DB).
   */
  function resolveActivityFields(cfg) {
    const fieldMappings = cfg.field_mappings || [];
    const resolvedFields = {};
    for (const m of fieldMappings) {
      const rm = resolveMapping(m);
      if (rm && rm.targetField && rm.resolved !== null && rm.resolved !== undefined && rm.resolved !== '') {
        resolvedFields[rm.targetField] = rm.resolved;
      }
    }
    const subject = resolvedFields.subject || replaceVariables(cfg.title || cfg.subject || 'Workflow activity');
    const body = resolvedFields.body || replaceVariables(cfg.details || cfg.description || '');
    const status = resolvedFields.status || 'scheduled';
    const due_date = resolvedFields.due_date || null;
    const assigned_to = resolvedFields.assigned_to || null;

    const lead = context.variables.found_lead;
    const contact = context.variables.found_contact;
    const account = context.variables.found_account;
    const opportunity = context.variables.found_opportunity;

    const associate = cfg.associate || 'auto';
    let related_to = null;
    let related_id = null;
    if (associate === 'auto') {
      related_to = lead ? 'lead' : contact ? 'contact' : account ? 'account' : opportunity ? 'opportunity' : null;
      related_id = lead ? lead.id : contact ? contact.id : account ? account.id : opportunity ? opportunity.id : null;
    } else {
      const entityMap = { lead, contact, account, opportunity };
      const entity = entityMap[associate];
      if (entity) { related_to = associate; related_id = entity.id; }
    }
    if (resolvedFields.related_to) related_to = resolvedFields.related_to;
    if (resolvedFields.related_id) related_id = resolvedFields.related_id;

    return { subject, body, status, due_date, assigned_to, related_to, related_id };
  }

  return { resolveMapping, resolveActivityFields };
}

// ─── resolveMapping tests ───────────────────────────────────────────────────

describe('resolveMapping', () => {
  it('new shape: resolves source_value token from payload', () => {
    const { resolveMapping } = buildExecutor({ email: 'jane@example.com' });
    const result = resolveMapping({ target_field: 'email', source_type: 'token', source_value: 'email' });
    assert.deepEqual(result, { targetField: 'email', resolved: 'jane@example.com' });
  });

  it('new shape: resolves dotted source_value from context.variables', () => {
    const { resolveMapping } = buildExecutor({}, { found_lead: { email: 'lead@example.com' } });
    const result = resolveMapping({ target_field: 'email', source_type: 'token', source_value: 'found_lead.email' });
    assert.deepEqual(result, { targetField: 'email', resolved: 'lead@example.com' });
  });

  it('new shape: source_value already wrapped in {{ }} is resolved correctly', () => {
    const { resolveMapping } = buildExecutor({ company: 'Acme' });
    const result = resolveMapping({ target_field: 'company', source_value: '{{company}}' });
    assert.deepEqual(result, { targetField: 'company', resolved: 'Acme' });
  });

  it('new shape: unresolved token is returned as template string (not empty)', () => {
    const { resolveMapping } = buildExecutor({});
    const result = resolveMapping({ target_field: 'email', source_value: 'missing_field' });
    // replaceVariables returns the original {{missing_field}} when not found
    assert.equal(result.targetField, 'email');
    assert.equal(result.resolved, '{{missing_field}}');
  });

  it('new shape: empty source_value returns empty resolved string', () => {
    const { resolveMapping } = buildExecutor({ email: 'x@y.com' });
    const result = resolveMapping({ target_field: 'email', source_value: '' });
    assert.deepEqual(result, { targetField: 'email', resolved: '' });
  });

  it('legacy lead shape: resolves via lead_field + webhook_field', () => {
    const { resolveMapping } = buildExecutor({ first_name: 'Jane' });
    const result = resolveMapping({ lead_field: 'first_name', webhook_field: 'first_name' });
    assert.deepEqual(result, { targetField: 'first_name', resolved: 'Jane' });
  });

  it('legacy contact shape: resolves via contact_field + webhook_field', () => {
    const { resolveMapping } = buildExecutor({ phone: '555-1234' });
    const result = resolveMapping({ contact_field: 'phone', webhook_field: 'phone' });
    assert.deepEqual(result, { targetField: 'phone', resolved: '555-1234' });
  });

  it('returns null for empty object', () => {
    const { resolveMapping } = buildExecutor();
    assert.equal(resolveMapping({}), null);
  });

  it('returns null for mapping with only source_value and no target_field', () => {
    const { resolveMapping } = buildExecutor({ email: 'x@y.com' });
    assert.equal(resolveMapping({ source_value: 'email' }), null);
  });
});

// ─── create_activity field resolution ──────────────────────────────────────

describe('create_activity field resolution', () => {
  it('resolves subject and body from field_mappings', () => {
    const { resolveActivityFields } = buildExecutor({ subject_val: 'Follow up', body_val: 'Hello' });
    const result = resolveActivityFields({
      type: 'task',
      field_mappings: [
        { target_field: 'subject', source_value: 'subject_val' },
        { target_field: 'body', source_value: 'body_val' },
      ],
    });
    assert.equal(result.subject, 'Follow up');
    assert.equal(result.body, 'Hello');
  });

  it('resolves status from field_mappings', () => {
    const { resolveActivityFields } = buildExecutor({ s: 'completed' });
    const result = resolveActivityFields({
      field_mappings: [{ target_field: 'status', source_value: 's' }],
    });
    assert.equal(result.status, 'completed');
  });

  it('resolves due_date and assigned_to from field_mappings', () => {
    const { resolveActivityFields } = buildExecutor({ d: '2026-06-01', u: 'user-uuid-123' });
    const result = resolveActivityFields({
      field_mappings: [
        { target_field: 'due_date', source_value: 'd' },
        { target_field: 'assigned_to', source_value: 'u' },
      ],
    });
    assert.equal(result.due_date, '2026-06-01');
    assert.equal(result.assigned_to, 'user-uuid-123');
  });

  it('falls back to legacy cfg.title and cfg.details when no field_mappings', () => {
    const { resolveActivityFields } = buildExecutor();
    const result = resolveActivityFields({ title: 'Legacy title', details: 'Legacy body' });
    assert.equal(result.subject, 'Legacy title');
    assert.equal(result.body, 'Legacy body');
  });

  it('falls back to default subject when neither field_mappings nor cfg.title set', () => {
    const { resolveActivityFields } = buildExecutor();
    const result = resolveActivityFields({});
    assert.equal(result.subject, 'Workflow activity');
  });

  it('defaults status to "scheduled" when not mapped', () => {
    const { resolveActivityFields } = buildExecutor();
    const result = resolveActivityFields({ field_mappings: [] });
    assert.equal(result.status, 'scheduled');
  });

  it('auto-detect association: picks found_lead when present', () => {
    const { resolveActivityFields } = buildExecutor({}, {
      found_lead: { id: 'lead-1' },
    });
    const result = resolveActivityFields({ associate: 'auto', field_mappings: [] });
    assert.equal(result.related_to, 'lead');
    assert.equal(result.related_id, 'lead-1');
  });

  it('auto-detect association: falls back to found_contact when no lead', () => {
    const { resolveActivityFields } = buildExecutor({}, {
      found_contact: { id: 'contact-1' },
    });
    const result = resolveActivityFields({ associate: 'auto', field_mappings: [] });
    assert.equal(result.related_to, 'contact');
    assert.equal(result.related_id, 'contact-1');
  });

  it('explicit association: uses specified entity type', () => {
    const { resolveActivityFields } = buildExecutor({}, {
      found_lead: { id: 'lead-1' },
      found_contact: { id: 'contact-1' },
    });
    const result = resolveActivityFields({ associate: 'contact', field_mappings: [] });
    assert.equal(result.related_to, 'contact');
    assert.equal(result.related_id, 'contact-1');
  });

  it('field_mappings related_to / related_id override auto-detect', () => {
    const { resolveActivityFields } = buildExecutor(
      { custom_entity: 'opportunity', custom_id: 'opp-99' },
      { found_lead: { id: 'lead-1' } },
    );
    const result = resolveActivityFields({
      associate: 'auto',
      field_mappings: [
        { target_field: 'related_to', source_value: 'custom_entity' },
        { target_field: 'related_id', source_value: 'custom_id' },
      ],
    });
    assert.equal(result.related_to, 'opportunity');
    assert.equal(result.related_id, 'opp-99');
  });

  it('returns null related_to / related_id when no entity in context and associate=auto', () => {
    const { resolveActivityFields } = buildExecutor();
    const result = resolveActivityFields({ associate: 'auto', field_mappings: [] });
    assert.equal(result.related_to, null);
    assert.equal(result.related_id, null);
  });
});
