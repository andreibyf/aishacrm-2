/**
 * User Routes
 * User authentication and management with full CRUD
 */

import express from 'express';

export default function createUserRoutes(pgPool) {
  const router = express.Router();

  // GET /api/users - List users
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query(
        'SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at FROM users WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [tenant_id, parseInt(limit), parseInt(offset)]
      );

      const countResult = await pgPool.query(
        'SELECT COUNT(*) FROM users WHERE tenant_id = $1',
        [tenant_id]
      );

      res.json({
        status: 'success',
        data: {
          users: result.rows,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      console.error('Error listing users:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/users/:id - Get single user
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query(
        'SELECT id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at FROM users WHERE id = $1 AND tenant_id = $2',
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

  // POST /api/users/register - User registration
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

  // PUT /api/users/:id - Update user
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, first_name, last_name, role, status, metadata } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query(
        `UPDATE users 
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             role = COALESCE($3, role),
             status = COALESCE($4, status),
             metadata = COALESCE($5, metadata),
             updated_at = NOW()
         WHERE id = $6 AND tenant_id = $7
         RETURNING id, tenant_id, email, first_name, last_name, role, status, metadata, updated_at`,
        [first_name, last_name, role, status, metadata, id, tenant_id]
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

  // DELETE /api/users/:id - Delete user
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query(
        'DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id, email',
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
