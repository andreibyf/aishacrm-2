/**
 * User Routes
 * User authentication and management with full CRUD
 */

import express from 'express';

export default function createUserRoutes(pgPool) {
  const router = express.Router();

  // GET /api/users - List users (combines global users + tenant employees)
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0 } = req.query;

      let allUsers = [];
      
      if (tenant_id) {
        // Filter by specific tenant - only return employees for that tenant
        const employeeQuery = 'SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at, \'employee\' as user_type FROM employees WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3';
        const employeeResult = await pgPool.query(employeeQuery, [tenant_id, parseInt(limit), parseInt(offset)]);
        
        const countQuery = 'SELECT COUNT(*) FROM employees WHERE tenant_id = $1';
        const countResult = await pgPool.query(countQuery, [tenant_id]);
        
        allUsers = employeeResult.rows;
        
        res.json({
          status: 'success',
          data: {
            users: allUsers,
            total: parseInt(countResult.rows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset),
          },
        });
      } else {
        // No tenant filter - return global users (superadmins/admins) + all employees
        // Get global users from users table (superadmins, admins with no tenant assignment)
        const globalUsersQuery = 'SELECT id, NULL as tenant_id, email, first_name, last_name, role, \'active\' as status, metadata, created_at, updated_at, \'global\' as user_type FROM users WHERE role IN (\'superadmin\', \'admin\') ORDER BY created_at DESC';
        const globalUsersResult = await pgPool.query(globalUsersQuery);
        
        // Get all employees FROM employees table
        const employeesQuery = 'SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at, \'employee\' as user_type FROM employees ORDER BY created_at DESC LIMIT $1 OFFSET $2';
        const employeesResult = await pgPool.query(employeesQuery, [parseInt(limit), parseInt(offset)]);
        
        // Combine both - global users first, then employees
        allUsers = [...globalUsersResult.rows, ...employeesResult.rows];
        
        // Sort by created_at desc
        allUsers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        res.json({
          status: 'success',
          data: {
            users: allUsers,
            total: globalUsersResult.rows.length + employeesResult.rows.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
          },
        });
      }
    } catch (error) {
      console.error('Error listing users:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/users/:id - Get single user (actually queries employees table)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query(
        'SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at FROM employees WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      res.json({
        status: 'success',
        data: { user: result.rows[0] },
      });
    } catch (error) {
      console.error('Error getting user:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/users/login - User login (basic implementation)
  router.post('/login', async (req, res) => {
    try {
      const { email, password: _password } = req.body;

      if (!email) {
        return res.status(400).json({ status: 'error', message: 'email is required' });
      }

      // Note: In production, verify password hash with bcrypt
      const result = await pgPool.query(
        'SELECT id, tenant_id, email, first_name, last_name, role, status FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
      }

      // TODO: Implement JWT token generation
      res.json({
        status: 'success',
        message: 'Login successful',
        data: { 
          user: result.rows[0],
          token: 'TODO_implement_jwt'
        },
      });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/users - Create new user (global admin or tenant employee)
  router.post('/', async (req, res) => {
    try {
      const { email, first_name, last_name, role, tenant_id, status, metadata } = req.body;

      if (!email || !first_name) {
        return res.status(400).json({ status: 'error', message: 'email and first_name are required' });
      }

      const isGlobalUser = (role === 'superadmin' || role === 'admin') && !tenant_id;

      if (isGlobalUser) {
        // Create global user in users table
        // Check if user already exists
        const existingUser = await pgPool.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (existingUser.rows.length > 0) {
          return res.status(409).json({ status: 'error', message: 'User already exists' });
        }

        const result = await pgPool.query(
          `INSERT INTO users (email, first_name, last_name, role, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id, email, first_name, last_name, role, metadata, created_at, updated_at`,
          [email, first_name, last_name, role || 'admin', JSON.stringify(metadata || {})]
        );

        res.json({
          status: 'success',
          message: 'Global user created successfully',
          data: { user: result.rows[0] },
        });
      } else {
        // Create employees (tenant-assigned user)
        if (!tenant_id) {
          return res.status(400).json({ status: 'error', message: 'tenant_id is required for non-admin users' });
        }

        // Check if employees already exists for this tenant
        const existingEmployee = await pgPool.query(
          'SELECT id FROM employees WHERE email = $1 AND tenant_id = $2',
          [email, tenant_id]
        );

        if (existingEmployee.rows.length > 0) {
          return res.status(409).json({ status: 'error', message: 'Employee already exists for this tenant' });
        }

        const result = await pgPool.query(
          `INSERT INTO employees (tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           RETURNING id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at`,
          [tenant_id, email, first_name, last_name, role || 'employee', status || 'active', JSON.stringify(metadata || {})]
        );

        res.json({
          status: 'success',
          message: 'Employee created successfully',
          data: { user: result.rows[0] },
        });
      }
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/users/register - User registration (legacy endpoint)
  router.post('/register', async (req, res) => {
    try {
      const { tenant_id, email, password: _password, first_name, last_name, role = 'user' } = req.body;

      if (!tenant_id || !email) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and email are required' });
      }

      // Check if user already exists
      const existingUser = await pgPool.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ status: 'error', message: 'User already exists' });
      }

      // Note: In production, hash password with bcrypt before storing
      const result = await pgPool.query(
        `INSERT INTO users (tenant_id, email, first_name, last_name, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())
         RETURNING id, tenant_id, email, first_name, last_name, role, status`,
        [tenant_id, email, first_name, last_name, role]
      );

      res.json({
        status: 'success',
        message: 'Registration successful',
        data: { user: result.rows[0] },
      });
    } catch (error) {
      console.error('Error registering user:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/users/profile - Get user profile (requires auth in production)
  router.get('/profile', async (req, res) => {
    try {
      const { email, tenant_id } = req.query;

      if (!email || !tenant_id) {
        return res.status(400).json({ status: 'error', message: 'email and tenant_id are required' });
      }

      const result = await pgPool.query(
        'SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at FROM users WHERE email = $1 AND tenant_id = $2',
        [email, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      res.json({
        status: 'success',
        data: { user: result.rows[0] },
      });
    } catch (error) {
      console.error('Error getting profile:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/users/:id - Update user (actually updates employees table)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { 
        tenant_id, 
        first_name, 
        last_name, 
        role, 
        status, 
        metadata,
        display_name,
        is_active,
        tags,
        employee_role,
        permissions,
        navigation_permissions
      } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // First, get the current user to merge metadata
      const currentUser = await pgPool.query(
        'SELECT metadata FROM employees WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
      );

      if (currentUser.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      // Merge metadata - preserve existing metadata and add/update new fields
      const currentMetadata = currentUser.rows[0].metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...(display_name !== undefined && { display_name }),
        ...(is_active !== undefined && { is_active }),
        ...(tags !== undefined && { tags }),
        ...(employee_role !== undefined && { employee_role }),
        ...(permissions !== undefined && { permissions }),
        ...(navigation_permissions !== undefined && { navigation_permissions }),
      };

      const result = await pgPool.query(
        `UPDATE employees 
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             role = COALESCE($3, role),
             status = COALESCE($4, status),
             metadata = $5,
             updated_at = NOW()
         WHERE id = $6 AND tenant_id = $7
         RETURNING id, tenant_id, email, first_name, last_name, role, status, metadata, updated_at`,
        [first_name, last_name, role, status, updatedMetadata, id, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      res.json({
        status: 'success',
        message: 'User updated',
        data: { user: result.rows[0] },
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/users/:id - Delete user (actually deletes FROM employees table)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query(
        'DELETE FROM employees WHERE id = $1 AND tenant_id = $2 RETURNING id, email',
        [id, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      res.json({
        status: 'success',
        message: 'User deleted',
        data: { user: result.rows[0] },
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
