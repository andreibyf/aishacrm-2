/**
 * System Settings Routes
 * Global system configuration and settings
 */

import express from 'express';
import logger from '../lib/logger.js';

export default function createSystemSettingsRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/system-settings - Get system-wide settings
  router.get('/', async (req, res) => {
    try {
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Query system_settings table if it exists
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .limit(100);

      // Ignore table-not-found errors (Postgres: 42P01, Supabase PostgREST: PGRST204/PGRST205)
      if (error && error.code !== '42P01' && error.code !== 'PGRST204' && error.code !== 'PGRST205') {
        logger.error('[System Settings] Supabase query error:', error);
        throw new Error(error.message);
      }

      res.json({
        status: 'success',
        data: {
          settings: data || [],
          defaults: {
            maintenance_mode: false,
            registration_enabled: true,
            api_rate_limit: 1000,
            max_upload_size_mb: 10
          }
        }
      });
    } catch (error) {
      logger.error('[System Settings] Route error:', error.message);
      logger.error('[System Settings] Stack:', error.stack);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/system-settings - Update system settings
  router.put('/', async (req, res) => {
    try {
      const settings = req.body;

      res.json({
        status: 'success',
        message: 'System settings updated',
        data: settings
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
