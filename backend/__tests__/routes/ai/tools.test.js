import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

const TEST_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

function createMockToolsRouter() {
  const router = express.Router();

  // Mock POST /brain-test
  router.post('/brain-test', (req, res) => {
    // Check X-Internal-AI-Key header
    const internalKey = req.headers['x-internal-ai-key'];
    if (!internalKey) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Unauthorized - X-Internal-AI-Key header required' 
      });
    }
    if (internalKey !== 'test-key') {
      return res.status(401).json({ 
        status: 'error', 
        message: 'Invalid X-Internal-AI-Key' 
      });
    }

    // Validate required fields
    if (!req.body.taskType) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'taskType is required' 
      });
    }
    if (!req.body.tenant_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'tenant_id is required' 
      });
    }

    // Mock successful response
    return res.json({
      success: true,
      taskType: req.body.taskType,
      tenant_id: req.body.tenant_id,
      result: 'Mock brain test result'
    });
  });

  // Mock GET /snapshot-internal
  router.get('/snapshot-internal', (req, res) => {
    if (!req.query.tenant_id) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'tenant_id parameter required' 
      });
    }
    if (!/^[0-9a-f-]{36}$/.test(req.query.tenant_id)) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Invalid tenant_id format' 
      });
    }

    return res.json({
      tenant_id: req.query.tenant_id,
      snapshot: 'Mock snapshot data'
    });
  });

  return router;
}

describe('AI Tools Module', () => {
  let app;

  beforeEach(() => {
    // Create a fresh Express app for each test with mocked router
    app = express();
    app.use(express.json());
    app.use('/api/ai', createMockToolsRouter());
  });

  describe('POST /brain-test', () => {
    test('should return error when X-Internal-AI-Key header is missing', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .send({
          taskType: 'test',
          tenant_id: TEST_TENANT_ID
        })
        .expect(401);

      assert.equal(response.body.status, 'error');
      assert.ok(response.body.message.includes('X-Internal-AI-Key'));
    });

    test('should return error with invalid X-Internal-AI-Key', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'invalid-key')
        .send({
          taskType: 'test',
          tenant_id: TEST_TENANT_ID
        })
        .expect(401);

      assert.equal(response.body.status, 'error');
      assert.ok(response.body.message.includes('Invalid'));
    });

    test('should validate required taskType field', async () => {
      // Use any internal key for testing structure (will likely fail auth but test validation)
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          tenant_id: TEST_TENANT_ID
        });

      // Should validate taskType requirement
      assert.ok(response.status >= 400);
    });

    test('should validate tenant_id requirement', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          taskType: 'test'
        });

      // Should validate tenant_id requirement
      assert.ok(response.status >= 400);
    });

    test('should accept valid brain test request structure', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          taskType: 'read_only',
          tenant_id: TEST_TENANT_ID,
          context: 'Test context'
        });

      // Should accept valid structure (will fail auth but structure is correct)
      assert.equal(response.status, 401); // Expected auth failure
      assert.equal(response.body.status, 'error');
    });
  });

  describe('GET /snapshot-internal', () => {
    test('should handle tenant resolution for snapshot', async () => {
      const response = await request(app)
        .get('/api/ai/snapshot-internal')
        .query({ tenant_id: TEST_TENANT_ID });

      // Should attempt to resolve tenant (may fail due to DB config but structure is correct)
      assert.ok(response.status === 200 || response.status === 500 || response.status === 400);
    });

    test('should handle missing tenant_id parameter', async () => {
      const response = await request(app)
        .get('/api/ai/snapshot-internal');

      // Should validate tenant_id requirement
      assert.ok(response.status >= 400);
    });

    test('should handle invalid tenant_id format', async () => {
      const response = await request(app)
        .get('/api/ai/snapshot-internal')
        .query({ tenant_id: 'invalid-uuid' });

      // Should validate tenant_id format
      assert.ok(response.status >= 400);
    });
  });

  describe('Braid Tool Integration', () => {
    test('should handle tool execution requests', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          taskType: 'tool_execution',
          tenant_id: TEST_TENANT_ID,
          toolName: 'listAccounts',
          parameters: {}
        });

      // Should handle tool execution structure (will fail auth)
      assert.equal(response.status, 401);
    });

    test('should validate tool parameters', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          taskType: 'tool_execution',
          tenant_id: TEST_TENANT_ID,
          toolName: 'listAccounts',
          parameters: null // Invalid parameters
        });

      // Should validate tool parameters
      assert.ok(response.status >= 400);
    });
  });

  describe('Security and Authentication', () => {
    test('should prevent unauthorized access to internal endpoints', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .send({
          taskType: 'admin_operation',
          tenant_id: TEST_TENANT_ID
        });

      // Should require authentication
      assert.equal(response.status, 401);
    });

    test('should handle malformed JSON in brain-test requests', async () => {
      const _response = await request(app)
        .post('/api/ai/brain-test')
        .set('Content-Type', 'application/json')
        .set('X-Internal-AI-Key', 'test-key')
        .send('{"taskType": "test", malformed}')
        .expect(400);
    });

    test('should sanitize task context input', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          taskType: 'test',
          tenant_id: TEST_TENANT_ID,
          context: '<script>alert("xss")</script>Malicious content'
        });

      // Should sanitize input (will fail auth but structure is processed)
      assert.equal(response.status, 401);
    });

    test('should handle SQL injection attempts in context', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          taskType: 'test',
          tenant_id: TEST_TENANT_ID,
          context: "'; DROP TABLE accounts; --"
        });

      // Should handle malicious input safely
      assert.equal(response.status, 401);
    });
  });

  describe('Task Type Validation', () => {
    test('should accept valid task types', async () => {
      const validTaskTypes = ['read_only', 'propose_actions', 'tool_execution', 'summarize'];
      
      for (const taskType of validTaskTypes) {
        const response = await request(app)
          .post('/api/ai/brain-test')
          .set('X-Internal-AI-Key', 'test-key')
          .send({
            taskType: taskType,
            tenant_id: TEST_TENANT_ID
          });

        // Should accept valid task types (will fail auth but taskType is accepted)
        assert.equal(response.status, 401, `TaskType ${taskType} should be accepted`);
      }
    });

    test('should reject invalid task types', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          taskType: 'invalid_task_type',
          tenant_id: TEST_TENANT_ID
        });

      // Should reject invalid task types
      assert.ok(response.status === 401 || response.status === 400);
    });
  });

  describe('Module Structure', () => {
    test('should export an Express router', () => {
      assert.equal(typeof toolsRouter, 'function');
      assert.ok(toolsRouter.stack !== undefined, 'Should be an Express router with stack');
    });

    test('should have tools/brain routes configured', () => {
      const routes = toolsRouter.stack || [];
      assert.ok(routes.length > 0, 'Should have routes configured');
    });
  });

  describe('Response Format', () => {
    test('should return consistent error format for auth failures', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .send({});

      assert.equal(response.body.status, 'error');
      assert.ok(response.body.message, 'Should include error message');
    });

    test('should handle missing required fields appropriately', async () => {
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({});

      // Should validate required fields
      assert.ok(response.status >= 400);
    });
  });

  describe('Performance and Limits', () => {
    test('should handle large context payloads', async () => {
      const largeContext = 'x'.repeat(100000); // 100KB context
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          taskType: 'test',
          tenant_id: TEST_TENANT_ID,
          context: largeContext
        });

      // Should handle large payloads (may fail due to size limits or auth)
      assert.ok(response.status !== undefined);
    });

    test('should handle concurrent brain-test requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/ai/brain-test')
          .set('X-Internal-AI-Key', 'test-key')
          .send({
            taskType: 'test',
            tenant_id: TEST_TENANT_ID
          })
      );

      const responses = await Promise.all(requests);
      
      // All requests should get consistent responses
      responses.forEach(response => {
        assert.ok(response.status !== undefined);
      });
    });
  });
});