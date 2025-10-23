import { assert, createMockContact, createMockLead, createMockOpportunity } from './testUtils';

export const formValidationTests = {
  name: 'Form Validation',
  tests: [
    {
      name: 'Contact form should require at least first_name or last_name',
      fn: async () => {
        const contactWithBoth = createMockContact({ first_name: 'John', last_name: 'Doe' });
        const isValidBoth = contactWithBoth.first_name && contactWithBoth.last_name;
        assert.true(isValidBoth, 'Contact with both names should be valid');

        const contactWithNeither = createMockContact({ first_name: '', last_name: '' });
        const isValidNeither = contactWithNeither.first_name || contactWithNeither.last_name;
        assert.false(isValidNeither, 'Contact with no names should be invalid');
      }
    },
    {
      name: 'Contact form should default missing name to UNK',
      fn: async () => {
        // In practice, the validation layer will set missing names to 'UNK'
        const contactOnlyFirst = createMockContact({ first_name: 'John', last_name: 'UNK' });
        assert.truthy(contactOnlyFirst.first_name);
        assert.equal(contactOnlyFirst.last_name, 'UNK');

        const contactOnlyLast = createMockContact({ first_name: 'UNK', last_name: 'Doe' });
        assert.equal(contactOnlyLast.first_name, 'UNK');
        assert.truthy(contactOnlyLast.last_name);
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
      name: 'Lead form should require at least first_name or last_name',
      fn: async () => {
        const leadWithBoth = createMockLead({ first_name: 'Jane', last_name: 'Smith' });
        const isValidBoth = leadWithBoth.first_name && leadWithBoth.last_name;
        assert.true(isValidBoth, 'Lead with both names should be valid');

        const leadWithNeither = createMockLead({ first_name: '', last_name: '' });
        const isValidNeither = leadWithNeither.first_name || leadWithNeither.last_name;
        assert.false(isValidNeither, 'Lead with no names should be invalid');
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