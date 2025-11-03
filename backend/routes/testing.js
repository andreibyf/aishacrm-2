/**
 * Testing Routes
 * Test utilities and mocks
 */

import express from 'express';

export default function createTestingRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/testing/ping - Simple ping test
  router.get('/ping', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: { message: 'pong', timestamp: new Date().toISOString() },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/testing/suites - Get available test suites
  router.get('/suites', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: {
          suites: [
            { id: 'crud', name: 'CRUD Operations', description: 'Test create/read/update/delete operations' },
            { id: 'auth', name: 'Authentication Tests', description: 'Test user authentication flows' },
            { id: 'api', name: 'API Integration', description: 'Test external API integrations' },
            { id: 'validation', name: 'Data Validation', description: 'Test input validation and constraints' },
            { id: 'permissions', name: 'Permissions', description: 'Test role-based access control' },
            { id: 'performance', name: 'Performance Tests', description: 'Test response times and load handling' },
            { id: 'database', name: 'Database Operations', description: 'Test database queries and transactions' }
          ]
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/testing/mock-data - Generate mock data
  router.post('/mock-data', async (req, res) => {
    try {
      const { entity_type, count = 10 } = req.body;

      res.json({
        status: 'success',
        message: 'Mock data generation not yet implemented',
        data: { entity_type, count },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/testing/run-playwright - Trigger GitHub Actions workflow to run E2E tests
  // Body: { suite: 'metrics' | 'rls' | 'rate-limit' | 'notifications' | 'tenant' | 'crud', ref?: 'main' }
  router.post('/run-playwright', async (req, res) => {
    try {
      const {
        GITHUB_TOKEN,
        GITHUB_REPO_OWNER = process.env.GITHUB_REPOSITORY_OWNER || 'andreibyf',
        GITHUB_REPO_NAME = process.env.GITHUB_REPOSITORY_NAME || 'aishacrm-2',
        GITHUB_WORKFLOW_FILE = process.env.GITHUB_WORKFLOW_FILE || 'e2e.yml',
      } = process.env;

      if (!GITHUB_TOKEN) {
        return res.status(400).json({
          status: 'error',
          message: 'GITHUB_TOKEN is not configured in backend environment',
        });
      }

      const { suite = 'metrics', ref = 'main' } = req.body || {};

      const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;

      const ghRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref, inputs: { suite } }),
      });

      if (!ghRes.ok) {
        const text = await ghRes.text().catch(() => '');
        return res.status(ghRes.status).json({
          status: 'error',
          message: `GitHub dispatch failed: ${ghRes.status} ${ghRes.statusText}`,
          details: text,
        });
      }

      const htmlUrl = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/${GITHUB_WORKFLOW_FILE}`;
      res.json({
        status: 'success',
        data: {
          suite,
          workflow: GITHUB_WORKFLOW_FILE,
          repo: `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
          ref,
          html_url: htmlUrl,
        },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
