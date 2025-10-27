/**
 * User Routes
 * User authentication and management with full CRUD
 */

import express from 'express';
import { createAuthUser, deleteAuthUser, sendPasswordResetEmail } from '../lib/supabaseAuth.js';

export default function createUserRoutes(pgPool, supabaseAuth) {
  const router = express.Router();

  // Helper function to expand metadata fields to top-level properties
  // Helper function to expand metadata fields to top-level properties
  const expandUserMetadata = (user) => {
    if (!user) return user;
    const { metadata = {}, ...rest } = user;
    
    // Convert NULL tenant_id to 'none' for "No Client"
    const tenant_id = rest.tenant_id === null ? 'none' : rest.tenant_id;
    
    return {
      ...rest,
      tenant_id, // Use 'none' instead of null
      ...metadata, // Spread ALL metadata fields to top level
      metadata, // Keep original metadata for backwards compatibility
    };
  };

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
        
        // Expand metadata fields for each user
        allUsers = employeeResult.rows.map(expandUserMetadata);
        
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
        
        // Combine both - global users first, then employees, and expand metadata
        allUsers = [...globalUsersResult.rows, ...employeesResult.rows].map(expandUserMetadata);
        
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

      // tenant_id is optional - allow querying users without tenant (tenant_id='none' or NULL)
      let query, params;
      if (tenant_id !== undefined && tenant_id !== 'null') {
        query = 'SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at FROM employees WHERE id = $1 AND tenant_id = $2';
        params = [id, tenant_id];
      } else {
        query = 'SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at FROM employees WHERE id = $1';
        params = [id];
      }

      const result = await pgPool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      // Expand metadata to top-level properties
      const user = expandUserMetadata(result.rows[0]);

      res.json({
        status: 'success',
        data: { user },
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
      const { email, first_name, last_name, role, tenant_id, status, metadata, password, ...otherFields } = req.body;

      if (!email || !first_name) {
        return res.status(400).json({ status: 'error', message: 'email and first_name are required' });
      }

      // ⚠️ CRITICAL: Admin role MUST be assigned to a tenant (not global)
      if (role === 'admin' && !tenant_id) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Admin users must be assigned to a tenant. Only superadmins can be global users.' 
        });
      }

      // Merge metadata with unknown fields
      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields
      };

      // Only superadmin can be global (no tenant_id)
      const isGlobalUser = role === 'superadmin' && !tenant_id;

      // Use default password or custom password
      const userPassword = password || process.env.DEFAULT_USER_PASSWORD || 'Welcome2024!';
      let authUserId = null;

      if (isGlobalUser) {
        // Create global superadmin in users table (no tenant_id)
        // Check if user already exists
        const existingUser = await pgPool.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (existingUser.rows.length > 0) {
          return res.status(409).json({ status: 'error', message: 'User already exists' });
        }

        // Create Supabase Auth user
        const authMetadata = {
          first_name,
          last_name,
          role,
          display_name: `${first_name} ${last_name || ''}`.trim()
        };
        
        const { user: authUser, error: authError } = await createAuthUser(email, userPassword, authMetadata);
        
        if (authError) {
          console.error('[User Creation] Supabase Auth error:', authError);
          return res.status(500).json({ 
            status: 'error', 
            message: `Failed to create auth user: ${authError.message}` 
          });
        }

        authUserId = authUser?.id;

        const result = await pgPool.query(
          `INSERT INTO users (email, first_name, last_name, role, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id, email, first_name, last_name, role, metadata, created_at, updated_at`,
          [email, first_name, last_name, role, combinedMetadata]
        );

        const user = expandUserMetadata(result.rows[0]);

        res.json({
          status: 'success',
          message: 'Global superadmin created successfully',
          data: { 
            user,
            auth: {
              created: !!authUserId,
              password: userPassword,
              password_expires_hours: 24,
              must_change_password: true
            }
          },
        });
      } else if (role === 'admin' && tenant_id) {
        // Create tenant-scoped admin in users table WITH tenant_id
        // Check if user already exists
        const existingUser = await pgPool.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );

        if (existingUser.rows.length > 0) {
          return res.status(409).json({ status: 'error', message: 'User already exists' });
        }

        // Create Supabase Auth user
        const authMetadata = {
          first_name,
          last_name,
          role: 'admin',
          tenant_id,
          display_name: `${first_name} ${last_name || ''}`.trim()
        };
        
        const { user: authUser, error: authError } = await createAuthUser(email, userPassword, authMetadata);
        
        if (authError) {
          console.error('[User Creation] Supabase Auth error:', authError);
          return res.status(500).json({ 
            status: 'error', 
            message: `Failed to create auth user: ${authError.message}` 
          });
        }

        authUserId = authUser?.id;

        const result = await pgPool.query(
          `INSERT INTO users (email, first_name, last_name, role, tenant_id, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING id, email, first_name, last_name, role, tenant_id, metadata, created_at, updated_at`,
          [email, first_name, last_name, 'admin', tenant_id, combinedMetadata]
        );

        const user = expandUserMetadata(result.rows[0]);

        res.json({
          status: 'success',
          message: 'Tenant admin created successfully',
          data: { 
            user,
            auth: {
              created: !!authUserId,
              password: userPassword,
              password_expires_hours: 24,
              must_change_password: true
            }
          },
        });
      } else {
        // Create manager/employee in employees table (tenant-assigned user)
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

        // Create Supabase Auth user
        const authMetadata = {
          first_name,
          last_name,
          role: role || 'employee',
          tenant_id,
          display_name: `${first_name} ${last_name || ''}`.trim()
        };
        
        const { user: authUser, error: authError } = await createAuthUser(email, userPassword, authMetadata);
        
        if (authError) {
          console.error('[User Creation] Supabase Auth error:', authError);
          return res.status(500).json({ 
            status: 'error', 
            message: `Failed to create auth user: ${authError.message}` 
          });
        }

        authUserId = authUser?.id;

        const result = await pgPool.query(
          `INSERT INTO employees (tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           RETURNING id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at`,
          [tenant_id, email, first_name, last_name, role || 'employee', status || 'active', combinedMetadata]
        );

        const user = expandUserMetadata(result.rows[0]);

        res.json({
          status: 'success',
          message: 'Employee created successfully',
          data: { 
            user,
            auth: {
              created: !!authUserId,
              password: userPassword,
              password_expires_hours: 24,
              must_change_password: true
            }
          },
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
        navigation_permissions,
        ...otherFields  // Capture any unknown fields
      } = req.body;

      // First, get the current user to merge metadata (don't require tenant_id in body)
      const currentUser = await pgPool.query(
        'SELECT metadata, tenant_id FROM employees WHERE id = $1',
        [id]
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
        ...otherFields, // Include any unknown fields in metadata
      };

      // Allow NULL tenant_id for users without a client
      const finalTenantId = tenant_id !== undefined ? tenant_id : currentUser.rows[0].tenant_id;

      const result = await pgPool.query(
        `UPDATE employees 
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             role = COALESCE($3, role),
             status = COALESCE($4, status),
             tenant_id = $5,
             metadata = $6,
             updated_at = NOW()
         WHERE id = $7
         RETURNING id, tenant_id, email, first_name, last_name, role, status, metadata, updated_at`,
        [first_name, last_name, role, status, finalTenantId, updatedMetadata, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      // Expand metadata to top-level properties
      const updatedUser = expandUserMetadata(result.rows[0]);

      res.json({
        status: 'success',
        message: 'User updated',
        data: { user: updatedUser },
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

      // First get user email to delete from auth
      let getUserQuery, getUserParams;
      
      if (tenant_id !== undefined && tenant_id !== 'null') {
        getUserQuery = 'SELECT id, email FROM employees WHERE id = $1 AND tenant_id = $2';
        getUserParams = [id, tenant_id];
      } else {
        getUserQuery = 'SELECT id, email FROM employees WHERE id = $1';
        getUserParams = [id];
      }
      
      const userResult = await pgPool.query(getUserQuery, getUserParams);
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }
      
      const userEmail = userResult.rows[0].email;

      // Delete from Supabase Auth
      try {
        const { user: authUsers } = await import('../lib/supabaseAuth.js').then(m => m.getAuthUserByEmail(userEmail));
        if (authUsers?.id) {
          await deleteAuthUser(authUsers.id);
          console.log(`✓ Deleted auth user: ${userEmail}`);
        }
      } catch (authError) {
        console.warn(`⚠ Could not delete auth user ${userEmail}:`, authError.message);
        // Continue with database deletion even if auth deletion fails
      }

      // Allow deletion with or without tenant_id
      let query, params;
      
      if (tenant_id !== undefined && tenant_id !== 'null') {
        query = 'DELETE FROM employees WHERE id = $1 AND tenant_id = $2 RETURNING id, email';
        params = [id, tenant_id];
      } else {
        query = 'DELETE FROM employees WHERE id = $1 RETURNING id, email';
        params = [id];
      }

      const result = await pgPool.query(query, params);

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

  // POST /api/users/reset-password - Send password reset email
  router.post('/reset-password', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ status: 'error', message: 'email is required' });
      }

      const { data, error } = await sendPasswordResetEmail(email);

      if (error) {
        console.error('[Password Reset] Error:', error);
        return res.status(500).json({ 
          status: 'error', 
          message: `Failed to send reset email: ${error.message}` 
        });
      }

      res.json({
        status: 'success',
        message: 'Password reset email sent',
        data,
      });
    } catch (error) {
      console.error('Error sending password reset:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
