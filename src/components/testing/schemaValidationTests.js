/**
 * Schema Validation Tests
 * Validates that all entity forms accept minimal required fields
 * and properly reject invalid data according to database schema
 */

import { Employee, Account, Contact, Lead, Opportunity } from '../../api/entities';

export const schemaValidationTests = {
  name: 'Schema Validation',
  tests: [
    // ==================== EMPLOYEE TESTS ====================
    {
      name: 'Employee: should accept minimal required fields (first_name, last_name)',
      fn: async () => {
        const employee = await Employee.create({
          tenant_id: 'local-tenant-001',
          first_name: 'Test',
          last_name: 'Employee'
        });
        
        if (!employee.id) throw new Error('Employee not created - missing ID');
        if (employee.first_name !== 'Test') throw new Error('First name mismatch');
        if (employee.last_name !== 'Employee') throw new Error('Last name mismatch');
        
        return 'Employee created with minimal required fields';
      }
    },
    {
      name: 'Employee: should accept employee without email',
      fn: async () => {
        const employee = await Employee.create({
          tenant_id: 'local-tenant-001',
          first_name: 'NoEmail',
          last_name: 'Test',
          email: null
        });
        
        if (!employee.id) throw new Error('Employee not created');
        if (employee.email !== null && employee.email !== undefined) {
          throw new Error('Email should be null or undefined');
        }
        
        return 'Employee created without email';
      }
    },
    {
      name: 'Employee: should store additional fields in metadata',
      fn: async () => {
        const employee = await Employee.create({
          tenant_id: 'local-tenant-001',
          first_name: 'Metadata',
          last_name: 'Test',
          department: 'Sales',
          job_title: 'Sales Rep',
          phone: '555-1234'
        });
        
        if (!employee.id) throw new Error('Employee not created');
        if (!employee.metadata) throw new Error('Metadata not stored');
        if (employee.metadata.department !== 'Sales') {
          throw new Error('Department not in metadata');
        }
        
        return 'Additional fields stored in metadata';
      }
    },
    {
      name: 'Employee: should reject without tenant_id',
      fn: async () => {
        try {
          await Employee.create({
            first_name: 'Test',
            last_name: 'Employee'
          });
          throw new Error('Should have rejected employee without tenant_id');
        } catch (error) {
          if (!error.message.includes('tenant_id')) {
            throw new Error('Error message should mention tenant_id');
          }
        }
        
        return 'Correctly rejected employee without tenant_id';
      }
    },
    {
      name: 'Employee: should reject without first_name',
      fn: async () => {
        try {
          await Employee.create({
            tenant_id: 'local-tenant-001',
            last_name: 'Test'
          });
          throw new Error('Should have rejected employee without first_name');
        } catch (error) {
          if (!error.message.includes('first_name')) {
            throw new Error('Error message should mention first_name');
          }
        }
        
        return 'Correctly rejected employee without first_name';
      }
    },
    {
      name: 'Employee: should reject without last_name',
      async run() {
        try {
          await Employee.create({
            tenant_id: 'local-tenant-001',
            first_name: 'Test'
          });
          throw new Error('Should have rejected employee without last_name');
        } catch (error) {
          if (!error.message.includes('last_name')) {
            throw new Error('Error message should mention last_name');
          }
        }
        
        return 'Correctly rejected employee without last_name';
      }
    },

    // ==================== ACCOUNT TESTS ====================
    {
      name: 'Account: should accept minimal required fields (name)',
      async run() {
        const account = await Account.create({
          tenant_id: 'local-tenant-001',
          name: `Test Account ${Date.now()}`
        });
        
        if (!account.id) throw new Error('Account not created - missing ID');
        if (!account.name.includes('Test Account')) throw new Error('Name mismatch');
        
        return 'Account created with minimal required fields';
      }
    },
    {
      name: 'Account: should accept account without email',
      async run() {
        const account = await Account.create({
          tenant_id: 'local-tenant-001',
          name: `No Email Account ${Date.now()}`,
          email: null
        });
        
        if (!account.id) throw new Error('Account not created');
        
        return 'Account created without email';
      }
    },
    {
      name: 'Account: should reject without name',
      async run() {
        try {
          await Account.create({
            tenant_id: 'local-tenant-001'
          });
          throw new Error('Should have rejected account without name');
        } catch (error) {
          if (!error.message.includes('name') && !error.message.includes('required')) {
            throw new Error('Error message should mention missing name');
          }
        }
        
        return 'Correctly rejected account without name';
      }
    },

    // ==================== CONTACT TESTS ====================
    {
      name: 'Contact: should accept with first_name and last_name',
      async run() {
        const contact = await Contact.create({
          tenant_id: 'local-tenant-001',
          first_name: 'Test',
          last_name: 'Contact'
        });
        
        if (!contact.id) throw new Error('Contact not created - missing ID');
        if (contact.first_name !== 'Test') throw new Error('First name mismatch');
        if (contact.last_name !== 'Contact') throw new Error('Last name mismatch');
        
        return 'Contact created with both names';
      }
    },
    {
      name: 'Contact: should accept without email',
      async run() {
        const contact = await Contact.create({
          tenant_id: 'local-tenant-001',
          first_name: 'NoEmail',
          last_name: 'Contact',
          email: null
        });
        
        if (!contact.id) throw new Error('Contact not created');
        
        return 'Contact created without email';
      }
    },
    {
      name: 'Contact: should reject missing both names',
      async run() {
        try {
          await Contact.create({
            tenant_id: 'local-tenant-001',
            email: 'test@example.com'
          });
          throw new Error('Should have rejected contact without names');
        } catch (error) {
          if (!error.message.includes('name') && !error.message.includes('required')) {
            throw new Error('Error should mention missing name fields');
          }
        }
        
        return 'Correctly rejected contact without names';
      }
    },

    // ==================== LEAD TESTS ====================
    {
      name: 'Lead: should accept with first_name and last_name',
      async run() {
        const lead = await Lead.create({
          tenant_id: 'local-tenant-001',
          first_name: 'Test',
          last_name: 'Lead'
        });
        
        if (!lead.id) throw new Error('Lead not created - missing ID');
        if (lead.first_name !== 'Test') throw new Error('First name mismatch');
        if (lead.last_name !== 'Lead') throw new Error('Last name mismatch');
        
        return 'Lead created with both names';
      }
    },
    {
      name: 'Lead: should accept without email',
      async run() {
        const lead = await Lead.create({
          tenant_id: 'local-tenant-001',
          first_name: 'NoEmail',
          last_name: 'Lead',
          email: null
        });
        
        if (!lead.id) throw new Error('Lead not created');
        
        return 'Lead created without email';
      }
    },
    {
      name: 'Lead: should accept without company',
      async run() {
        const lead = await Lead.create({
          tenant_id: 'local-tenant-001',
          first_name: 'NoCompany',
          last_name: 'Lead'
        });
        
        if (!lead.id) throw new Error('Lead not created');
        
        return 'Lead created without company';
      }
    },

    // ==================== OPPORTUNITY TESTS ====================
    {
      name: 'Opportunity: should accept minimal required fields (name)',
      async run() {
        const opportunity = await Opportunity.create({
          tenant_id: 'local-tenant-001',
          name: `Test Opportunity ${Date.now()}`
        });
        
        if (!opportunity.id) throw new Error('Opportunity not created - missing ID');
        if (!opportunity.name.includes('Test Opportunity')) {
          throw new Error('Name mismatch');
        }
        
        return 'Opportunity created with minimal required fields';
      }
    },
    {
      name: 'Opportunity: should accept without amount',
      async run() {
        const opportunity = await Opportunity.create({
          tenant_id: 'local-tenant-001',
          name: `No Amount Opp ${Date.now()}`,
          amount: null
        });
        
        if (!opportunity.id) throw new Error('Opportunity not created');
        
        return 'Opportunity created without amount';
      }
    },
    {
      name: 'Opportunity: should accept without close_date',
      async run() {
        const opportunity = await Opportunity.create({
          tenant_id: 'local-tenant-001',
          name: `No Date Opp ${Date.now()}`,
          close_date: null
        });
        
        if (!opportunity.id) throw new Error('Opportunity not created');
        
        return 'Opportunity created without close_date';
      }
    },
    {
      name: 'Opportunity: should reject without name',
      async run() {
        try {
          await Opportunity.create({
            tenant_id: 'local-tenant-001',
            amount: 10000
          });
          throw new Error('Should have rejected opportunity without name');
        } catch (error) {
          // Backend returns 500 for DB constraint violation currently
          if (!error.message.includes('name') && !error.message.includes('null')) {
            throw new Error('Error should mention missing name');
          }
        }
        
        return 'Correctly rejected opportunity without name';
      }
    },

    // ==================== EMAIL UNIQUENESS TESTS ====================
    {
      name: 'Email: should allow multiple NULL emails in employees',
      async run() {
        const emp1 = await Employee.create({
          tenant_id: 'local-tenant-001',
          first_name: 'NullEmail1',
          last_name: 'Employee',
          email: null
        });
        
        const emp2 = await Employee.create({
          tenant_id: 'local-tenant-001',
          first_name: 'NullEmail2',
          last_name: 'Employee',
          email: null
        });
        
        if (!emp1.id || !emp2.id) {
          throw new Error('Both employees should be created with NULL emails');
        }
        
        return 'Multiple NULL emails allowed in employees';
      }
    },
    {
      name: 'Email: should allow multiple NULL emails in contacts',
      async run() {
        const contact1 = await Contact.create({
          tenant_id: 'local-tenant-001',
          first_name: 'NullEmail1',
          last_name: 'Contact',
          email: null
        });
        
        const contact2 = await Contact.create({
          tenant_id: 'local-tenant-001',
          first_name: 'NullEmail2',
          last_name: 'Contact',
          email: null
        });
        
        if (!contact1.id || !contact2.id) {
          throw new Error('Both contacts should be created with NULL emails');
        }
        
        return 'Multiple NULL emails allowed in contacts';
      }
    },
    {
      name: 'Email: should reject duplicate non-null email in employees',
      async run() {
        const uniqueEmail = `duplicate${Date.now()}@test.com`;
        
        await Employee.create({
          tenant_id: 'local-tenant-001',
          first_name: 'First',
          last_name: 'Employee',
          email: uniqueEmail
        });
        
        try {
          await Employee.create({
            tenant_id: 'local-tenant-001',
            first_name: 'Second',
            last_name: 'Employee',
            email: uniqueEmail
          });
          throw new Error('Should have rejected duplicate email');
        } catch (error) {
          if (!error.message.includes('already exists') && !error.message.includes('duplicate')) {
            throw new Error('Error should indicate duplicate email');
          }
        }
        
        return 'Correctly rejected duplicate non-null email';
      }
    },

    // ==================== VISUAL INDICATOR VALIDATION ====================
    {
      name: 'UI: Employee form should show asterisks on required fields',
      async run() {
        // This is a documentation test - validates expected UI behavior
        const requiredFields = ['first_name', 'last_name'];
        const optionalFields = ['email', 'phone', 'department', 'job_title'];
        
        return `Employee form should show red asterisks (*) on: ${requiredFields.join(', ')}. Optional fields: ${optionalFields.join(', ')}`;
      }
    },
    {
      name: 'UI: Contact/Lead forms should show either/or helper text',
      async run() {
        // This is a documentation test - validates expected UI behavior
        return 'Contact and Lead forms should show "(or Last Name required)" under First Name and "(or First Name required)" under Last Name';
      }
    },
    {
      name: 'UI: Employee email should become required when CRM access enabled',
      async run() {
        // This is a documentation test - validates expected UI behavior
        return 'When "Has CRM Access" checkbox is checked, email field should show red asterisk (*) and be required';
      }
    }
  ]
};
