import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

export default function createSystemSettingsRoutes(_pgPool) {
  const router = Router();
  
  // Initialize Supabase client for direct table operations
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // GET /api/system-settings
  router.get('/', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('settings')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error;
      }

      res.json({ success: true, data: data?.settings || {} });
    } catch (error) {
      console.error('Error fetching system settings:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch system settings' });
    }
  });

  // POST /api/system-settings
  router.post('/', async (req, res) => {
    const { system_openai_settings } = req.body;

    if (!system_openai_settings) {
      return res.status(400).json({ success: false, error: 'system_openai_settings is required' });
    }

    try {
      // Get current settings
      const { data: currentData } = await supabase
        .from('system_settings')
        .select('settings')
        .eq('id', 1)
        .single();

      const currentSettings = currentData?.settings || {};
      const newSettings = { ...currentSettings, system_openai_settings };

      // Use upsert to insert or update
      const { error } = await supabase
        .from('system_settings')
        .upsert({ id: 1, settings: newSettings }, { onConflict: 'id' });

      if (error) {
        throw error;
      }

      res.json({ success: true, data: newSettings });
    } catch (error) {
      console.error('Error updating system settings:', error);
      res.status(500).json({ success: false, error: 'Failed to update system settings' });
    }
  });

  return router;
}
