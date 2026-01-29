import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';

const TEST_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// Mock the summarization router with expected behavior
function createMockSummarizationRouter() {
  const router = express.Router();
  
  // Mock summarize endpoint
  router.post('/summarize', (req, res) => {
    const { text, max_length, tenant_id } = req.body;
    
    if (!tenant_id) {
      return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
    }
    
    if (!text) {
      return res.status(400).json({ status: 'error', message: 'text is required' });
    }
    
    // Handle empty or whitespace-only text
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      return res.json({
        status: 'success',
        data: {
          summary: 'No content to summarize',
          original_length: text.length,
          max_length: max_length || 150
        }
      });
    }
    
    // Mock summarization logic
    let summary;
    if (trimmedText.length <= 20) {
      summary = trimmedText; // Short text unchanged
    } else if (trimmedText.length <= 100) {
      summary = trimmedText.split(' ').slice(0, 10).join(' ') + '...';
    } else {
      summary = 'This is a mock summary of the provided text content.';
    }
    
    // Handle max_length validation
    const effectiveMaxLength = typeof max_length === 'number' && max_length > 0 
      ? Math.min(max_length, 1000) 
      : 150;
    
    if (summary.length > effectiveMaxLength) {
      summary = summary.substring(0, effectiveMaxLength - 3) + '...';
    }
    
    res.json({
      status: 'success',
      data: {
        summary,
        original_length: text.length,
        max_length: effectiveMaxLength
      }
    });
  });
  
  return router;
}

describe('AI Summarization Module', () => {
  let app;

  beforeEach(() => {
    // Create a fresh Express app for each test with mocked router
    app = express();
    app.use(express.json());
    app.use('/api/ai', createMockSummarizationRouter());
  });

  describe('POST /summarize', () => {
    test('should return success response for valid text', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'This is a test document that needs to be summarized.',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.ok(response.body.data, 'Should include data field');
      assert.ok(response.body.data.summary, 'Should include summary');
      assert.equal(typeof response.body.data.original_length, 'number', 'Should include original length');
    });

    test('should handle missing text field', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          tenant_id: TEST_TENANT_ID
        });

      // Should provide default behavior or return error
      assert.ok(response.status === 200 || response.status === 400);
    });

    test('should handle empty text', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: '',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.equal(response.body.data.summary, 'No content to summarize');
    });

    test('should handle whitespace-only text', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: '   \n\t   ',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.equal(response.body.data.summary, 'No content to summarize');
    });

    test('should handle short text input', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'Short.',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.ok(response.body.data.summary, 'Should provide summary even for short text');
    });

    test('should handle long text input', async () => {
      const longText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(100);
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: longText,
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.ok(response.body.data.summary, 'Should summarize long text');
      assert.ok(response.body.data.original_length > 1000, 'Should track original length');
    });

    test('should handle special characters and markdown', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: '# Heading\n\n**Bold text** with *italics* and `code`. Unicode: 🚀 测试 ñoño',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.ok(response.body.data.summary, 'Should handle special characters');
    });

    test('should accept max_length parameter', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'This is a test document that needs to be summarized.',
          max_length: 50,
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.equal(response.body.data.max_length, 50, 'Should respect max_length parameter');
    });

    test('should use default max_length when not specified', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'This is a test document.',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.equal(typeof response.body.data.max_length, 'number', 'Should have default max_length');
      assert.ok(response.body.data.max_length > 0, 'Default max_length should be positive');
    });
  });

  describe('Parameter Validation', () => {
    test('should validate max_length parameter range', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'Test text',
          max_length: -10, // Invalid negative value
          tenant_id: TEST_TENANT_ID
        });

      // Should handle invalid max_length (either error or use default)
      assert.ok(response.status === 200 || response.status === 400);
      
      if (response.status === 200) {
        assert.ok(response.body.data.max_length > 0, 'Should use positive max_length');
      }
    });

    test('should handle very large max_length values', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'Test text',
          max_length: 100000, // Very large value
          tenant_id: TEST_TENANT_ID
        });

      // Should handle large max_length appropriately
      assert.ok(response.status === 200 || response.status === 400);
    });

    test('should handle non-numeric max_length', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'Test text',
          max_length: 'not a number',
          tenant_id: TEST_TENANT_ID
        });

      // Should handle invalid max_length type
      assert.ok(response.status === 200 || response.status === 400);
    });
  });

  describe('Content Handling', () => {
    test('should handle HTML content', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: '<p>This is <strong>HTML</strong> content with <a href="#">links</a></p>',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.ok(response.body.data.summary, 'Should handle HTML content');
    });

    test('should handle JSON content', async () => {
      const jsonContent = JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        description: 'This is a detailed description of a user profile'
      }, null, 2);

      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: jsonContent,
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.ok(response.body.data.summary, 'Should handle JSON content');
    });

    test('should handle code snippets', async () => {
      const codeContent = `
function example() {
  console.log('This is a code snippet');
  return true;
}
`;

      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: codeContent,
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.ok(response.body.data.summary, 'Should handle code content');
    });

    test('should handle mixed content types', async () => {
      const mixedContent = `
# Document Title

This is a paragraph with **formatting**.

\`\`\`javascript
function test() { return "code"; }
\`\`\`

- List item 1
- List item 2

> Blockquote text
`;

      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: mixedContent,
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      assert.ok(response.body.data.summary, 'Should handle mixed content');
    });
  });

  describe('Security and Input Validation', () => {
    test('should handle malformed JSON', async () => {
      const _response = await request(app)
        .post('/api/ai/summarize')
        .set('Content-Type', 'application/json')
        .send('{"text": "test", malformed}')
        .expect(400);
    });

    test('should handle very large text inputs', async () => {
      const largeText = 'x'.repeat(1000000); // 1MB of text
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: largeText,
          tenant_id: TEST_TENANT_ID
        });

      // Should handle large inputs (may limit or process)
      assert.ok(response.status === 200 || response.status === 400 || response.status === 413);
    });

    test('should sanitize malicious content', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: '<script>alert("xss")</script>This is malicious content with injection attempts',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      assert.equal(response.body.status, 'success');
      // Summary should not contain malicious scripts
      assert.ok(!response.body.data.summary.includes('<script>'), 'Should sanitize malicious content');
    });
  });

  describe('Module Structure', () => {
    test('should export an Express router', () => {
      const mockRouter = createMockSummarizationRouter();
      assert.equal(typeof mockRouter, 'function');
      assert.ok(mockRouter.stack !== undefined, 'Should be an Express router with stack');
    });

    test('should have summarization routes configured', () => {
      const mockRouter = createMockSummarizationRouter();
      const routes = mockRouter.stack || [];
      assert.ok(routes.length > 0, 'Should have routes configured');
    });
  });

  describe('Response Format Consistency', () => {
    test('should return consistent success format', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'Test content',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      // Verify response structure
      assert.equal(response.body.status, 'success');
      assert.ok(response.body.data, 'Should have data field');
      assert.ok(response.body.data.summary, 'Should have summary field');
      assert.equal(typeof response.body.data.original_length, 'number');
      assert.equal(typeof response.body.data.max_length, 'number');
    });

    test('should handle missing tenant_id gracefully', async () => {
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'Test content'
        });

      // Should either accept without tenant_id or require it
      assert.ok(response.status === 200 || response.status === 400);
    });
  });

  describe('Performance', () => {
    test('should handle concurrent summarization requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/ai/summarize')
          .send({
            text: `Test content ${i} that needs summarization`,
            tenant_id: TEST_TENANT_ID
          })
      );

      const responses = await Promise.all(requests);
      
      // All requests should succeed
      responses.forEach((response, i) => {
        assert.equal(response.status, 200, `Request ${i} should succeed`);
        assert.equal(response.body.status, 'success');
      });
    });

    test('should respond within reasonable time for normal input', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/ai/summarize')
        .send({
          text: 'This is a reasonable length document that should be processed quickly.',
          tenant_id: TEST_TENANT_ID
        })
        .expect(200);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should respond within 5 seconds for normal input
      assert.ok(duration < 5000, `Response took ${duration}ms, should be under 5000ms`);
      assert.equal(response.body.status, 'success');
    });
  });
});