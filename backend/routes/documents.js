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
import logger from '../lib/logger.js';
import { validateUrlAgainstWhitelist } from '../lib/urlValidator.js';

export default function createDocumentRoutes(_pgPool) {
  const router = express.Router();

  function buildDocumentUrlAllowlist() {
    const allowlist = ['*.supabase.co', 'supabase.co', 'supabase.com'];
    const configured = String(process.env.DOCUMENT_FETCH_ALLOWED_DOMAINS || '')
      .split(',')
      .map((domain) => domain.trim())
      .filter(Boolean);
    allowlist.push(...configured);

    try {
      const supabaseHost = new URL(process.env.SUPABASE_URL || '').hostname;
      if (supabaseHost) allowlist.push(supabaseHost);
    } catch {
      // Ignore invalid SUPABASE_URL and continue with defaults.
    }

    return [...new Set(allowlist)];
  }

  function validateDocumentFileUrl(fileUrl) {
    const validation = validateUrlAgainstWhitelist(fileUrl, buildDocumentUrlAllowlist());
    if (!validation.valid) {
      return {
        valid: false,
        message: validation.error || 'Invalid file_url',
      };
    }
    return { valid: true };
  }

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

      const fileUrlValidation = validateDocumentFileUrl(file_url);
      if (!fileUrlValidation.valid) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid file_url: ${fileUrlValidation.message}`,
        });
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
      const hasTransactionsSchema = Boolean(json_schema?.properties?.transactions);
      const extractionRules = hasTransactionsSchema
        ? 'For transactions: include only real transaction rows. Do not return blank fields. Normalize dates to YYYY-MM-DD. Amount must be numeric and positive. transaction_type must be either income or expense.'
        : 'Follow the schema exactly and do not return empty placeholder fields.';

      const fileResp = await fetch(file_url, { method: 'GET' });
      if (!fileResp.ok) {
        return res.status(400).json({
          status: 'error',
          message: `Unable to access uploaded file (HTTP ${fileResp.status})`,
        });
      }

      const contentType = (fileResp.headers.get('content-type') || '').toLowerCase();
      const lowerUrl = String(file_url || '').toLowerCase();
      const isPdf = contentType.includes('application/pdf') || lowerUrl.endsWith('.pdf');
      const isImage = contentType.startsWith('image/');

      if (!isImage && !isPdf) {
        return res.status(400).json({
          status: 'error',
          message: `Unsupported file type for AI extraction: ${contentType || 'unknown'}`,
          details: 'Supported formats: PDF, PNG, JPG, WEBP.',
        });
      }

      const fileBuffer = Buffer.from(await fileResp.arrayBuffer());
      const maxBytes = 15 * 1024 * 1024;
      if (fileBuffer.length > maxBytes) {
        return res.status(400).json({
          status: 'error',
          message: 'Uploaded image is too large for extraction',
          details: 'Please use an image under 15MB.',
        });
      }

      let messages;
      if (isPdf) {
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = pdfParseModule.default || pdfParseModule;
        const parsed = await pdfParse(fileBuffer);
        const extractedText = (parsed?.text || '').trim();

        if (!extractedText) {
          return res.status(400).json({
            status: 'error',
            message: 'Could not extract text from PDF',
            details: 'Please upload a text-based PDF or a clearer scanned PDF.',
          });
        }

        const truncatedText = extractedText.slice(0, 30000);
        messages = [
          {
            role: 'user',
            content:
              `You are a data extraction assistant. Extract structured data from the provided document text.\n` +
              `${schemaDescription}\n` +
              `${extractionRules}\n` +
              `Do not include markdown or explanation — respond with raw JSON only.\n\n` +
              `Document text:\n${truncatedText}`,
          },
        ];
      } else {
        const imageDataUrl = `data:${contentType};base64,${fileBuffer.toString('base64')}`;
        messages = [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are a data extraction assistant. Analyse the image and extract structured data that matches the requested schema.\n${schemaDescription}\n${extractionRules}\nDo not include markdown or explanation — respond with raw JSON only.`,
              },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ];
      }

      const result = await generateChatCompletion({
        provider,
        model,
        apiKey,
        temperature: 0,
        messages,
      });

      if (result.status !== 'success') {
        logger.warn('[documents] AI extraction failed', {
          provider,
          model,
          error: result.error,
        });
        return res.status(502).json({
          status: 'error',
          message: result.error || 'AI extraction failed',
          details: result.error,
        });
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
