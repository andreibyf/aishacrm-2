/**
 * Unit tests for src/components/ai/conversationalForms/index.js
 * Tests conversational forms utilities against the real schema module.
 *
 * NOTE: schemas.js uses { id, label, entity, steps, buildPayload, previewFields }.
 * There is no `name` or `fields` field — those were the pre-v3 shape.
 * The 6 canonical schemas are: bizdevsource, lead, account, contact, opportunity, activity.
 */
import { describe, test, expect } from 'vitest';
import { getSchemaById, listConversationalSchemas, conversationalSchemas } from './index';

describe('[AISHA_CHAT] conversationalForms/index.js', () => {
  test('getSchemaById returns correct schema for valid id', () => {
    const schema = getSchemaById('lead');
    expect(schema).toBeDefined();
    expect(schema.id).toBe('lead');
    expect(schema.label).toBe('New Lead');
    expect(schema.entity).toBe('leads');
    expect(Array.isArray(schema.steps)).toBe(true);
  });

  test('getSchemaById returns null for invalid id', () => {
    const schema = getSchemaById('nonexistent');
    expect(schema).toBeNull();
  });

  test('listConversationalSchemas returns schemas in correct order', () => {
    const schemas = listConversationalSchemas();

    // DEFAULT_SCHEMA_ORDER: bizdevsource first, then the five CRM entities
    expect(schemas[0].id).toBe('bizdevsource');
    expect(schemas[1].id).toBe('lead');
    expect(schemas[2].id).toBe('account');
    expect(schemas[3].id).toBe('contact');
    expect(schemas[4].id).toBe('opportunity');
    expect(schemas[5].id).toBe('activity');
  });

  test('listConversationalSchemas includes all schemas', () => {
    const schemas = listConversationalSchemas();

    expect(schemas).toHaveLength(6);
    expect(schemas.every((schema) => schema.id && schema.label)).toBe(true);
  });

  test('conversationalSchemas is exported', () => {
    expect(conversationalSchemas).toBeDefined();
    expect(typeof conversationalSchemas).toBe('object');
    expect(Object.keys(conversationalSchemas)).toHaveLength(6);
  });

  test('DEFAULT_SCHEMA_ORDER defines the ordering', () => {
    const schemas = listConversationalSchemas();
    const ids = schemas.map((s) => s.id);

    expect(ids.slice(0, 6)).toEqual([
      'bizdevsource',
      'lead',
      'account',
      'contact',
      'opportunity',
      'activity',
    ]);
  });

  // ── bizdevsource field-level required flags ──────────────────────────────

  test('bizdevsource company step: company_name is required, dba_name is not', () => {
    const schema = getSchemaById('bizdevsource');
    const companyStep = schema.steps.find((s) => s.id === 'bizdev-company');
    expect(companyStep).toBeDefined();

    const companyField = companyStep.fields.find((f) => f.name === 'company_name');
    const dbaField = companyStep.fields.find((f) => f.name === 'dba_name');

    expect(companyField.required).toBe(true);
    expect(dbaField.required).toBe(false);
  });

  test('bizdevsource source step: source_name and source_type are both required', () => {
    const schema = getSchemaById('bizdevsource');
    const sourceStep = schema.steps.find((s) => s.id === 'bizdev-source');
    expect(sourceStep).toBeDefined();

    const sourceNameField = sourceStep.fields.find((f) => f.name === 'source_name');
    const sourceTypeField = sourceStep.fields.find((f) => f.name === 'source_type');

    expect(sourceNameField.required).toBe(true);
    expect(sourceTypeField.required).toBe(true);
  });

  // ── bizdev-source step validation ────────────────────────────────────────

  test('bizdev-source validate: blocks when source_type is empty', () => {
    const schema = getSchemaById('bizdevsource');
    const sourceStep = schema.steps.find((s) => s.id === 'bizdev-source');

    const result = sourceStep.validate({ source_name: 'Construction Directory', source_type: '' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/source type/i);
  });

  test('bizdev-source validate: blocks when source_name is empty', () => {
    const schema = getSchemaById('bizdevsource');
    const sourceStep = schema.steps.find((s) => s.id === 'bizdev-source');

    const result = sourceStep.validate({ source_name: '', source_type: 'referral' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/source name/i);
  });

  test('bizdev-source validate: passes when both source_name and source_type are provided', () => {
    const schema = getSchemaById('bizdevsource');
    const sourceStep = schema.steps.find((s) => s.id === 'bizdev-source');

    const result = sourceStep.validate({
      source_name: 'Construction Directory',
      source_type: 'directory',
    });
    expect(result.valid).toBe(true);
  });
});
