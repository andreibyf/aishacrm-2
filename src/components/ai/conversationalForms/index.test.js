/**
 * Unit tests for src/components/ai/conversationalForms/index.js
 * Tests conversational forms utilities
 */
import { describe, test, expect, vi } from 'vitest';
import { getSchemaById, listConversationalSchemas, conversationalSchemas } from './index';

// Mock the schemas module
vi.mock('./schemas', () => ({
  conversationalSchemas: {
    lead: { id: 'lead', name: 'Lead', fields: [] },
    account: { id: 'account', name: 'Account', fields: [] },
    contact: { id: 'contact', name: 'Contact', fields: [] },
    opportunity: { id: 'opportunity', name: 'Opportunity', fields: [] },
    activity: { id: 'activity', name: 'Activity', fields: [] },
    bizdevsource: { id: 'bizdevsource', name: 'BizDev Source', fields: [] },
    custom: { id: 'custom', name: 'Custom Entity', fields: [] },
  },
}));

describe('conversationalForms/index.js', () => {
  test('getSchemaById returns correct schema for valid id', () => {
    const schema = getSchemaById('lead');
    expect(schema).toEqual({ id: 'lead', name: 'Lead', fields: [] });
  });

  test('getSchemaById returns null for invalid id', () => {
    const schema = getSchemaById('nonexistent');
    expect(schema).toBeNull();
  });

  test('listConversationalSchemas returns schemas in correct order', () => {
    const schemas = listConversationalSchemas();

    // Should start with default order
    expect(schemas[0].id).toBe('bizdevsource');
    expect(schemas[1].id).toBe('lead');
    expect(schemas[2].id).toBe('account');
    expect(schemas[3].id).toBe('contact');
    expect(schemas[4].id).toBe('opportunity');
    expect(schemas[5].id).toBe('activity');

    // Custom schemas should come after
    expect(schemas[6].id).toBe('custom');
  });

  test('listConversationalSchemas includes all schemas', () => {
    const schemas = listConversationalSchemas();

    expect(schemas).toHaveLength(7);
    expect(schemas.every(schema => schema.id && schema.name)).toBe(true);
  });

  test('conversationalSchemas is exported', () => {
    expect(conversationalSchemas).toBeDefined();
    expect(typeof conversationalSchemas).toBe('object');
    expect(Object.keys(conversationalSchemas)).toHaveLength(7);
  });

  test('DEFAULT_SCHEMA_ORDER defines the ordering', () => {
    // Test that the order is maintained
    const schemas = listConversationalSchemas();
    const ids = schemas.map(s => s.id);

    expect(ids.slice(0, 6)).toEqual(['bizdevsource', 'lead', 'account', 'contact', 'opportunity', 'activity']);
  });
});