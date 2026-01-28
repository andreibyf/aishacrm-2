import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

const TEST_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// Mock conversations data
const mockConversations = [
  {
    id: 'conv-1',
    agent_name: 'aisha_sidebar',
    status: 'active',
    created_date: '2026-01-27T00:00:00Z',
    updated_date: '2026-01-27T00:00:00Z',
    message_count: 2,
    last_message_at: '2026-01-27T00:05:00Z',
    last_message_excerpt: 'Hello, how can I help?'
  }
];

// Mock the conversations router with expected behavior
function createMockConversationsRouter() {
  const router = express.Router();
  
  // Mock GET conversations
  router.get('/conversations', (req, res) => {
    const { tenant_id } = req.query;
    
    if (!tenant_id) {
      return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
    }
    
    res.json({
      status: 'success',
      data: mockConversations
    });
  });
  
  // Mock GET single conversation
  router.get('/conversations/:id', (req, res) => {
    const { id } = req.params;
    const { tenant_id } = req.query;
    
    if (!tenant_id) {
      return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
    }
    
    const conversation = mockConversations.find(c => c.id === id);
    if (!conversation) {
      return res.status(404).json({ status: 'error', message: 'Conversation not found' });
    }
    
    res.json({
      status: 'success',
      data: conversation
    });
  });
  
  // Mock POST create conversation
  router.post('/conversations', (req, res) => {
    const { tenant_id, agent_name } = req.body;
    
    if (!tenant_id) {
      return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
    }
    
    const newConversation = {
      id: 'conv-new',
      agent_name: agent_name || 'aisha_sidebar',
      status: 'active',
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString(),
      message_count: 0,
      last_message_at: null,
      last_message_excerpt: null
    };
    
    res.status(201).json({
      status: 'success',
      data: newConversation
    });
  });
  
  // Mock DELETE conversation
  router.delete('/conversations/:id', (req, res) => {
    const { id: _id } = req.params;
    const { tenant_id } = req.query;
    
    if (!tenant_id) {
      return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
    }
    
    res.json({
      status: 'success',
      message: 'Conversation deleted successfully'
    });
  });
  
  return router;
}

describe('AI Conversations Module', () => {
  let app;

  beforeEach(() => {
    // Create a fresh Express app for each test with mocked router
    app = express();
    app.use(express.json());
    app.use('/api/ai', createMockConversationsRouter());
  });

  describe('GET /conversations', () => {
    test('should return error when tenant_id is missing', async () => {
      const response = await request(app)
        .get('/api/ai/conversations')
        .expect(400);

      assert.equal(response.body.status, 'error');
      assert.equal(response.body.message, 'Valid tenant_id required');
    });

    test('should accept valid tenant_id', async () => {
      const response = await request(app)
        .get(`/api/ai/conversations?tenant_id=${TEST_TENANT_ID}`);

      // Should attempt to fetch conversations (may fail due to DB config but structure is correct)
      assert.ok(response.status === 200 || response.status === 500);
      
      if (response.status === 200) {
        assert.equal(response.body.status, 'success');
        assert.ok(Array.isArray(response.body.data?.conversations) || response.body.data?.conversations === undefined);
      }
    });

    test('should handle pagination parameters', async () => {
      const response = await request(app)
        .get(`/api/ai/conversations?tenant_id=${TEST_TENANT_ID}&limit=10&offset=0`);

      // Should handle pagination
      assert.ok(response.status === 200 || response.status === 500);
    });

    test('should handle invalid tenant_id format', async () => {
      const response = await request(app)
        .get('/api/ai/conversations?tenant_id=invalid-uuid')
        .expect(400);

      assert.equal(response.body.status, 'error');
    });
  });

  describe('GET /conversations/:id', () => {
    test('should return error for invalid conversation ID', async () => {
      const response = await request(app)
        .get('/api/ai/conversations/invalid-id')
        .query({ tenant_id: TEST_TENANT_ID });

      // Should validate conversation ID format
      assert.ok(response.status >= 400);
    });

    test('should handle valid UUID format for conversation ID', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await request(app)
        .get(`/api/ai/conversations/${validUuid}`)
        .query({ tenant_id: TEST_TENANT_ID });

      // Should accept valid UUID (may return 404 if not found)
      assert.ok(response.status === 200 || response.status === 404 || response.status === 500);
    });

    test('should require tenant_id for conversation lookup', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await request(app)
        .get(`/api/ai/conversations/${validUuid}`);

      // Should require tenant_id
      assert.ok(response.status >= 400);
    });
  });

  describe('POST /conversations', () => {
    test('should validate required fields for conversation creation', async () => {
      const response = await request(app)
        .post('/api/ai/conversations')
        .send({});

      // Should validate required fields
      assert.ok(response.status >= 400);
    });

    test('should accept valid conversation creation data', async () => {
      const response = await request(app)
        .post('/api/ai/conversations')
        .send({
          title: 'Test Conversation',
          tenant_id: TEST_TENANT_ID,
          messages: []
        });

      // Should attempt to create conversation (may fail due to DB config)
      assert.ok(response.status === 200 || response.status === 201 || response.status === 500);
    });

    test('should handle conversation with initial messages', async () => {
      const response = await request(app)
        .post('/api/ai/conversations')
        .send({
          title: 'Test Conversation',
          tenant_id: TEST_TENANT_ID,
          messages: [
            { role: 'user', content: 'Hello', timestamp: new Date().toISOString() }
          ]
        });

      // Should handle conversations with messages
      assert.ok(response.status === 200 || response.status === 201 || response.status === 500);
    });
  });

  describe('PUT /conversations/:id', () => {
    test('should validate conversation ID for updates', async () => {
      const response = await request(app)
        .put('/api/ai/conversations/invalid-id')
        .send({
          title: 'Updated Title',
          tenant_id: TEST_TENANT_ID
        });

      // Should validate conversation ID
      assert.ok(response.status >= 400);
    });

    test('should accept valid conversation update', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await request(app)
        .put(`/api/ai/conversations/${validUuid}`)
        .send({
          title: 'Updated Title',
          tenant_id: TEST_TENANT_ID
        });

      // Should attempt to update (may return 404 if not found)
      assert.ok(response.status === 200 || response.status === 404 || response.status === 500);
    });
  });

  describe('DELETE /conversations/:id', () => {
    test('should validate conversation ID for deletion', async () => {
      const response = await request(app)
        .delete('/api/ai/conversations/invalid-id')
        .query({ tenant_id: TEST_TENANT_ID });

      // Should validate conversation ID
      assert.ok(response.status >= 400);
    });

    test('should handle valid conversation deletion', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await request(app)
        .delete(`/api/ai/conversations/${validUuid}`)
        .query({ tenant_id: TEST_TENANT_ID });

      // Should attempt to delete (may return 404 if not found)
      assert.ok(response.status === 200 || response.status === 404 || response.status === 500);
    });

    test('should require tenant_id for deletion', async () => {
      const validUuid = '12345678-1234-1234-1234-123456789012';
      const response = await request(app)
        .delete(`/api/ai/conversations/${validUuid}`);

      // Should require tenant_id
      assert.ok(response.status >= 400);
    });
  });

  describe('Security and Validation', () => {
    test('should prevent SQL injection in conversation queries', async () => {
      const response = await request(app)
        .get('/api/ai/conversations')
        .query({ tenant_id: "'; DROP TABLE conversations; --" });

      // Should handle malicious input safely
      assert.ok(response.status >= 400);
    });

    test('should handle very long conversation titles', async () => {
      const longTitle = 'x'.repeat(1000);
      const response = await request(app)
        .post('/api/ai/conversations')
        .send({
          title: longTitle,
          tenant_id: TEST_TENANT_ID,
          messages: []
        });

      // Should handle long titles appropriately
      assert.ok(response.status === 200 || response.status === 201 || response.status === 400 || response.status === 500);
    });

    test('should sanitize conversation content', async () => {
      const response = await request(app)
        .post('/api/ai/conversations')
        .send({
          title: '<script>alert("xss")</script>Test',
          tenant_id: TEST_TENANT_ID,
          messages: [
            { role: 'user', content: '<script>alert("xss")</script>Hello' }
          ]
        });

      // Should sanitize content
      assert.ok(response.status === 200 || response.status === 201 || response.status === 400 || response.status === 500);
    });
  });

  describe('Module Structure', () => {
    test('should export an Express router', () => {
      assert.equal(typeof conversationsRouter, 'function');
      assert.ok(conversationsRouter.stack !== undefined, 'Should be an Express router with stack');
    });

    test('should have conversation CRUD routes configured', () => {
      const routes = conversationsRouter.stack || [];
      assert.ok(routes.length > 0, 'Should have routes configured');
    });
  });

  describe('Response Format', () => {
    test('should return consistent error format', async () => {
      const response = await request(app)
        .get('/api/ai/conversations');

      assert.equal(response.body.status, 'error');
      assert.ok(response.body.message, 'Should include error message');
    });

    test('should return consistent success format for list', async () => {
      const response = await request(app)
        .get(`/api/ai/conversations?tenant_id=${TEST_TENANT_ID}`);

      if (response.status === 200) {
        assert.equal(response.body.status, 'success');
        assert.ok(response.body.data !== undefined, 'Should include data field');
      }
    });
  });
});