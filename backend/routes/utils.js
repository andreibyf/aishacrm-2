/**
 * Utility Routes
 * Miscellaneous utility functions
 */

import express from 'express';
import crypto from 'crypto';

import { searchWeb, fetchPage, companyLookup } from '../lib/growth/webResearch.js';
import { authenticateRequest } from '../middleware/authenticate.js';

export default function createUtilsRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/utils/health - Utility service health check
  router.get('/health', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: {
          service: 'utils',
          healthy: true,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/utils/hash - Hash a string
  router.post('/hash', async (req, res) => {
    try {
      const { text, algorithm = 'sha256' } = req.body;

      res.json({
        status: 'success',
        message: 'Hashing not yet implemented',
        data: { algorithm, text_length: text?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/utils/generate-uuid - Generate UUID
  router.post('/generate-uuid', async (req, res) => {
    try {
      const uuid = crypto.randomUUID();

      res.json({
        status: 'success',
        data: { uuid },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/utils/generate-unique-id - Generate human-readable unique ID
  router.post('/generate-unique-id', async (req, res) => {
    try {
      const { entity_type, tenant_id: _tenantId } = req.body;

      if (!entity_type) {
        return res.status(400).json({
          status: 'error',
          message: 'entity_type is required (e.g., "Lead", "Contact", "Account")',
        });
      }

      // Generate a unique ID in format: PREFIX-YYYYMMDD-RANDOM
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
      const randomStr = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 hex chars

      let prefix = 'UNKN';
      if (entity_type === 'Lead' || entity_type === 'lead') {
        prefix = 'L';
      } else if (entity_type === 'Contact' || entity_type === 'contact') {
        prefix = 'C';
      } else if (entity_type === 'Account' || entity_type === 'account') {
        prefix = 'ACC';
      } else if (entity_type === 'Opportunity' || entity_type === 'opportunity') {
        prefix = 'OPP';
      }

      const unique_id = `${prefix}-${dateStr}-${randomStr}`;

      res.json({
        status: 'success',
        data: { unique_id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/utils/web-search?q=<query>&limit=<n> - Web search (Phase 1: Wikipedia)
  // Backs Braid searchWeb() in web-research.braid. Fail-soft: empty data on
  // upstream failure (webResearch returns [] rather than throwing).
  router.get('/web-search', authenticateRequest, async (req, res) => {
    try {
      const data = await searchWeb({
        q: req.query.q,
        limit: Number(req.query.limit) || 5,
      });
      res.json({ status: 'success', data });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/utils/fetch-page { url } - Fetch + extract a web page's text
  // Backs Braid fetchWebPage(). Uses a headless browser server-side.
  router.post('/fetch-page', authenticateRequest, async (req, res) => {
    try {
      const url = req.body?.url;
      if (!url) {
        return res.status(400).json({ status: 'error', message: 'url is required' });
      }
      const data = await fetchPage({ url });
      res.json({ status: 'success', data });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/utils/company-lookup { company_name } - Enrich company data
  // Backs Braid lookupCompanyInfo(). Phase 1: searchWeb composition (no LLM).
  router.post('/company-lookup', authenticateRequest, async (req, res) => {
    try {
      const company_name = req.body?.company_name;
      if (!company_name) {
        return res.status(400).json({ status: 'error', message: 'company_name is required' });
      }
      const data = await companyLookup({ company_name });
      res.json({ status: 'success', data });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
