import express from 'express';

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

  // GET /api/notifications - List notifications
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, user_email } = req.query;
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let q = supabase
        .from('notifications')
        .select('*')
        .order('created_date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      if (user_email) q = q.eq('user_email', user_email);

      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const notifications = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          notifications,
          total: notifications.length,
          limit,
          offset
        }
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

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
      console.error('Error creating notification:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

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
      console.error('Error updating notification:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
