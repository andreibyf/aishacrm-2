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
});
