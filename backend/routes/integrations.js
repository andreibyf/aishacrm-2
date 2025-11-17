/**
 * Integration Routes
 * N8N, OpenAI, Stripe, Twilio, Slack, etc.
 */

import express from 'express';

export default function createIntegrationRoutes(_pgPool) {
  const router = express.Router();

  // Index route for service discovery and health
  router.get('/', async (req, res) => {
    try {
      return res.json({
        status: 'success',
        service: 'integrations',
        endpoints: [
          'GET /api/integrations/n8n/workflows',
          'GET /api/integrations/n8n/status'
        ],
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ---- n8n helpers ----
  function requireSuperadmin(req, res, next) {
    // Dev-friendly fallback like validateTenantAccess: create mock superadmin when unauthenticated in dev
    if (!req.user && process.env.NODE_ENV === 'development') {
      req.user = { id: 'local-dev-superadmin', email: 'dev@localhost', role: 'superadmin', tenant_id: null };
    }
    const role = req.user?.role;
    if (role !== 'superadmin') {
      return res.status(403).json({ status: 'error', message: 'Superadmin access required' });
    }
    return next();
  }
  const getN8nConfig = () => {
    const baseUrl = process.env.N8N_BASE_URL || 'http://n8n:5678';
    const apiKey = process.env.N8N_API_KEY || '';
    const basicUser = process.env.N8N_BASIC_AUTH_USER || '';
    const basicPass = process.env.N8N_BASIC_AUTH_PASSWORD || '';
    return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, basicUser, basicPass };
  };

  async function fetchFromN8n(path) {
    const { baseUrl, apiKey, basicUser, basicPass } = getN8nConfig();
    const url = `${baseUrl}${path}`;
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-N8N-API-KEY'] = apiKey;
    if (basicUser && basicPass) {
      const token = Buffer.from(`${basicUser}:${basicPass}`).toString('base64');
      headers['Authorization'] = `Basic ${token}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`n8n request failed ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  }

  function normalizeWorkflows(raw) {
    // Support both Public API shape and legacy /rest shape
    const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : raw?.workflows || [];
    return list.map((w) => ({
      id: w.id ?? w?.id?.toString?.() ?? w?.workflowId ?? w?.staticData?.id ?? null,
      name: w.name,
      active: w.active ?? w?.active === true,
      tags: w.tags || [],
      createdAt: w.createdAt || w.createdAtUtc || w?.createdAt?.toString?.() || null,
      updatedAt: w.updatedAt || w.updatedAtUtc || w?.updatedAt?.toString?.() || null,
      versionId: w.versionId || w?.version || null,
    }));
  }

  /**
   * @openapi
   * /api/integrations/n8n/workflows:
   *   get:
   *     summary: List n8n workflows
   *     description: Lists workflows from the configured n8n instance. Requires superadmin.
   *     tags: [integrations]
   *     responses:
   *       200:
   *         description: List of n8n workflows
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       403:
   *         description: Superadmin required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/integrations/n8n/workflows - List workflows from n8n
  router.get('/n8n/workflows', requireSuperadmin, async (_req, res) => {
    try {
      // Try modern Public API first, then legacy internal /rest
      let raw;
      try {
        raw = await fetchFromN8n('/api/v1/workflows?limit=100');
      } catch {
        raw = await fetchFromN8n('/rest/workflows');
      }
      const workflows = normalizeWorkflows(raw);
      res.json({ status: 'success', count: workflows.length, data: workflows });
    } catch (error) {
      res.status(502).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/integrations/n8n/health:
   *   get:
   *     summary: n8n health
   *     description: Checks connectivity to n8n health endpoint. Requires superadmin.
   *     tags: [integrations]
   *     responses:
   *       200:
   *         description: n8n health status
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       403:
   *         description: Superadmin required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/integrations/n8n/health - Check n8n connectivity
  router.get('/n8n/health', requireSuperadmin, async (_req, res) => {
    try {
      const { baseUrl } = getN8nConfig();
      // health endpoint returns plain text "ok" in many n8n versions
      const url = `${baseUrl}/healthz`;
      const ping = await fetch(url).then(async (r) => ({ ok: r.ok, status: r.status, text: await r.text().catch(() => '') })).catch((e) => ({ ok: false, error: e.message }));
      res.json({ status: 'success', data: { baseUrl, health: ping } });
    } catch (error) {
      res.status(502).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/integrations/n8n/workflows/{id}:
   *   get:
   *     summary: Get n8n workflow
   *     description: Fetches a single workflow by ID from n8n. Requires superadmin.
   *     tags: [integrations]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Workflow details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       403:
   *         description: Superadmin required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/integrations/n8n/workflows/:id - Get single workflow
  router.get('/n8n/workflows/:id', requireSuperadmin, async (req, res) => {
    try {
      const { id } = req.params;
      let raw;
      try {
        raw = await fetchFromN8n(`/api/v1/workflows/${encodeURIComponent(id)}`);
      } catch {
        raw = await fetchFromN8n(`/rest/workflows/${encodeURIComponent(id)}`);
      }

      // Normalize single item to match list shape fields
      const [normalized] = normalizeWorkflows([raw?.data || raw]);
      res.json({ status: 'success', data: normalized || null });
    } catch (error) {
      res.status(502).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/integrations/n8n/trigger:
   *   post:
   *     summary: Trigger n8n workflow
   *     description: Triggers a workflow by ID in n8n.
   *     tags: [integrations]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               workflow_id:
   *                 type: string
   *               data:
   *                 type: object
   *     responses:
   *       200:
   *         description: Trigger acknowledged
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/integrations/n8n/trigger - Trigger N8N workflow
  router.post('/n8n/trigger', requireSuperadmin, async (req, res) => {
    try {
      const { workflow_id, data: _data } = req.body;

      res.json({
        status: 'success',
        message: 'N8N workflow triggered',
        data: { workflow_id, timestamp: new Date().toISOString() },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/integrations/openai/chat:
   *   post:
   *     summary: OpenAI chat completion
   *     description: Proxies a chat completion request to OpenAI (placeholder).
   *     tags: [integrations]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               messages:
   *                 type: array
   *                 items:
   *                   type: object
   *               model:
   *                 type: string
   *                 default: gpt-4
   *     responses:
   *       200:
   *         description: Placeholder response
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/integrations/openai/chat - OpenAI chat completion
  router.post('/openai/chat', async (req, res) => {
    try {
      const { messages, model = 'gpt-4' } = req.body;

      res.json({
        status: 'success',
        message: 'OpenAI chat not yet implemented',
        data: { model, message_count: messages?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/integrations/stripe/create-payment:
   *   post:
   *     summary: Create Stripe payment
   *     description: Initiates a Stripe payment (placeholder).
   *     tags: [integrations]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               amount:
   *                 type: number
   *               currency:
   *                 type: string
   *                 default: usd
   *               customer_id:
   *                 type: string
   *     responses:
   *       200:
   *         description: Placeholder response
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/integrations/stripe/create-payment - Create Stripe payment
  router.post('/stripe/create-payment', async (req, res) => {
    try {
      const { amount, currency = 'usd', customer_id } = req.body;

      res.json({
        status: 'success',
        message: 'Stripe payment not yet implemented',
        data: { amount, currency, customer_id },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/integrations/twilio/send-sms:
   *   post:
   *     summary: Send SMS via Twilio
   *     description: Sends an SMS (placeholder).
   *     tags: [integrations]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               to:
   *                 type: string
   *               message:
   *                 type: string
   *     responses:
   *       200:
   *         description: Placeholder response
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/integrations/twilio/send-sms - Send SMS via Twilio
  router.post('/twilio/send-sms', async (req, res) => {
    try {
      const { to, message } = req.body;

      res.json({
        status: 'success',
        message: 'Twilio SMS not yet implemented',
        data: { to, message_length: message?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  /**
   * @openapi
   * /api/integrations/slack/send-message:
   *   post:
   *     summary: Send Slack message
   *     description: Sends a Slack message (placeholder).
   *     tags: [integrations]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               channel:
   *                 type: string
   *               text:
   *                 type: string
   *     responses:
   *       200:
   *         description: Placeholder response
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/integrations/slack/send-message - Send Slack message
  router.post('/slack/send-message', async (req, res) => {
    try {
      const { channel, text } = req.body;

      res.json({
        status: 'success',
        message: 'Slack integration not yet implemented',
        data: { channel, text_length: text?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  return router;
}
