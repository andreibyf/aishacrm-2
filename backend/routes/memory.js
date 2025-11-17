/**
 * Memory Routes (Redis/Valkey-backed)
 * Ephemeral agent sessions, events, preferences, and navigation state
 */

import express from 'express';
import {
  isMemoryAvailable as memoryAvailable,
  saveAgentSession,
  getAgentSession,
  deleteAgentSession,
  listUserSessions,
  appendEvent,
  getSessionEvents,
  getRecentEvents,
  cacheUserPreferences,
  getCachedPreferences,
  invalidatePreferencesCache,
  saveNavigationState,
  getNavigationState,
  getMemoryStats,
  flushAllMemory
} from '../lib/memoryClient.js';
import { archiveSessionByIds, scanAndArchive } from '../jobs/memoryArchiveJob.js';

export default function createMemoryRoutes() {
  const router = express.Router();

  // Guard middleware to short-circuit when memory is unavailable
  router.use((req, res, next) => {
    if (!memoryAvailable()) {
      return res.status(503).json({ status: 'error', message: 'Memory layer unavailable' });
    }
    next();
  });

  // GET /api/memory/status - quick status
  router.get('/status', async (_req, res) => {
    try {
      const stats = await getMemoryStats();
      return res.json({ status: 'success', data: { available: memoryAvailable(), ...stats } });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // Sessions -----------------------------------------------------------
  // POST /api/memory/sessions - create/update session
  router.post('/sessions', async (req, res) => {
    try {
      const { tenant_id, user_id, session_id, data, ttl_seconds } = req.body || {};
      if (!tenant_id || !user_id || !session_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, user_id, session_id are required' });
      }
      const ok = await saveAgentSession(tenant_id, user_id, session_id, data || {}, ttl_seconds);
      return res.json({ status: ok ? 'success' : 'error', data: { ok } });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // GET /api/memory/sessions/:sessionId - get
  router.get('/sessions/:sessionId', async (req, res) => {
    try {
      const { tenant_id, user_id } = req.query;
      const { sessionId } = req.params;
      if (!tenant_id || !user_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and user_id are required as query params' });
      }
      const data = await getAgentSession(tenant_id, user_id, sessionId);
      return res.json({ status: 'success', data });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // DELETE /api/memory/sessions/:sessionId - delete
  router.delete('/sessions/:sessionId', async (req, res) => {
    try {
      const { tenant_id, user_id } = req.query;
      const { sessionId } = req.params;
      if (!tenant_id || !user_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and user_id are required as query params' });
      }
      const ok = await deleteAgentSession(tenant_id, user_id, sessionId);
      return res.json({ status: ok ? 'success' : 'error', data: { ok } });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // GET /api/memory/sessions - list user sessions
  router.get('/sessions', async (req, res) => {
    try {
      const { tenant_id, user_id } = req.query;
      if (!tenant_id || !user_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and user_id are required' });
      }
      const sessions = await listUserSessions(tenant_id, user_id);
      return res.json({ status: 'success', data: sessions });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // Events -------------------------------------------------------------
  // POST /api/memory/sessions/:sessionId/events - append
  router.post('/sessions/:sessionId/events', async (req, res) => {
    try {
      const { tenant_id, user_id, event } = req.body || {};
      const { sessionId } = req.params;
      if (!tenant_id || !user_id || !sessionId || !event) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, user_id, sessionId, event are required' });
      }
      const ok = await appendEvent(tenant_id, user_id, sessionId, event);
      return res.json({ status: ok ? 'success' : 'error', data: { ok } });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // GET /api/memory/sessions/:sessionId/events - get events
  router.get('/sessions/:sessionId/events', async (req, res) => {
    try {
      const { tenant_id, user_id, limit } = req.query;
      const { sessionId } = req.params;
      if (!tenant_id || !user_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and user_id are required' });
      }
      const events = await getSessionEvents(tenant_id, user_id, sessionId, parseInt(limit || 100, 10));
      return res.json({ status: 'success', data: events });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // GET /api/memory/events/recent - get recent user events across sessions
  router.get('/events/recent', async (req, res) => {
    try {
      const { tenant_id, user_id, limit } = req.query;
      if (!tenant_id || !user_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and user_id are required' });
      }
      const events = await getRecentEvents(tenant_id, user_id, parseInt(limit || 50, 10));
      return res.json({ status: 'success', data: events });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // Preferences --------------------------------------------------------
  // POST /api/memory/preferences - cache
  router.post('/preferences', async (req, res) => {
    try {
      const { tenant_id, user_id, preferences, ttl_seconds } = req.body || {};
      if (!tenant_id || !user_id || !preferences) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, user_id, preferences are required' });
      }
      const ok = await cacheUserPreferences(tenant_id, user_id, preferences, ttl_seconds);
      return res.json({ status: ok ? 'success' : 'error', data: { ok } });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // GET /api/memory/preferences - get
  router.get('/preferences', async (req, res) => {
    try {
      const { tenant_id, user_id } = req.query;
      if (!tenant_id || !user_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and user_id are required' });
      }
      const data = await getCachedPreferences(tenant_id, user_id);
      return res.json({ status: 'success', data });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // DELETE /api/memory/preferences - invalidate
  router.delete('/preferences', async (req, res) => {
    try {
      const { tenant_id, user_id } = req.query;
      if (!tenant_id || !user_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and user_id are required' });
      }
      const ok = await invalidatePreferencesCache(tenant_id, user_id);
      return res.json({ status: ok ? 'success' : 'error', data: { ok } });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // Navigation ---------------------------------------------------------
  // POST /api/memory/navigation - save
  router.post('/navigation', async (req, res) => {
    try {
      const { tenant_id, user_id, nav_state, ttl_seconds } = req.body || {};
      if (!tenant_id || !user_id || !nav_state) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, user_id, nav_state are required' });
      }
      const ok = await saveNavigationState(tenant_id, user_id, nav_state, ttl_seconds);
      return res.json({ status: ok ? 'success' : 'error', data: { ok } });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // GET /api/memory/navigation - get
  router.get('/navigation', async (req, res) => {
    try {
      const { tenant_id, user_id } = req.query;
      if (!tenant_id || !user_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and user_id are required' });
      }
      const data = await getNavigationState(tenant_id, user_id);
      return res.json({ status: 'success', data });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // Utilities ---------------------------------------------------------
  // POST /api/memory/archive/sessions/:sessionId - archive specific session
  router.post('/archive/sessions/:sessionId', async (req, res) => {
    try {
      const { tenant_id, user_id } = req.body || {};
      const { sessionId } = req.params;
      if (!tenant_id || !user_id || !sessionId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, user_id, sessionId are required' });
      }
      const result = await archiveSessionByIds(tenant_id, user_id, sessionId);
      return res.json({ status: 'success', data: result });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // POST /api/memory/archive/run - scan and archive important sessions
  router.post('/archive/run', async (req, res) => {
    try {
      const { limit } = req.body || {};
      const result = await scanAndArchive({ limit: parseInt(limit || 200, 10) });
      return res.json({ status: 'success', data: result });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  // POST /api/memory/flush-all - DEV ONLY full flush safeguard
  router.post('/flush-all', async (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ status: 'error', message: 'Forbidden in production' });
      }
      const ok = await flushAllMemory();
      return res.json({ status: ok ? 'success' : 'error', data: { ok } });
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  return router;
}
