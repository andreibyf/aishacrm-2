/**
 * Tests for the task-worker per-run mutation idempotency guard.
 * Ensures identical mutating calls are flagged as duplicates (so the worker skips
 * re-execution and avoids duplicate records), reads are never deduped, and the
 * signature is stable regardless of arg key order.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MutationGuard,
  isMutatingTool,
  toolCallSignature,
} from '../../../lib/agents/toolCallDedup.js';

describe('isMutatingTool', () => {
  it('treats create/update/delete/log/send/etc as mutating', () => {
    for (const t of ['create_note', 'create_activity', 'update_lead', 'delete_contact', 'log_call', 'send_email', 'schedule_meeting', 'convert_lead']) {
      assert.equal(isMutatingTool(t), true, t);
    }
  });
  it('treats reads/searches as non-mutating', () => {
    for (const t of ['search_accounts', 'get_contact', 'list_opportunities', 'find_notes', 'snapshot']) {
      assert.equal(isMutatingTool(t), false, t);
    }
  });
});

describe('toolCallSignature', () => {
  it('is stable regardless of key order', () => {
    const a = toolCallSignature('create_note', { title: 'x', entity_id: '1', content: 'y' });
    const b = toolCallSignature('create_note', { content: 'y', title: 'x', entity_id: '1' });
    assert.equal(a, b);
  });
  it('differs when args differ', () => {
    const a = toolCallSignature('create_note', { title: 'x' });
    const b = toolCallSignature('create_note', { title: 'z' });
    assert.notEqual(a, b);
  });

  it('ignores system/injected keys so dedup survives an inconsistent tenant_id', () => {
    // Regression: weak models set tenant_id null on the first call then the real id
    // afterward; Braid overrides it anyway. It must NOT affect the signature, or two
    // identical creates look different and the duplicate slips through.
    const first = toolCallSignature('create_note', {
      title: 'T',
      content: 'C',
      entity_id: 'e01',
      tenant_id: null,
    });
    const later = toolCallSignature('create_note', {
      title: 'T',
      content: 'C',
      entity_id: 'e01',
      tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    });
    assert.equal(first, later);
  });

  it('also ignores created_by / id / timestamps', () => {
    const a = toolCallSignature('create_note', { title: 'T', created_by: 'X', id: '1' });
    const b = toolCallSignature('create_note', { title: 'T', created_by: 'Y', id: '2' });
    assert.equal(a, b);
  });
});

describe('MutationGuard', () => {
  it('flags an identical mutating call as a duplicate after it is recorded', () => {
    const g = new MutationGuard();
    const args = { entity_type: 'account', entity_id: 'acc-1', title: 'Note', content: 'hi' };

    // First call: not a duplicate.
    assert.equal(g.check('create_note', args).duplicate, false);
    g.record('create_note', args, { tag: 'Ok', value: { id: 'note-1' } });

    // Identical second call (the loop): duplicate, with the prior result available.
    const second = g.check('create_note', { ...args });
    assert.equal(second.duplicate, true);
    assert.deepEqual(second.priorResult, { tag: 'Ok', value: { id: 'note-1' } });
  });

  it('does NOT flag a different mutating call (different args)', () => {
    const g = new MutationGuard();
    g.record('create_note', { title: 'A' }, { tag: 'Ok' });
    assert.equal(g.check('create_note', { title: 'B' }).duplicate, false);
  });

  it('never dedupes reads — repeating a search is allowed', () => {
    const g = new MutationGuard();
    g.record('search_accounts', { query: 'acme' }, { tag: 'Ok' });
    assert.equal(g.check('search_accounts', { query: 'acme' }).duplicate, false);
  });

  it('distinguishes different mutating tools with the same args', () => {
    const g = new MutationGuard();
    const args = { entity_id: 'x' };
    g.record('create_note', args, { tag: 'Ok' });
    assert.equal(g.check('create_activity', args).duplicate, false);
  });
});
