/**
 * Backend API Schema Validation Tests
 * Tests that database accepts minimal required fields for all entities
 */

import { test as base, expect } from '@playwright/test';

const BASE_API_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';

async function expectOk(response) {
  const status = response.status();
  const body = await safeJson(response);
  if (status < 200 || status >= 300) {
    console.error('API TEST FAILURE:', { status, body });
  }
  expect(status).toBeGreaterThanOrEqual(200);
  expect(status).toBeLessThan(300);
  return body;
}

async function expectStatus(response, expected) {
  const status = response.status();
  const body = await safeJson(response);
  if (status !== expected) {
    console.error('API TEST FAILURE:', { status, expected, body });
  }
  expect(status).toBe(expected);
  return body;
}

async function safeJson(response) {
  try { return await response.json(); } catch { return await response.text(); }
}
const TEST_TENANT_ID = 'local-tenant-001';
const authFile = 'playwright/.auth/superadmin.json';

// Extend test with API context
const test = base.extend({
  apiContext: async ({ playwright }, inner) => {
    const context = await playwright.request.newContext({
      // Important: ensure trailing slash so relative paths like 'employees'
      // resolve to '/api/employees' instead of '/employees'
      baseURL: `${BASE_API_URL}/api/`,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
      },
      // Use authenticated session for API requests
      storageState: authFile,
    });
  await inner(context);
    await context.dispose();
  },
});

test.describe('Backend API Schema Validation', () => {

  test.describe('Employee API Tests', () => {
    
    test('should accept employee with minimal required fields', async ({ apiContext }) => {
      const response = await apiContext.post('employees', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'MinimalTest',
          last_name: 'Employee',
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
      expect(data.data.employee).toHaveProperty('id');
      expect(data.data.employee.first_name).toBe('MinimalTest');
      expect(data.data.employee.last_name).toBe('Employee');
    });

    test('should accept employee without email when CRM access disabled', async ({ apiContext }) => {
      const response = await apiContext.post('employees', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NoEmail',
          last_name: 'Employee',
          email: null,
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
    });

    test('should store additional fields in metadata', async ({ apiContext }) => {
      const response = await apiContext.post('employees', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'Metadata',
          last_name: 'Test',
          department: 'Sales',
          job_title: 'Sales Rep',
          phone: '555-1234',
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
      
      // Check that additional fields are in metadata
      const employee = data.data.employee;
      expect(employee.metadata).toHaveProperty('department', 'Sales');
      expect(employee.metadata).toHaveProperty('job_title', 'Sales Rep');
      expect(employee.metadata).toHaveProperty('phone', '555-1234');
    });

    test('should reject employee without tenant_id', async ({ apiContext }) => {
      const response = await apiContext.post('employees', {
        data: {
          first_name: 'NoTenant',
          last_name: 'Employee',
        },
      });
      const data = await expectStatus(response, 400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('tenant_id');
    });

    test('should reject employee without first_name', async ({ apiContext }) => {
      const response = await apiContext.post('employees', {
        data: {
          tenant_id: TEST_TENANT_ID,
          last_name: 'Employee',
        },
      });
      const data = await expectStatus(response, 400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('first_name');
    });

    test('should reject employee without last_name', async ({ apiContext }) => {
      const response = await apiContext.post('employees', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NoLast',
        },
      });
      const data = await expectStatus(response, 400);
      expect(data.status).toBe('error');
      expect(data.message).toContain('last_name');
    });
  });

  test.describe('Account API Tests', () => {
    
    test('should accept account with minimal required fields', async ({ apiContext }) => {
      const response = await apiContext.post('accounts', {
        data: {
          tenant_id: TEST_TENANT_ID,
          name: `Minimal Account ${Date.now()}`,
        },
      });
      const data = await expectOk(response);
  expect(data.status).toBe('success');
  // Account route returns the row under `data`
  expect(data.data).toHaveProperty('id');
  expect(data.data.name).toContain('Minimal Account');
    });

    test('should accept account without email', async ({ apiContext }) => {
      const response = await apiContext.post('accounts', {
        data: {
          tenant_id: TEST_TENANT_ID,
          name: `No Email Account ${Date.now()}`,
          email: null,
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
    });

    test('should reject account without name', async ({ apiContext }) => {
      const response = await apiContext.post('accounts', {
        data: {
          tenant_id: TEST_TENANT_ID,
        },
      });
      const data = await expectStatus(response, 400);
      expect(data.status).toBe('error');
    });
  });

  test.describe('Contact API Tests', () => {
    
    test('should accept contact with first_name and last_name (both required)', async ({ apiContext }) => {
      const response = await apiContext.post('contacts', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'FirstOnly',
          last_name: 'LastOnly'
        },
      });
      const data = await expectOk(response);
  expect(data.status).toBe('success');
  // Contact route returns row under `data.contact`
  expect(data.data.contact.first_name).toBe('FirstOnly');
  expect(data.data.contact.last_name).toBe('LastOnly');
    });

    test('should reject contact missing last_name', async ({ apiContext }) => {
      const response = await apiContext.post('contacts', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NoLast'
        },
      });
      const data = await expectStatus(response, 400);
      expect(data.message).toContain('last_name');
    });

    test('should reject contact missing first_name', async ({ apiContext }) => {
      const response = await apiContext.post('contacts', {
        data: {
          tenant_id: TEST_TENANT_ID,
          last_name: 'NoFirst'
        },
      });
      const data = await expectStatus(response, 400);
      expect(data.message).toContain('first_name');
    });

    test('should accept contact with both names', async ({ apiContext }) => {
      const response = await apiContext.post('contacts', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'Both',
          last_name: 'Names',
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
    });

    test('should accept contact without email', async ({ apiContext }) => {
      const response = await apiContext.post('contacts', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NoEmail',
          last_name: 'Contact',
          email: null,
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
    });
  });

  test.describe('Lead API Tests', () => {
    
    test('should accept lead with first_name and last_name (both required)', async ({ apiContext }) => {
      const response = await apiContext.post('leads', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'LeadFirst',
          last_name: 'LeadLast'
        },
      });
      const data = await expectOk(response);
  expect(data.status).toBe('success');
  // Lead route returns row under `data.lead`
  expect(data.data.lead.first_name).toBe('LeadFirst');
  expect(data.data.lead.last_name).toBe('LeadLast');
    });

    test('should reject lead missing last_name', async ({ apiContext }) => {
      const response = await apiContext.post('leads', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NoLast'
        },
      });
      const data = await expectStatus(response, 400);
      expect(data.message).toContain('last_name');
    });

    test('should reject lead missing first_name', async ({ apiContext }) => {
      const response = await apiContext.post('leads', {
        data: {
          tenant_id: TEST_TENANT_ID,
          last_name: 'NoFirst'
        },
      });
      const data = await expectStatus(response, 400);
      expect(data.message).toContain('first_name');
    });

    test('should accept lead without email', async ({ apiContext }) => {
      const response = await apiContext.post('leads', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NoEmail',
          last_name: 'Lead',
          email: null,
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
    });

    test('should accept lead without company', async ({ apiContext }) => {
      const response = await apiContext.post('leads', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NoCompany',
          last_name: 'Lead',
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
    });
  });

  test.describe('Opportunity API Tests', () => {
    
    test('should accept opportunity with minimal required fields', async ({ apiContext }) => {
      const response = await apiContext.post('opportunities', {
        data: {
          tenant_id: TEST_TENANT_ID,
          name: `Minimal Opportunity ${Date.now()}`,
        },
      });
      const data = await expectOk(response);
  expect(data.status).toBe('success');
  // Opportunity route returns row under `data`
  expect(data.data).toHaveProperty('id');
  expect(data.data.name).toContain('Minimal Opportunity');
    });

    test('should accept opportunity without amount', async ({ apiContext }) => {
      const response = await apiContext.post('opportunities', {
        data: {
          tenant_id: TEST_TENANT_ID,
          name: `No Amount Opp ${Date.now()}`,
          amount: null,
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
    });

    test('should accept opportunity without close_date', async ({ apiContext }) => {
      const response = await apiContext.post('opportunities', {
        data: {
          tenant_id: TEST_TENANT_ID,
          name: `No Date Opp ${Date.now()}`,
          close_date: null,
        },
      });
      const data = await expectOk(response);
      expect(data.status).toBe('success');
    });

    test('should reject opportunity without name', async ({ apiContext }) => {
      const response = await apiContext.post('opportunities', {
        data: {
          tenant_id: TEST_TENANT_ID,
        },
      });
      // Backend currently surfaces DB constraint error as 500
      const data = await expectStatus(response, 500);
      expect(data.status).toBe('error');
    });
    });

  test.describe('Email Uniqueness Tests', () => {
    
    test('should allow multiple employees with NULL email', async ({ apiContext }) => {
      const response1 = await apiContext.post('employees', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NullEmail1',
          last_name: 'Employee',
          email: null,
        },
      });
      const response2 = await apiContext.post('employees', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NullEmail2',
          last_name: 'Employee',
          email: null,
        },
      });
      await expectOk(response1);
      await expectOk(response2);
    });

    test('should allow multiple contacts with NULL email', async ({ apiContext }) => {
      const response1 = await apiContext.post('contacts', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NullEmail1',
          last_name: 'Contact',
          email: null,
        },
      });
      const response2 = await apiContext.post('contacts', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'NullEmail2',
          last_name: 'Contact',
          email: null,
        },
      });
      await expectOk(response1);
      await expectOk(response2);
    });

    test('should reject duplicate non-null email', async ({ apiContext }) => {
      const uniqueEmail = `duplicate${Date.now()}@test.com`;
      
      const response1 = await apiContext.post('employees', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'First',
          last_name: 'Employee',
          email: uniqueEmail,
        },
      });
      const response2 = await apiContext.post('employees', {
        data: {
          tenant_id: TEST_TENANT_ID,
          first_name: 'Second',
          last_name: 'Employee',
          email: uniqueEmail,
        },
      });
      await expectOk(response1);
      // Backend surfaces unique violation as 500
      const data2 = await expectStatus(response2, 500);
      expect(data2.message).toContain('already exists');
    });
  });
});
