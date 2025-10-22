/**
 * Document Routes
 * Document processing and management
 */

import express from 'express';

export default function createDocumentRoutes(pgPool) {
  const router = express.Router();

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
