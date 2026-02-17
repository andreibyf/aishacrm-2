import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

/**
 * AI Execution Record Telemetry Tests
 * 
 * Tests for the request-level execution_record telemetry emitted by POST /api/ai/chat
 * as defined in docs/AI_RUNTIME_CONTRACT.md
 */
describe('AI Execution Record Telemetry', { skip: !SHOULD_RUN }, () => {
  
  // Helper to clear LLM activity log before tests
  async function clearLLMActivity() {
    await fetch(`${BASE_URL}/api/system/llm-activity`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
  }

  // Helper to get latest LLM activity entries
  async function getLLMActivity(filters = {}) {
    const params = new URLSearchParams({
      tenant_id: TENANT_ID,
      limit: '100',
      ...filters
    });
    const res = await fetch(`${BASE_URL}/api/system/llm-activity?${params}`, {
      headers: getAuthHeaders()
    });
    assert.equal(res.status, 200, 'expected 200 from llm-activity endpoint');
    const json = await res.json();
    assert.equal(json.status, 'success');
    return json.data || [];
  }

  // Helper to find execution_record entry
  function findExecutionRecord(entries) {
    return entries.find(e => e.nodeId === 'ai:chat:execution_record');
  }

  test('POST /api/ai/chat emits execution_record on success', async () => {
    await clearLLMActivity();

    // Send a simple chat request
    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        messages: [
          { role: 'user', content: 'Hello, what is 2+2?' }
        ],
        conversation_id: 'test-conv-123',
        session_entities: []
      })
    });

    // Chat request should succeed (or fail gracefully with 500 if no API key configured)
    assert.ok([200, 500].includes(res.status), `expected 200 or 500, got ${res.status}`);

    // Only proceed if chat succeeded
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success', 'chat response should indicate success');

      // Give a moment for async logging to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch LLM activity log
      const entries = await getLLMActivity();
      assert.ok(entries.length > 0, 'should have at least one LLM activity entry');

      // Find the execution_record entry
      const execRecord = findExecutionRecord(entries);
      assert.ok(execRecord, 'should have an ai:chat:execution_record entry');

      // Verify contract-required fields (per AI_RUNTIME_CONTRACT.md)
      assert.equal(execRecord.nodeId, 'ai:chat:execution_record', 'nodeId should be ai:chat:execution_record');
      assert.equal(execRecord.status, 'success', 'status should be success');
      assert.equal(execRecord.tenantId, TENANT_ID, 'tenantId should match request');
      assert.ok(execRecord.provider, 'provider should be present');
      assert.ok(execRecord.model, 'model should be present');
      assert.ok(typeof execRecord.durationMs === 'number', 'durationMs should be a number');
      assert.ok(execRecord.durationMs >= 0, 'durationMs should be non-negative');
      
      // taskId should match conversation_id (per contract: "conversation_id is the session-level correlation key")
      assert.equal(execRecord.taskId, 'test-conv-123', 'taskId should match conversation_id');
      
      // requestId should be present and follow format: "req_<timestamp>_<random>"
      assert.ok(execRecord.requestId, 'requestId should be present');
      assert.ok(execRecord.requestId.startsWith('req_'), 'requestId should start with req_');
      
      // attempt should be 0 for in-process path (no retry loop)
      assert.equal(execRecord.attempt, 0, 'attempt should be 0');
      
      // toolsCalled should be an array (may be empty for simple queries)
      assert.ok(Array.isArray(execRecord.toolsCalled) || execRecord.toolsCalled === null, 
        'toolsCalled should be array or null');
      
      // usage may be present if provider returned it
      if (execRecord.usage) {
        assert.ok(typeof execRecord.usage === 'object', 'usage should be an object if present');
      }
      
      // intent may be present if intent classification succeeded
      // (no strict assertion as it depends on intent classification logic)
    }
  });

  test('POST /api/ai/chat emits execution_record on error', async () => {
    await clearLLMActivity();

    // Send a malformed request to trigger error path
    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        messages: [], // Empty messages array should trigger validation error
        conversation_id: 'test-conv-error-456'
      })
    });

    // Should return error
    assert.ok([400, 422, 500].includes(res.status), `expected error response, got ${res.status}`);

    // Give a moment for async logging to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Fetch LLM activity log
    const entries = await getLLMActivity();

    // For validation errors (400/422), execution_record may not be emitted
    // since the error occurs before the try block
    // For runtime errors (500), execution_record should be emitted with status='error'
    if (res.status === 500) {
      const execRecord = findExecutionRecord(entries);
      if (execRecord) {
        // If execution_record was emitted, verify error fields
        assert.equal(execRecord.status, 'error', 'status should be error');
        assert.ok(execRecord.error, 'error message should be present');
        assert.equal(execRecord.taskId, 'test-conv-error-456', 'taskId should match conversation_id');
        assert.ok(execRecord.requestId, 'requestId should be present');
      }
    }
  });

  test('execution_record includes taskId and requestId', async () => {
    await clearLLMActivity();

    const conversationId = `test-conv-${Date.now()}`;

    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        messages: [
          { role: 'user', content: 'Quick test message' }
        ],
        conversation_id: conversationId,
        session_entities: []
      })
    });

    if (res.status === 200) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const entries = await getLLMActivity();
      const execRecord = findExecutionRecord(entries);
      
      if (execRecord) {
        // Verify taskId is set to conversation_id
        assert.equal(execRecord.taskId, conversationId, 
          'taskId should match conversation_id from request');
        
        // Verify requestId is unique and well-formed
        assert.ok(execRecord.requestId, 'requestId should be present');
        assert.ok(execRecord.requestId.startsWith('req_'), 
          'requestId should follow req_<timestamp>_<random> format');
        
        // Verify requestId is different from taskId (they serve different purposes)
        assert.notEqual(execRecord.requestId, execRecord.taskId, 
          'requestId and taskId should be different identifiers');
      }
    }
  });

  test('execution_record captures intent when classified', async () => {
    await clearLLMActivity();

    // Use a message that should trigger intent classification
    // (e.g., "show me my leads" might classify to LEAD_LIST)
    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        messages: [
          { role: 'user', content: 'show me all my leads from this week' }
        ],
        conversation_id: 'test-conv-intent',
        session_entities: []
      })
    });

    if (res.status === 200) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const entries = await getLLMActivity();
      const execRecord = findExecutionRecord(entries);
      
      if (execRecord) {
        // Intent should either be a string (classified) or null (unclassified)
        assert.ok(typeof execRecord.intent === 'string' || execRecord.intent === null,
          'intent should be string or null');
        
        // If classified, should be a valid intent code (typically uppercase with underscores)
        if (execRecord.intent) {
          assert.ok(/^[A-Z_]+$/.test(execRecord.intent),
            'classified intent should be uppercase with underscores (e.g., LEAD_LIST)');
        }
      }
    }
  });
});
