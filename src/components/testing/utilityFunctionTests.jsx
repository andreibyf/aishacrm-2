import { assert, wait } from './testUtils';

// Test phone number formatting
const formatPhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return phone;
  let cleaned = phone.replace(/\D/g, '');
  if (!cleaned) return '';
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    cleaned = cleaned.slice(1);
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

// Test email validation
const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

// Test tenant filter generation
const getTenantFilter = (user, selectedTenantId) => {
  if (user?.role === 'superadmin') {
    return selectedTenantId ? { tenant_id: selectedTenantId } : {};
  }
  return user?.tenant_id ? { tenant_id: user.tenant_id } : null;
};

export const utilityFunctionTests = {
  name: 'Utility Functions',
  tests: [
    {
      name: 'formatPhoneNumber should format 10-digit numbers',
      fn: async () => {
        const result = formatPhoneNumber('5551234567');
        assert.equal(result, '(555) 123-4567');
      }
    },
    {
      name: 'formatPhoneNumber should handle 11-digit numbers with leading 1',
      fn: async () => {
        const result = formatPhoneNumber('15551234567');
        assert.equal(result, '(555) 123-4567');
      }
    },
    {
      name: 'formatPhoneNumber should preserve already formatted numbers',
      fn: async () => {
        const formatted = '(555) 123-4567';
        const result = formatPhoneNumber(formatted);
        assert.equal(result, formatted);
      }
    },
    {
      name: 'formatPhoneNumber should handle invalid input gracefully',
      fn: async () => {
        assert.equal(formatPhoneNumber(null), null);
        assert.equal(formatPhoneNumber(undefined), undefined);
        assert.equal(formatPhoneNumber(''), '');
        // When input has no digits, function returns empty string
        assert.equal(formatPhoneNumber('abc'), '');
        // Partially valid numbers that aren't 10 digits are returned as-is
        assert.equal(formatPhoneNumber('555-123'), '555-123');
      }
    },
    {
      name: 'isValidEmail should validate correct email formats',
      fn: async () => {
        assert.true(isValidEmail('test@example.com'));
        assert.true(isValidEmail('user.name@domain.co.uk'));
        assert.true(isValidEmail('test+tag@example.com'));
      }
    },
    {
      name: 'isValidEmail should reject invalid email formats',
      fn: async () => {
        assert.false(isValidEmail('notanemail'));
        assert.false(isValidEmail('missing@domain'));
        assert.false(isValidEmail('@domain.com'));
        assert.false(isValidEmail('user@'));
        assert.false(isValidEmail(''));
      }
    },
    {
      name: 'getTenantFilter should return selectedTenantId for superadmin',
      fn: async () => {
        const user = { role: 'superadmin', tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69' };
        const result = getTenantFilter(user, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
        
        assert.deepEqual(result, { tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46' });
      }
    },
    {
      name: 'getTenantFilter should return user tenant_id for non-superadmin',
      fn: async () => {
        const user = { role: 'user', tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69' };
        const result = getTenantFilter(user, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
        
        assert.deepEqual(result, { tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69' });
      }
    },
    {
      name: 'getTenantFilter should return empty object for superadmin without selection',
      fn: async () => {
        const user = { role: 'superadmin', tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69' };
        const result = getTenantFilter(user, null);
        
        assert.deepEqual(result, {});
      }
    },
    {
      name: 'getTenantFilter should return null for user without tenant_id',
      fn: async () => {
        const user = { role: 'user', tenant_id: null };
        const result = getTenantFilter(user, null);
        
        assert.equal(result, null);
      }
    },
    {
      name: 'wait helper should delay execution',
      fn: async () => {
        const start = Date.now();
        await wait(100);
        const duration = Date.now() - start;
        
        assert.true(duration >= 100, `Expected duration >= 100ms, got ${duration}ms`);
        assert.true(duration < 150, `Expected duration < 150ms, got ${duration}ms`);
      }
    }
  ]
};