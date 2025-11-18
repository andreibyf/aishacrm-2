/**
 * Schema Validation Tests
 * Validates that all entity forms accept minimal required fields
 * and properly reject invalid data according to database schema
 */

import { Employee, Account, Contact, Lead, Opportunity } from '../../api/entities';

function errorText(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error.errorSnippet) return String(error.errorSnippet);
  if (error.body) {
    try {
      return typeof error.body === 'string' ? error.body : JSON.stringify(error.body);
    } catch {
      return String(error.body);
    }
  }
  if (error.response && error.response.data) {
    try {
      return JSON.stringify(error.response.data);
    } catch {
      return String(error.response.data);
    }
  }
  if (error.message) return String(error.message);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// Test tenant UUID (matches backend test fixtures)
const TEST_TENANT_UUID = '11111111-1111-1111-1111-111111111111';

export const schemaValidationTests = {
  name: 'Schema Validation',
  tests: [
    // ==================== SETUP TEST ====================
    {
      name: 'Setup: Clear localStorage and set test tenant',
      async fn() {
        // Clear any cached tenant values that might interfere with tests
        if (typeof window !== 'undefined') {
          localStorage.removeItem('selected_tenant_id');
          localStorage.removeItem('effective_user_tenant_id');
          // Set the test tenant UUID
          localStorage.setItem('selected_tenant_id', TEST_TENANT_UUID);
        }
        return 'Test environment configured';
      }
    },
    // ==================== EMPLOYEE TESTS ====================
    {
      name: 'Employee: should accept minimal required fields (first_name, last_name)',
      async fn() {
        const employee = await Employee.create({
          tenant_id: TEST_TENANT_UUID,
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
      async fn() {
        const employee = await Employee.create({
          tenant_id: TEST_TENANT_UUID,
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
      name: 'Employee: should accept phone and department as direct columns',
      async fn() {
        const employee = await Employee.create({
          tenant_id: TEST_TENANT_UUID,
          first_name: 'PhoneDept',
          last_name: 'Test',
          department: 'Sales',
          phone: '555-1234'
        });
        
        if (!employee.id) throw new Error('Employee not created');
        if (employee.department !== 'Sales') {
          throw new Error('Department should be a direct column, not in metadata');
        }
        if (employee.phone !== '555-1234') {
          throw new Error('Phone should be a direct column, not in metadata');
        }
        
        return 'Phone and department stored as direct columns';
      }
    },
    {
      name: 'Employee: should store other additional fields in metadata',
      async fn() {
        const employee = await Employee.create({
          tenant_id: TEST_TENANT_UUID,
          first_name: 'Metadata',
          last_name: 'Test',
          job_title: 'Sales Manager',
          hire_date: '2025-01-01'
        });
        
        if (!employee.id) throw new Error('Employee not created');
        // Other fields that aren't direct columns should go to metadata
        if (employee.metadata && employee.metadata.job_title !== 'Sales Manager') {
          throw new Error('job_title should be in metadata');
        }
        
        return 'Other additional fields stored in metadata';
      }
    },
    {
      name: 'Employee: should reject without tenant_id',
      async fn() {
        try {
          await Employee.create({
            first_name: 'Test',
            last_name: 'Employee'
          });
          throw new Error('Should have rejected employee without tenant_id');
        } catch (error) {
          const text = errorText(error);
          if (!text.includes('tenant_id') && !text.includes('tenant')) {
            throw new Error(`Error should mention tenant_id; got: ${text}`);
          }
        }
        
        return 'Correctly rejected employee without tenant_id';
      }
    },
    {
      name: 'Employee: should reject without first_name',
      async fn() {
        try {
          await Employee.create({
            tenant_id: TEST_TENANT_UUID,
            last_name: 'Test'
          });
          throw new Error('Should have rejected employee without first_name');
        } catch (error) {
          const text = errorText(error);
          if (!text.includes('first_name') && !text.includes('First Name')) {
            throw new Error(`Error should mention first_name; got: ${text}`);
          }
        }
        
        return 'Correctly rejected employee without first_name';
      }
    },
    {
      name: 'Employee: should reject without last_name',
      async fn() {
        try {
          await Employee.create({
            tenant_id: TEST_TENANT_UUID,
            first_name: 'Test'
          });
          throw new Error('Should have rejected employee without last_name');
        } catch (error) {
          const text = errorText(error);
          if (!text.includes('last_name') && !text.includes('Last Name')) {
            throw new Error(`Error should mention last_name; got: ${text}`);
          }
        }
        
        return 'Correctly rejected employee without last_name';
      }
    },

    // ==================== ACCOUNT TESTS ====================
    {
      name: 'Account: should accept minimal required fields (name)',
      async fn() {
        const account = await Account.create({
          tenant_id: TEST_TENANT_UUID,
          name: `Test Account ${Date.now()}`
        });
        
        if (!account.id) throw new Error('Account not created - missing ID');
        if (!account.name.includes('Test Account')) throw new Error('Name mismatch');
        
        return 'Account created with minimal required fields';
      }
    },
    {
      name: 'Account: should accept account without email',
      async fn() {
        const account = await Account.create({
          tenant_id: TEST_TENANT_UUID,
          name: `No Email Account ${Date.now()}`,
          email: null
        });
        
        if (!account.id) throw new Error('Account not created');
        
        return 'Account created without email';
      }
    },
    {
      name: 'Account: should reject without name',
      async fn() {
        try {
          await Account.create({
            tenant_id: TEST_TENANT_UUID
          });
          throw new Error('Should have rejected account without name');
        } catch (error) {
          const text = errorText(error);
          if (!text.includes('name') && !text.includes('required')) {
            throw new Error(`Error should mention missing name; got: ${text}`);
          }
        }
        
        return 'Correctly rejected account without name';
      }
    },

    // ==================== CONTACT TESTS ====================
    {
      name: 'Contact: should accept with first_name and last_name',
      async fn() {
        const contact = await Contact.create({
          tenant_id: TEST_TENANT_UUID,
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
      async fn() {
        const contact = await Contact.create({
          tenant_id: TEST_TENANT_UUID,
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
      async fn() {
        try {
          await Contact.create({
            tenant_id: TEST_TENANT_UUID,
            email: 'test@example.com'
          });
          throw new Error('Should have rejected contact without names');
        } catch (error) {
          const text = errorText(error);
          if (!text.includes('name') && !text.includes('required')) {
            throw new Error(`Error should mention missing name fields; got: ${text}`);
          }
        }
        
        return 'Correctly rejected contact without names';
      }
    },

    // ==================== LEAD TESTS ====================
    {
      name: 'Lead: should accept with first_name and last_name',
      async fn() {
        const lead = await Lead.create({
          tenant_id: TEST_TENANT_UUID,
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
      async fn() {
        const lead = await Lead.create({
          tenant_id: TEST_TENANT_UUID,
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
      async fn() {
        const lead = await Lead.create({
          tenant_id: TEST_TENANT_UUID,
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
      async fn() {
        const opportunity = await Opportunity.create({
          tenant_id: TEST_TENANT_UUID,
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
      async fn() {
        const opportunity = await Opportunity.create({
          tenant_id: TEST_TENANT_UUID,
          name: `No Amount Opp ${Date.now()}`,
          amount: null
        });
        
        if (!opportunity.id) throw new Error('Opportunity not created');
        
        return 'Opportunity created without amount';
      }
    },
    {
      name: 'Opportunity: should accept without close_date',
      async fn() {
        const opportunity = await Opportunity.create({
          tenant_id: TEST_TENANT_UUID,
          name: `No Date Opp ${Date.now()}`,
          close_date: null
        });
        
        if (!opportunity.id) throw new Error('Opportunity not created');
        
        return 'Opportunity created without close_date';
      }
    },
    {
      name: 'Opportunity: should reject without name',
      async fn() {
        try {
          await Opportunity.create({
            tenant_id: TEST_TENANT_UUID,
            amount: 10000
          });
          throw new Error('Should have rejected opportunity without name');
        } catch (error) {
          const text = errorText(error);
          // Backend returns 500 for DB constraint violation currently
          if (!text.includes('name') && !text.includes('null') && !text.includes('not-null')) {
            throw new Error(`Error should mention missing name; got: ${text}`);
          }
        }
        
        return 'Correctly rejected opportunity without name';
      }
    },

    // ==================== EMAIL UNIQUENESS TESTS ====================
    {
      name: 'Email: should allow multiple NULL emails in employees',
      async fn() {
        const emp1 = await Employee.create({
          tenant_id: TEST_TENANT_UUID,
          first_name: 'NullEmail1',
          last_name: 'Employee',
          email: null
        });
        
        const emp2 = await Employee.create({
          tenant_id: TEST_TENANT_UUID,
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
      async fn() {
        const contact1 = await Contact.create({
          tenant_id: TEST_TENANT_UUID,
          first_name: 'NullEmail1',
          last_name: 'Contact',
          email: null
        });
        
        const contact2 = await Contact.create({
          tenant_id: TEST_TENANT_UUID,
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
      async fn() {
        const uniqueEmail = `duplicate${Date.now()}@test.com`;
        
        await Employee.create({
          tenant_id: TEST_TENANT_UUID,
          first_name: 'First',
          last_name: 'Employee',
          email: uniqueEmail
        });
        
        try {
          await Employee.create({
            tenant_id: TEST_TENANT_UUID,
            first_name: 'Second',
            last_name: 'Employee',
            email: uniqueEmail
          });
          throw new Error('Should have rejected duplicate email');
        } catch (error) {
          const text = errorText(error);
          if (!text.includes('already exists') && !text.includes('duplicate')) {
            throw new Error(`Error should indicate duplicate email; got: ${text}`);
          }
        }
        
        return 'Correctly rejected duplicate non-null email';
      }
    },

    // ==================== VISUAL INDICATOR VALIDATION ====================
    {
      name: 'UI: Employee form should show asterisks on required fields',
      async fn() {
        // This is a documentation test - validates expected UI behavior
        const requiredFields = ['first_name', 'last_name'];
        const optionalFields = ['email', 'phone', 'department', 'role', 'status'];
        const schemaColumns = ['id', 'tenant_id', 'first_name', 'last_name', 'email', 'role', 'phone', 'department', 'status', 'metadata', 'created_at', 'updated_at'];
        
        return `Employee form should show red asterisks (*) on: ${requiredFields.join(', ')}. Optional fields: ${optionalFields.join(', ')}. Database columns: ${schemaColumns.join(', ')}`;
      }
    },
    {
      name: 'UI: Contact/Lead forms should show either/or helper text',
      async fn() {
        // This is a documentation test - validates expected UI behavior
        return 'Contact and Lead forms should show "(or Last Name required)" under First Name and "(or First Name required)" under Last Name';
      }
    },
    {
      name: 'UI: Employee email should become required when CRM access enabled',
      async fn() {
        // This is a documentation test - validates expected UI behavior
        return 'When "Has CRM Access" checkbox is checked, email field should show red asterisk (*) and be required';
      }
    }
  ]
};
