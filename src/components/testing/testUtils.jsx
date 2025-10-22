// Test utilities and assertion helpers

export class TestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TestError';
  }
}

export const assert = {
  equal(actual, expected, message = '') {
    if (actual !== expected) {
      throw new TestError(
        message || `Expected ${expected} but got ${actual}`
      );
    }
  },

  notEqual(actual, expected, message = '') {
    if (actual === expected) {
      throw new TestError(
        message || `Expected values to be different, but both were ${actual}`
      );
    }
  },

  true(value, message = '') {
    if (value !== true) {
      throw new TestError(
        message || `Expected true but got ${value}`
      );
    }
  },

  false(value, message = '') {
    if (value !== false) {
      throw new TestError(
        message || `Expected false but got ${value}`
      );
    }
  },

  truthy(value, message = '') {
    if (!value) {
      throw new TestError(
        message || `Expected truthy value but got ${value}`
      );
    }
  },

  falsy(value, message = '') {
    if (value) {
      throw new TestError(
        message || `Expected falsy value but got ${value}`
      );
    }
  },

  exists(value, message = '') {
    if (value === null || value === undefined) {
      throw new TestError(
        message || `Expected value to exist but got ${value}`
      );
    }
  },

  notExists(value, message = '') {
    if (value !== null && value !== undefined) {
      throw new TestError(
        message || `Expected value to not exist but got ${value}`
      );
    }
  },

  arrayIncludes(array, value, message = '') {
    if (!Array.isArray(array)) {
      throw new TestError('First argument must be an array');
    }
    if (!array.includes(value)) {
      throw new TestError(
        message || `Expected array to include ${value}`
      );
    }
  },

  arrayNotIncludes(array, value, message = '') {
    if (!Array.isArray(array)) {
      throw new TestError('First argument must be an array');
    }
    if (array.includes(value)) {
      throw new TestError(
        message || `Expected array to not include ${value}`
      );
    }
  },

  objectHasProperty(obj, property, message = '') {
    if (typeof obj !== 'object' || obj === null) {
      throw new TestError('First argument must be an object');
    }
    if (!(property in obj)) {
      throw new TestError(
        message || `Expected object to have property '${property}'`
      );
    }
  },

  async throws(fn, expectedError, message = '') {
    let threw = false;
    try {
      await fn();
    } catch (error) {
      threw = true;
      if (expectedError && error.message !== expectedError) {
        throw new TestError(
          message || `Expected error message '${expectedError}' but got '${error.message}'`
        );
      }
    }
    if (!threw) {
      throw new TestError(
        message || 'Expected function to throw an error'
      );
    }
  },

  async notThrows(fn, message = '') {
    try {
      await fn();
    } catch (error) {
      throw new TestError(
        message || `Expected function not to throw, but got: ${error.message}`
      );
    }
  },

  deepEqual(actual, expected, message = '') {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new TestError(
        message || `Expected ${expectedStr} but got ${actualStr}`
      );
    }
  }
};

// Mock helpers
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  full_name: 'Test User',
  role: 'user',
  tenant_id: 'test-tenant-id',
  employee_role: 'employee',
  ...overrides
});

export const createMockContact = (overrides = {}) => ({
  id: 'test-contact-id',
  tenant_id: 'test-tenant-id',
  first_name: 'John',
  last_name: 'Doe',
  email: 'john.doe@example.com',
  phone: '(555) 123-4567',
  status: 'active',
  created_date: new Date().toISOString(),
  ...overrides
});

export const createMockLead = (overrides = {}) => ({
  id: 'test-lead-id',
  tenant_id: 'test-tenant-id',
  first_name: 'Jane',
  last_name: 'Smith',
  email: 'jane.smith@example.com',
  phone: '(555) 987-6543',
  company: 'Test Company',
  status: 'new',
  source: 'website',
  created_date: new Date().toISOString(),
  ...overrides
});

export const createMockOpportunity = (overrides = {}) => ({
  id: 'test-opportunity-id',
  tenant_id: 'test-tenant-id',
  name: 'Test Opportunity',
  amount: 10000,
  stage: 'prospecting',
  probability: 10,
  close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  created_date: new Date().toISOString(),
  ...overrides
});

export const createMockAccount = (overrides = {}) => ({
  id: 'test-account-id',
  tenant_id: 'test-tenant-id',
  name: 'Test Account Inc.',
  type: 'customer',
  industry: 'information_technology',
  created_date: new Date().toISOString(),
  ...overrides
});

// Wait helper for async operations
export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Spy helper
export const createSpy = () => {
  const calls = [];
  const spy = (...args) => {
    calls.push(args);
    return spy.returnValue;
  };
  spy.calls = calls;
  spy.callCount = () => calls.length;
  spy.calledWith = (...expectedArgs) => {
    return calls.some(call => 
      JSON.stringify(call) === JSON.stringify(expectedArgs)
    );
  };
  spy.returnValue = undefined;
  spy.returns = (value) => {
    spy.returnValue = value;
    return spy;
  };
  return spy;
};