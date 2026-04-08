import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getIndustryPlaybookTemplates } from '../../routes/tenants.js';

describe('Tenant playbook seeding industry resolver', () => {
  test('resolves exact real_estate key', () => {
    const templates = getIndustryPlaybookTemplates('real_estate');
    assert.ok(Array.isArray(templates));
    assert.ok(templates.length > 0);
  });

  test('resolves canonical real_estate_and_property_management key', () => {
    const templates = getIndustryPlaybookTemplates('real_estate_and_property_management');
    assert.ok(Array.isArray(templates));
    assert.ok(templates.length > 0);
  });

  test('resolves common variant keys via normalization/aliases', () => {
    const variants = [
      'Real Estate and Property Management',
      'real-estate-and-property-management',
      'real_estate_property_management',
      'real_estate_and_property_mgmt',
    ];

    for (const variant of variants) {
      const templates = getIndustryPlaybookTemplates(variant);
      assert.ok(Array.isArray(templates), `expected array for ${variant}`);
      assert.ok(templates.length > 0, `expected templates for ${variant}`);
    }
  });

  test('returns empty list for unrelated industries', () => {
    const templates = getIndustryPlaybookTemplates('information_technology_and_software');
    assert.deepEqual(templates, []);
  });
});
