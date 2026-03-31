/**
 * Document Routes
 * Document processing and management
 */

import express from 'express';
import {
  generateChatCompletion,
  selectLLMConfigForTenant,
  resolveLLMApiKey,
} from '../lib/aiEngine/index.js';

export default function createDocumentRoutes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/documents/process:
   *   post:
   *     summary: Process a document
   *     description: Triggers server-side processing for a document by URL.
   *     tags: [documents]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               document_url:
   *                 type: string
   *                 format: uri
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *     responses:
   *       200:
   *         description: Document processing accepted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // POST /api/documents/extract - Extract structured data from an image/document using vision AI
  router.post('/extract', async (req, res) => {
    try {
      const { file_url, json_schema } = req.body;

      if (!file_url) {
        return res.status(400).json({ status: 'error', message: 'file_url is required' });
      }

      const tenantId = req.tenant?.id || null;
      const { provider, model } = selectLLMConfigForTenant({
        capability: 'json_strict',
        tenantSlugOrId: tenantId,
        // Force gpt-4o for vision — gpt-4o-mini also supports images but 4o is more accurate
        providerOverride: 'openai',
        overrideModel: process.env.MODEL_VISION || 'gpt-4o',
      });
      const apiKey = resolveLLMApiKey(provider, tenantId);

      const schemaDescription = json_schema
        ? `Extract the following fields: ${Object.keys(json_schema.properties || {}).join(', ')}. Return a valid JSON object only.`
        : 'Extract all visible text and data. Return a valid JSON object only.';

      const result = await generateChatCompletion({
        provider,
        model,
        apiKey,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a data extraction assistant. Analyse the image and extract structured contact information.\n${schemaDescription}\nDo not include markdown or explanation — respond with raw JSON only.`,
              },
              {
                type: 'image_url',
                image_url: { url: file_url },
              },
            ],
          },
        ],
      });

      if (result.status !== 'success') {
        return res
          .status(502)
          .json({ status: 'error', message: result.error || 'AI extraction failed' });
      }

      let output;
      try {
        const raw = result.content
          .trim()
          .replace(/^```json?\s*/i, '')
          .replace(/```$/i, '');
        output = JSON.parse(raw);
      } catch {
        return res.status(502).json({
          status: 'error',
          message: 'AI returned non-JSON response',
          details: result.content,
        });
      }

      return res.json({ status: 'success', output });
    } catch (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/documents/process - Process document
  router.post('/process', async (req, res) => {
    try {
      const { document_url, tenant_id } = req.body;

      res.json({
        status: 'success',
        message: 'Document processing not yet implemented',
        data: { document_url, tenant_id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/documents:
   *   get:
   *     summary: List documents
   *     description: Returns a list of documents for the specified tenant.
   *     tags: [documents]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *     responses:
   *       200:
   *         description: List of documents
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   */
  // GET /api/documents - List documents
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      res.json({
        status: 'success',
        data: { documents: [], tenant_id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
