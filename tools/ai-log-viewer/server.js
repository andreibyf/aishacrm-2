/* global process */
/**
 * AiSHA AI Activity Log Viewer
 *
 * Lightweight Express server that queries llm_activity_logs from Supabase
 * and serves a real-time dashboard. Deploy on VPS-2 for log visibility.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=xxx \
 *   PORT=3030 \
 *   node server.js
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3030;

// Supabase client (service role for read-only access)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Serve static HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint: fetch logs with filters
app.get('/api/logs', async (req, res) => {
  try {
    const { hours = '24', provider, status, capability, limit = '100' } = req.query;

    // Build query
    let query = supabase
      .from('llm_activity_logs')
      .select('*')
      .gte('created_at', new Date(Date.now() - parseInt(hours) * 3600000).toISOString())
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (provider) query = query.eq('provider', provider);
    if (status) query = query.eq('status', status);
    if (capability) query = query.eq('capability', capability);

    const { data: logs, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Calculate stats
    const stats = {
      total_calls: logs.length,
      avg_duration: logs.length
        ? Math.round(logs.reduce((sum, log) => sum + (log.duration_ms || 0), 0) / logs.length)
        : 0,
      total_tokens: logs.reduce((sum, log) => sum + (log.usage?.total_tokens || 0), 0),
      error_rate:
        logs.length > 0 ? logs.filter((log) => log.status === 'error').length / logs.length : 0,
    };

    res.json({ logs, stats });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ai-log-viewer' });
});

app.listen(PORT, () => {
  console.log(`✅ AI Log Viewer running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/`);
  console.log(`🔌 Supabase: ${supabaseUrl}`);
});
