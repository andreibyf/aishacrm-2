/**
 * Webhook Routes
 * Webhook registration and handling
 */

import express from 'express';

export default function createWebhookRoutes(pgPool) {
  const router = express.Router();

  // POST /api/webhooks/register - Register webhook
  router.post('/register', async (req, res) => {
    try {
      const { tenant_id, url, events } = req.body;

      res.json({
        status: 'success',
        message: 'Webhook registered',
        data: { tenant_id, url, events },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/webhooks/trigger - Trigger webhook
  router.post('/trigger', async (req, res) => {
    try {
      const { webhook_id, event, payload } = req.body;

      res.json({
        status: 'success',
        message: 'Webhook triggered',
        data: { webhook_id, event, payload },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/webhooks - List webhooks
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      res.json({
        status: 'success',
        data: { webhooks: [], tenant_id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
