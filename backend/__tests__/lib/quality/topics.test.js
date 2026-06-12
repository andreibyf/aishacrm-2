/**
 * Tests for topic / tool-facet classification used by the request monitor.
 * [2026-06-11 Claude] Request monitor — topic-aligned-with-tools.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectIntents,
  facetsFromTools,
  topicLabel,
  computeTopicMismatch,
} from '../../../lib/quality/taskType.js';

describe('detectIntents', () => {
  it('detects a single intent', () => {
    assert.deepEqual(detectIntents('Draft an introductory email to Sarah'), ['email']);
  });

  it('detects compound intents (email + note)', () => {
    const intents = detectIntents('Draft an email to Sarah and add a note to her contact');
    assert.ok(intents.includes('email'));
    assert.ok(intents.includes('note'));
  });

  it('detects activity / summary intents', () => {
    assert.ok(detectIntents('Schedule a meeting for Tuesday').includes('activity'));
    assert.ok(detectIntents('Summarize the call notes').includes('summary'));
  });

  it('returns [] when nothing matches', () => {
    assert.deepEqual(detectIntents('hello there'), []);
  });
});

describe('facetsFromTools', () => {
  it('maps tool names to facets and de-dupes', () => {
    assert.deepEqual(facetsFromTools(['draft_email', 'create_note', 'createNote']).sort(), [
      'email',
      'note',
    ]);
  });

  it('ignores unknown tools', () => {
    assert.deepEqual(facetsFromTools(['fetch_tenant_snapshot', 'create_activity']), ['activity']);
  });

  it('handles empty / missing input', () => {
    assert.deepEqual(facetsFromTools(), []);
    assert.deepEqual(facetsFromTools([]), []);
  });
});

describe('topicLabel', () => {
  it('joins facets in a stable order', () => {
    assert.equal(topicLabel(['note', 'email']), 'email+note');
    assert.equal(topicLabel(['email', 'note']), 'email+note');
  });

  it('labels empty as other', () => {
    assert.equal(topicLabel([]), 'other');
  });
});

describe('computeTopicMismatch', () => {
  it('flags a requested action whose tool never ran', () => {
    const r = computeTopicMismatch({
      requestedIntents: ['email', 'note'],
      actualFacets: ['email'], // note tool never fired
    });
    assert.equal(r.mismatch, true);
    assert.match(r.reasons[0], /note/);
  });

  it('does NOT flag email/summary absence (text-satisfiable)', () => {
    const r = computeTopicMismatch({
      requestedIntents: ['email', 'summary'],
      actualFacets: [], // no tools, but email/summary can be text output
    });
    assert.equal(r.mismatch, false);
  });

  it('flags a failed quality gate', () => {
    const r = computeTopicMismatch({
      requestedIntents: ['email'],
      actualFacets: ['email'],
      gatePass: false,
    });
    assert.equal(r.mismatch, true);
    assert.match(r.reasons.join(' '), /gate/);
  });

  it('clean when requested actions all ran and gate passed', () => {
    const r = computeTopicMismatch({
      requestedIntents: ['note', 'activity'],
      actualFacets: ['note', 'activity'],
      gatePass: true,
    });
    assert.equal(r.mismatch, false);
    assert.deepEqual(r.reasons, []);
  });
});
