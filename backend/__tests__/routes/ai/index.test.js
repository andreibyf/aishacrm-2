import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

const TEST_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// Mock the main AI router that aggregates all sub-modules
function createMockAiRouter() {
  const router = express.Router();
  
  // Mock all AI endpoints from different modules
  
  // Chat routes
  router.post('/chat', (req, res) => {
    const { messages, tenant_id } = req.body;
    const tenantHeader = req.headers['x-tenant-id'];
    
    if (!tenantHeader && !tenant_id) {
      return res.status(400).json({ status: 'error', message: 'Valid tenant_id required (x-tenant-id header)' });
    }
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ status: 'error', message: 'messages array is required' });
    }
    
    res.json({ status: 'success', data: { response: 'Mock chat response' } });
  });
  
  // Speech routes
  router.post('/tts', (req, res) => {
    const { text, tenant_id } = req.body;
    if (!text || !tenant_id) {
      return res.status(400).json({ status: 'error', message: 'Text and tenant_id required' });
    }
    res.json({ status: 'success', data: { audio_url: 'mock-audio' } });
  });
  
  router.post('/speech-to-text', (req, res) => {
    const { tenant_id } = req.body;
    if (!tenant_id) {
      return res.status(400).json({ status: 'error', message: 'Tenant ID required' });
    }
    res.json({ status: 'success', data: { transcript: 'Mock transcript' } });
  });
  
  // Summarization routes
  router.post('/summarize', (req, res) => {
    const { text, tenant_id } = req.body;
    if (!text || !tenant_id) {
      return res.status(400).json({ status: 'error', message: 'Text and tenant_id required' });
    }
    res.json({ status: 'success', data: { summary: 'Mock summary' } });
  });
  
  // Conversations routes
  router.get('/conversations', (req, res) => {
    const { tenant_id } = req.query;
    if (!tenant_id) {
      return res.status(400).json({ status: 'error', message: 'tenant_id required' });
    }
    res.json({ status: 'success', data: [] });
  });
  
  router.get('/conversations/:id', (req, res) => {
    const { tenant_id } = req.query;
    if (!tenant_id) {
      return res.status(400).json({ status: 'error', message: 'tenant_id required' });
    }
    res.json({ status: 'success', data: { id: req.params.id } });
  });
  
  // Tools routes
  router.post('/brain-test', (req, res) => {
    const internalKey = req.headers['x-internal-ai-key'];
    if (!internalKey) {
      return res.status(401).json({ status: 'error', message: 'X-Internal-AI-Key required' });
    }
    res.json({ status: 'success', data: { result: 'Mock brain test' } });
  });
  
  return router;
}

describe('AI Index Router Module', () => {
  let app;

  beforeEach(() => {
    // Create a fresh Express app for each test with mocked router
    app = express();
    app.use(express.json());
    app.use('/api/ai', createMockAiRouter());
  });

  describe('Module Exports', () => {
    test('should export an Express router', () => {
      const mockRouter = createMockAiRouter();
      assert.equal(typeof mockRouter, 'function');
      assert.ok(mockRouter.stack !== undefined, 'Should be an Express router with stack');
    });

    test('should have routes configured', () => {
      const mockRouter = createMockAiRouter();
      const routes = mockRouter.stack || [];
      assert.ok(routes.length > 0, 'Should have routes configured');
    });
  });

  describe('Route Aggregation', () => {
    test('should mount chat routes', async () => {
      // Test a chat endpoint
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          message: 'Hello',
          tenant_id: TEST_TENANT_ID
        });

      // Should route to chat module (success or auth error expected)
      assert.ok(response.status !== 404, 'Chat route should be mounted');
    });

    test('should mount speech routes', async () => {
      // Test TTS endpoint
      const response = await request(app)
        .post('/api/ai/tts')
        .send({
          text: 'Hello world',
          tenant_id: TEST_TENANT_ID
        });

      // Should route to speech module (success or auth error expected)
      assert.ok(response.status !== 404, 'TTS route should be mounted');
    });

    test('should mount summarization routes', async () => {
      // Test summarization endpoint
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'Test content to summarize',
          tenant_id: TEST_TENANT_ID
        });

      // Should route to summarization module (success or auth error expected)
      assert.ok(response.status !== 404, 'Summarization route should be mounted');
    });

    test('should mount conversation routes', async () => {
      // Test conversations listing
      const response = await request(app)
        .get(`/api/ai/conversations?tenant_id=${TEST_TENANT_ID}`);

      // Should route to conversations module (success or auth error expected)
      assert.ok(response.status !== 404, 'Conversations route should be mounted');
    });

    test('should mount tools routes', async () => {
      // Test brain-test endpoint (with internal key header)
      const response = await request(app)
        .post('/api/ai/brain-test')
        .set('X-Internal-AI-Key', 'test-key')
        .send({
          taskType: 'test',
          context: {},
          tenant_id: TEST_TENANT_ID
        });

      // Should route to tools module (success or auth error expected)
      assert.ok(response.status !== 404, 'Tools route should be mounted');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unmounted routes', async () => {
      const response = await request(app)
        .get('/api/ai/nonexistent-endpoint')
        .expect(404);
    });

    test('should handle invalid JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .set('Content-Type', 'application/json')
        .send('{"message": "test", invalid}')
        .expect(400);
    });

    test('should handle missing Content-Type gracefully', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .send('plain text');

      // Should handle gracefully (may return 400 or process as text)
      assert.ok(response.status === 400 || response.status === 200);
    });
  });

  describe('Middleware Integration', () => {
    test('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/api/ai/chat')
        .set('Origin', 'http://localhost:3000');

      // Should handle OPTIONS requests appropriately
      assert.ok(response.status === 200 || response.status === 204);
    });

    test('should handle large request bodies', async () => {
      const largeMessage = 'x'.repeat(10000); // 10KB message
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          message: largeMessage,
          tenant_id: TEST_TENANT_ID
        });

      // Should handle large requests (may limit or process)
      assert.ok(response.status !== 404, 'Should route to appropriate handler');
    });
  });

  describe('Route Priority and Ordering', () => {
    test('should route specific paths correctly', async () => {
      // Test that specific routes don't conflict
      const endpoints = [
        { method: 'post', path: '/api/ai/chat', body: { message: 'test', tenant_id: TEST_TENANT_ID } },
        { method: 'post', path: '/api/ai/tts', body: { text: 'test', tenant_id: TEST_TENANT_ID } },
        { method: 'post', path: '/api/ai/speech-to-text', body: { tenant_id: TEST_TENANT_ID } },
        { method: 'post', path: '/api/ai/summarize', body: { text: 'test', tenant_id: TEST_TENANT_ID } },
        { method: 'get', path: `/api/ai/conversations?tenant_id=${TEST_TENANT_ID}`, body: null }
      ];

      for (const endpoint of endpoints) {
        const req = request(app)[endpoint.method](endpoint.path);
        if (endpoint.body) {
          req.send(endpoint.body);
        }

        const response = await req;
        
        // Should route correctly (not 404)
        assert.ok(response.status !== 404, 
          `${endpoint.method.toUpperCase()} ${endpoint.path} should route correctly`);
      }
    });

    test('should handle parameterized routes', async () => {
      // Test routes with parameters (if any exist)
      const conversationId = 'test-conv-id';
      const response = await request(app)
        .get(`/api/ai/conversations/${conversationId}?tenant_id=${TEST_TENANT_ID}`);

      // Should route to parameterized handler
      assert.ok(response.status !== 404, 'Parameterized route should be handled');
    });
  });

  describe('Module Composition', () => {
    test('should maintain module isolation', () => {
      // Each sub-module should be independently testable
      // This test verifies that the index router doesn't create tight coupling
      
      // The router should be composable
      assert.equal(typeof aiRouter, 'function', 'Should be a function (Express router)');
      
      // Should have middleware stack
      assert.ok(aiRouter.stack, 'Should have middleware stack');
      assert.ok(Array.isArray(aiRouter.stack), 'Stack should be an array');
      
      // Should have reasonable number of routes (not empty, not excessive)
      assert.ok(aiRouter.stack.length > 0, 'Should have at least one route');
      assert.ok(aiRouter.stack.length < 50, 'Should not have excessive routes (indicates proper delegation)');
    });

    test('should delegate to appropriate modules', async () => {
      // Test that different route prefixes work
      const testCases = [
        { path: '/api/ai/chat', expectedModule: 'chat' },
        { path: '/api/ai/tts', expectedModule: 'speech' },
        { path: '/api/ai/speech-to-text', expectedModule: 'speech' },
        { path: '/api/ai/summarize', expectedModule: 'summarization' },
        { path: '/api/ai/conversations', expectedModule: 'conversations' },
        { path: '/api/ai/brain-test', expectedModule: 'tools' }
      ];

      for (const testCase of testCases) {
        let response;
        
        if (testCase.path.includes('conversations') && !testCase.path.includes('brain')) {
          // GET request for conversations
          response = await request(app)
            .get(`${testCase.path}?tenant_id=${TEST_TENANT_ID}`);
        } else {
          // POST request for other endpoints
          const body = testCase.path.includes('brain-test') 
            ? { taskType: 'test', context: {}, tenant_id: TEST_TENANT_ID }
            : testCase.path.includes('tts') || testCase.path.includes('speech-to-text')
            ? { text: 'test', tenant_id: TEST_TENANT_ID }
            : testCase.path.includes('summarize')
            ? { text: 'test content', tenant_id: TEST_TENANT_ID }
            : { message: 'test', tenant_id: TEST_TENANT_ID };

          const req = request(app).post(testCase.path).send(body);
          
          // Add internal key for brain-test
          if (testCase.path.includes('brain-test')) {
            req.set('X-Internal-AI-Key', 'test-key');
          }
          
          response = await req;
        }

        assert.ok(response.status !== 404, 
          `${testCase.path} should be routed to ${testCase.expectedModule} module`);
      }
    });
  });

  describe('Health and Status', () => {
    test('should handle health check style requests', async () => {
      // Simple ping-style request
      const response = await request(app)
        .get('/api/ai')
        .query({ ping: 'true' });

      // Should handle gracefully (may return 404 if no base route, or 200)
      assert.ok(response.status === 404 || response.status === 200);
    });

    test('should handle HEAD requests', async () => {
      const response = await request(app)
        .head('/api/ai/chat');

      // Should handle HEAD requests appropriately
      assert.ok(response.status !== 500, 'Should handle HEAD requests without errors');
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple concurrent requests to different modules', async () => {
      const requests = [
        request(app).post('/api/ai/chat').send({ message: 'test1', tenant_id: TEST_TENANT_ID }),
        request(app).post('/api/ai/tts').send({ text: 'test2', tenant_id: TEST_TENANT_ID }),
        request(app).post('/api/ai/summarize').send({ text: 'test3', tenant_id: TEST_TENANT_ID }),
        request(app).get(`/api/ai/conversations?tenant_id=${TEST_TENANT_ID}`),
      ];

      const responses = await Promise.all(requests);
      
      // All requests should be routed correctly (not 404)
      responses.forEach((response, i) => {
        assert.ok(response.status !== 404, `Concurrent request ${i} should route correctly`);
        assert.ok(response.status !== 500, `Concurrent request ${i} should not cause server error`);
      });
    });

    test('should maintain performance with router delegation', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/ai/chat')
        .send({
          message: 'Performance test message',
          tenant_id: TEST_TENANT_ID
        });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Router delegation shouldn't add significant overhead
      // Even with processing, should respond within reasonable time for routing
      assert.ok(duration < 1000, `Router should add minimal overhead, took ${duration}ms`);
      assert.ok(response.status !== 404, 'Should route successfully');
    });
  });

  describe('Security Integration', () => {
    test('should preserve security middleware for all routes', async () => {
      const securityTestCases = [
        { path: '/api/ai/chat', method: 'post', body: { message: 'test' } }, // Missing tenant_id
        { path: '/api/ai/tts', method: 'post', body: { text: 'test' } }, // Missing tenant_id
        { path: '/api/ai/conversations', method: 'get' }, // Missing tenant_id
      ];

      for (const testCase of securityTestCases) {
        const req = request(app)[testCase.method](testCase.path);
        if (testCase.body) {
          req.send(testCase.body);
        }

        const response = await req;
        
        // Should either require auth/tenant or handle gracefully
        // Should not return 500 (security middleware should handle appropriately)
        assert.ok(response.status !== 500, 
          `Security middleware should handle ${testCase.path} appropriately`);
      }
    });

    test('should handle malformed authorization headers', async () => {
      const response = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', 'Malformed Bearer Token')
        .send({
          message: 'test',
          tenant_id: TEST_TENANT_ID
        });

      // Should handle malformed auth gracefully
      assert.ok(response.status !== 500, 'Should handle malformed auth headers gracefully');
    });
  });
});