import { assert, createMockUser } from './testUtils';

// Simulated employee scope logic
const canViewAllRecords = (user) => {
  if (!user) return false;
  if (user.role === 'superadmin' || user.role === 'admin') return true;
  if (user.employee_role === 'manager') return true;
  if (user.role === 'power-user') return true;
  return false;
};

const getFilter = (user, baseFilter = {}) => {
  if (!user) return baseFilter;
  
  if (canViewAllRecords(user)) {
    return { ...baseFilter };
  }
  
  return {
    ...baseFilter,
    $or: [
      { created_by: user.email },
      { assigned_to: user.email }
    ]
  };
};

export const employeeScopeTests = {
  name: 'Employee Scope',
  tests: [
    {
      name: 'Admin should view all records',
      fn: async () => {
        const admin = createMockUser({ role: 'admin' });
        assert.true(canViewAllRecords(admin));
      }
    },
    {
      name: 'Superadmin should view all records',
      fn: async () => {
        const superadmin = createMockUser({ role: 'superadmin' });
        assert.true(canViewAllRecords(superadmin));
      }
    },
    {
      name: 'Manager should view all records',
      fn: async () => {
        const manager = createMockUser({ role: 'user', employee_role: 'manager' });
        assert.true(canViewAllRecords(manager));
      }
    },
    {
      name: 'Power-user should view all records',
      fn: async () => {
        const powerUser = createMockUser({ role: 'power-user' });
        assert.true(canViewAllRecords(powerUser));
      }
    },
    {
      name: 'Employee should NOT view all records',
      fn: async () => {
        const employee = createMockUser({ role: 'user', employee_role: 'employee' });
        assert.false(canViewAllRecords(employee));
      }
    },
    {
      name: 'Employee filter should include $or clause',
      fn: async () => {
        const employee = createMockUser({ 
          role: 'user', 
          employee_role: 'employee',
          email: 'employee@test.com'
        });
        
        const filter = getFilter(employee, { tenant_id: 'test-tenant' });
        
        assert.exists(filter.$or);
        assert.equal(filter.$or.length, 2);
        assert.deepEqual(filter.$or[0], { created_by: 'employee@test.com' });
        assert.deepEqual(filter.$or[1], { assigned_to: 'employee@test.com' });
      }
    },
    {
      name: 'Admin filter should NOT include $or clause',
      fn: async () => {
        const admin = createMockUser({ role: 'admin' });
        const filter = getFilter(admin, { tenant_id: 'test-tenant' });
        
        assert.notExists(filter.$or);
        assert.equal(filter.tenant_id, 'test-tenant');
      }
    },
    {
      name: 'Manager filter should NOT include $or clause',
      fn: async () => {
        const manager = createMockUser({ 
          role: 'user', 
          employee_role: 'manager' 
        });
        const filter = getFilter(manager, { tenant_id: 'test-tenant' });
        
        assert.notExists(filter.$or);
      }
    },
    {
      name: 'Empty user should return base filter only',
      fn: async () => {
        const filter = getFilter(null, { tenant_id: 'test-tenant' });
        
        assert.deepEqual(filter, { tenant_id: 'test-tenant' });
      }
    }
  ]
};