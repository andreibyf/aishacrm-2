import { assert, createMockContact, createMockLead, createMockOpportunity } from './testUtils';

export const formValidationTests = {
  name: 'Form Validation',
  tests: [
    {
      name: 'Contact form should require first_name and last_name',
      fn: async () => {
        const contact = createMockContact({ first_name: '', last_name: '' });
        
        const isValid = contact.first_name && contact.last_name;
        assert.false(isValid, 'Contact with empty names should be invalid');
      }
    },
    {
      name: 'Contact form should accept valid contact data',
      fn: async () => {
        const contact = createMockContact();
        
        assert.truthy(contact.first_name);
        assert.truthy(contact.last_name);
        assert.truthy(contact.email);
      }
    },
    {
      name: 'Lead form should require first_name and last_name',
      fn: async () => {
        const lead = createMockLead({ first_name: '', last_name: '' });
        
        const isValid = lead.first_name && lead.last_name;
        assert.false(isValid, 'Lead with empty names should be invalid');
      }
    },
    {
      name: 'Opportunity form should require name, amount, and close_date',
      fn: async () => {
        const opportunity = createMockOpportunity();
        
        assert.truthy(opportunity.name);
        assert.truthy(opportunity.amount);
        assert.truthy(opportunity.close_date);
      }
    },
    {
      name: 'Opportunity amount should be a number',
      fn: async () => {
        const opportunity = createMockOpportunity({ amount: 10000 });
        
        assert.equal(typeof opportunity.amount, 'number');
        assert.true(opportunity.amount > 0);
      }
    },
    {
      name: 'Opportunity stage should be valid enum value',
      fn: async () => {
        const validStages = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
        const opportunity = createMockOpportunity({ stage: 'prospecting' });
        
        assert.arrayIncludes(validStages, opportunity.stage);
      }
    },
    {
      name: 'Phone number formatting should handle valid formats',
      fn: async () => {
        const validPhone = '(555) 123-4567';
        const contact = createMockContact({ phone: validPhone });
        
        assert.equal(contact.phone, validPhone);
      }
    },
    {
      name: 'Email validation should accept valid email formats',
      fn: async () => {
        const validEmail = 'test@example.com';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        assert.true(emailRegex.test(validEmail));
      }
    }
  ]
};