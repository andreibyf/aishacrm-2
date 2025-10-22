import { assert, createMockContact, createMockLead, createMockAccount, createMockOpportunity } from './testUtils';

export const dataIntegrityTests = {
  name: 'Data Integrity',
  tests: [
    {
      name: 'Contact should have tenant_id',
      fn: async () => {
        const contact = createMockContact();
        assert.exists(contact.tenant_id);
        assert.truthy(contact.tenant_id);
      }
    },
    {
      name: 'Lead should have tenant_id',
      fn: async () => {
        const lead = createMockLead();
        assert.exists(lead.tenant_id);
        assert.truthy(lead.tenant_id);
      }
    },
    {
      name: 'Opportunity should have tenant_id',
      fn: async () => {
        const opportunity = createMockOpportunity();
        assert.exists(opportunity.tenant_id);
        assert.truthy(opportunity.tenant_id);
      }
    },
    {
      name: 'Account should have tenant_id',
      fn: async () => {
        const account = createMockAccount();
        assert.exists(account.tenant_id);
        assert.truthy(account.tenant_id);
      }
    },
    {
      name: 'Contact with account_id should link to valid account',
      fn: async () => {
        const account = createMockAccount();
        const contact = createMockContact({ account_id: account.id });
        
        assert.equal(contact.account_id, account.id);
        assert.equal(contact.tenant_id, account.tenant_id);
      }
    },
    {
      name: 'Opportunity with contact_id should link to valid contact',
      fn: async () => {
        const contact = createMockContact();
        const opportunity = createMockOpportunity({ contact_id: contact.id });
        
        assert.equal(opportunity.contact_id, contact.id);
        assert.equal(opportunity.tenant_id, contact.tenant_id);
      }
    },
    {
      name: 'Opportunity with account_id should link to valid account',
      fn: async () => {
        const account = createMockAccount();
        const opportunity = createMockOpportunity({ account_id: account.id });
        
        assert.equal(opportunity.account_id, account.id);
        assert.equal(opportunity.tenant_id, account.tenant_id);
      }
    },
    {
      name: 'Contact should have created_date',
      fn: async () => {
        const contact = createMockContact();
        assert.exists(contact.created_date);
        
        const date = new Date(contact.created_date);
        assert.false(isNaN(date.getTime()), 'created_date should be valid date');
      }
    },
    {
      name: 'Lead status should be valid enum value',
      fn: async () => {
        const validStatuses = ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost'];
        const lead = createMockLead({ status: 'new' });
        
        assert.arrayIncludes(validStatuses, lead.status);
      }
    },
    {
      name: 'Contact status should be valid enum value',
      fn: async () => {
        const validStatuses = ['active', 'inactive', 'prospect', 'customer'];
        const contact = createMockContact({ status: 'active' });
        
        assert.arrayIncludes(validStatuses, contact.status);
      }
    }
  ]
};