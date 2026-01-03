import express from 'express';
import { cacheList } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

export default function createNotificationRoutes(_pgPool) {
  const router = express.Router();

// Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata,
      metadata,
    };
  };

  /**
   * @openapi
   * /api/notifications:
   *   get:
   *     summary: List notifications
   *     description: Returns notifications for a tenant and/or user with pagination.
   *     tags: [notifications]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *       - in: query
   *         name: user_email
   *         schema:
   *           type: string
   *           format: email
   *         required: false
   *         description: Filter notifications for a specific user
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 200
   *         required: false
   *         description: Number of items to return (default 50)
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *         required: false
   *         description: Offset for pagination (default 0)
   *     responses:
   *       200:
   *         description: List of notifications
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // GET /api/notifications - List notifications
  router.get('/', cacheList('notifications', 60), async (req, res) => {
    try {
      const { user_email } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      // Enforce tenant isolation
      const tenant_id = req.tenant?.id || req.query.tenant_id;
      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase
        .from('notifications')
        .select('*', { count: 'exact' })  // Get accurate total count
        .eq('tenant_id', tenant_id);  // Always enforce tenant scoping

      if (user_email) q = q.eq('user_email', user_email);

      q = q.order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      const notifications = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          notifications,
          total: count || 0,  // Use accurate count from database
          limit,
          offset
        }
      });
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * @openapi
   * /api/notifications:
   *   post:
   *     summary: Create a notification
   *     description: Creates a notification record for a tenant/user.
   *     tags: [notifications]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               user_email:
   *                 type: string
   *                 format: email
   *               title:
   *                 type: string
   *               message:
   *                 type: string
   *               type:
   *                 type: string
   *                 enum: [info, warning, error, success]
   *               is_read:
   *                 type: boolean
   *               metadata:
   *                 type: object
   *     responses:
   *       201:
   *         description: Notification created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/notifications - Create notification
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, user_email, title, message, type, is_read, metadata, ...otherFields } = req.body;

      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields
      };

      const nowIso = new Date().toISOString();
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('notifications')
        .insert([
          {
            tenant_id,
            user_email,
            title,
            message,
            type: type || 'info',
            is_read: is_read || false,
            metadata: combinedMetadata,
            created_date: nowIso,
            created_at: nowIso,
          }
        ])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      const notification = expandMetadata(data);

      res.status(201).json({
        status: 'success',
        data: notification
      });
    } catch (error) {
      logger.error('Error creating notification:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  /**
   * @openapi
   * /api/notifications/{id}:
   *   put:
   *     summary: Update a notification
   *     description: Updates notification read status and/or metadata.
   *     tags: [notifications]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               is_read:
   *                 type: boolean
   *               metadata:
   *                 type: object
   *     responses:
   *       200:
   *         description: Notification updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       404:
   *         description: Notification not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // PUT /api/notifications/:id - Update notification (mark as read)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { is_read, metadata, ...otherFields } = req.body;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Fetch current metadata
      const { data: current, error: fetchErr } = await supabase
        .from('notifications')
        .select('metadata, is_read')
        .eq('id', id)
        .single();
      if (fetchErr?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Notification not found' });
      }
      if (fetchErr) throw new Error(fetchErr.message);

      const currentMetadata = current?.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...otherFields,
      };

      const payload = { metadata: updatedMetadata };
      if (typeof is_read !== 'undefined') payload.is_read = is_read;

      const { data, error } = await supabase
        .from('notifications')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Notification not found' });
      }
      if (error) throw new Error(error.message);

      const updatedNotification = expandMetadata(data);

      res.json({
        status: 'success',
        data: updatedNotification
      });
    } catch (error) {
      logger.error('Error updating notification:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
