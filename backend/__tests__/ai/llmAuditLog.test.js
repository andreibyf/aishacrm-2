/**
 * Unit tests for llmAuditLog.js
 *
 * Tests: appendAuditEntry / getAuditLog filtering / ring buffer trim /
 *        getAuditStats / getAuditModels / clearAuditLog.
 *
 * File-append is disabled in tests (LLM_AUDIT_ENABLED not set to 'true').
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  appendAuditEntry,
  getAuditLog,
  getAuditModels,
  getAuditStats,
  clearAuditLog,
} from '../../lib/aiEngine/llmAuditLog.js';

describe('LLM Audit Log', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('appends entries and getAuditLog returns them newest-first', () => {
    appendAuditEntry({ model: 'aisha-task', status: 'success', durationMs: 100 });
    appendAuditEntry({ model: 'aisha-summary', status: 'success', durationMs: 200 });

    const entries = getAuditLog({ limit: 10 });
    assert.equal(entries.length, 2);
    // Newest first
    assert.equal(entries[0].model, 'aisha-summary');
    assert.equal(entries[1].model, 'aisha-task');
  });

  it('filters by model', () => {
    appendAuditEntry({ model: 'aisha-task', status: 'success' });
    appendAuditEntry({ model: 'aisha-summary', status: 'success' });
    appendAuditEntry({ model: 'aisha-task', status: 'error', error: 'timeout' });

    const results = getAuditLog({ model: 'aisha-task' });
    assert.equal(results.length, 2);
    assert.ok(results.every((e) => e.model === 'aisha-task'));
  });

  it('filters by status', () => {
    appendAuditEntry({ model: 'aisha-task', status: 'success' });
    appendAuditEntry({ model: 'aisha-task', status: 'error', error: 'oops' });
    appendAuditEntry({ model: 'aisha-summary', status: 'error', error: 'oops2' });

    const errors = getAuditLog({ status: 'error' });
    assert.equal(errors.length, 2);
    assert.ok(errors.every((e) => e.status === 'error'));
  });

  it('filters by env', () => {
    // Override APP_ENV per entry via opts.env
    appendAuditEntry({ model: 'aisha-task', status: 'success', env: 'prd' });
    appendAuditEntry({ model: 'aisha-task', status: 'success', env: 'staging' });

    const prd = getAuditLog({ env: 'prd' });
    assert.equal(prd.length, 1);
    assert.equal(prd[0].env, 'prd');
  });

  it('filters by since timestamp', async () => {
    appendAuditEntry({ model: 'aisha-task', status: 'success' });
    const checkpoint = new Date().toISOString();
    // Small delay to ensure next ts > checkpoint
    await new Promise((r) => setTimeout(r, 5));
    appendAuditEntry({ model: 'aisha-task', status: 'success' });

    const results = getAuditLog({ since: checkpoint });
    assert.equal(results.length, 1);
  });

  it('respects limit', () => {
    for (let i = 0; i < 20; i++) {
      appendAuditEntry({ model: 'aisha-task', status: 'success' });
    }
    const limited = getAuditLog({ limit: 5 });
    assert.equal(limited.length, 5);
  });

  it('captures request metadata without storing raw messages', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello, how are you? This is a longer user message for testing.' },
    ];
    appendAuditEntry({ model: 'aisha-task', status: 'success', messages, durationMs: 150 });

    const [entry] = getAuditLog({ limit: 1 });
    assert.equal(entry.req_msg_count, 2);
    assert.ok(entry.req_chars > 0, 'req_chars should be positive');
    assert.ok(entry.req_snippet, 'req_snippet should be set from user message');
    // Raw messages must NOT be stored on the entry
    assert.ok(!('messages' in entry), 'raw messages must not appear on audit entry');
  });

  it('truncates response snippet', () => {
    const longContent = 'x'.repeat(1000);
    appendAuditEntry({ model: 'aisha-task', status: 'success', respContent: longContent });

    const [entry] = getAuditLog({ limit: 1 });
    assert.ok(
      entry.resp_snippet.length <= 310,
      'snippet should be truncated (300 chars + ellipsis)',
    );
    assert.ok(entry.resp_chars === 1000, 'resp_chars reflects original length');
  });

  it('getAuditModels returns distinct sorted model names', () => {
    appendAuditEntry({ model: 'aisha-task', status: 'success' });
    appendAuditEntry({ model: 'aisha-summary', status: 'success' });
    appendAuditEntry({ model: 'aisha-task', status: 'success' });

    const models = getAuditModels();
    assert.deepEqual(models, ['aisha-summary', 'aisha-task']);
  });

  it('getAuditStats reports correct ring size', () => {
    appendAuditEntry({ model: 'aisha-task', status: 'success' });
    appendAuditEntry({ model: 'aisha-task', status: 'success' });
    const stats = getAuditStats();
    assert.equal(stats.ringSize, 2);
    assert.equal(stats.ringCap, 1000);
    assert.equal(stats.fileEnabled, false); // LLM_AUDIT_ENABLED not set in test env
  });

  it('clearAuditLog empties the ring buffer', () => {
    appendAuditEntry({ model: 'aisha-task', status: 'success' });
    clearAuditLog();
    assert.equal(getAuditLog().length, 0);
    assert.equal(getAuditStats().ringSize, 0);
  });

  it('entry has required id, ts, node_id, model, status fields', () => {
    appendAuditEntry({ model: 'aisha-task', status: 'success', durationMs: 42 });
    const [entry] = getAuditLog();
    assert.ok(entry.id, 'id must be set');
    assert.ok(entry.ts, 'ts must be set');
    assert.ok(entry.node_id, 'node_id must be set');
    assert.equal(entry.model, 'aisha-task');
    assert.equal(entry.status, 'success');
    assert.equal(entry.duration_ms, 42);
  });

  it('does not throw when opts is missing fields', () => {
    assert.doesNotThrow(() => appendAuditEntry({}));
    assert.doesNotThrow(() => appendAuditEntry({ model: 'x' }));
  });
});
