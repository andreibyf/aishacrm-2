/**
 * Tests for the lite→full escalation logic.
 * [2026-06-12 Claude] Phase 4 of the lite-tier quality pipeline.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  severityOf,
  shouldEscalateNow,
  recordOutcome,
  escalationRate,
  shouldRecommendFull,
  _resetCounters,
} from '../../../lib/quality/escalator.js';

describe('severityOf', () => {
  it('ranks severe > mild > minor > unknown', () => {
    assert.ok(severityOf({ severity: 'severe' }) > severityOf({ severity: 'mild' }));
    assert.ok(severityOf({ severity: 'mild' }) > severityOf({ severity: 'minor' }));
    assert.equal(severityOf({ severity: 'nope' }), 0);
    assert.equal(severityOf({}), 0);
  });
});

describe('shouldEscalateNow', () => {
  it('escalates multi-step tasks up front', () => {
    assert.deepEqual(shouldEscalateNow({ isMultiStep: true, defects: [] }), {
      escalate: true,
      reason: 'multi_step',
    });
  });

  it('escalates immediately on a severe defect', () => {
    const r = shouldEscalateNow({ defects: [{ severity: 'severe' }], attempts: 0, cap: 1 });
    assert.equal(r.escalate, true);
    assert.equal(r.reason, 'severe_defect');
  });

  it('does NOT escalate on a mild defect before the cap', () => {
    const r = shouldEscalateNow({ defects: [{ severity: 'mild' }], attempts: 0, cap: 1 });
    assert.equal(r.escalate, false);
  });

  it('escalates once the refine cap is spent with defects remaining', () => {
    const r = shouldEscalateNow({ defects: [{ severity: 'mild' }], attempts: 1, cap: 1 });
    assert.equal(r.escalate, true);
    assert.equal(r.reason, 'refine_cap_exhausted');
  });

  it('does not escalate a clean pass at the cap', () => {
    const r = shouldEscalateNow({ defects: [], attempts: 1, cap: 1 });
    assert.equal(r.escalate, false);
  });
});

describe('frequency tracking', () => {
  beforeEach(() => _resetCounters());

  it('tracks escalation rate per (agent, task-type)', () => {
    recordOutcome({ agent: 'sales:dev', taskType: 'email_draft', escalated: true });
    recordOutcome({ agent: 'sales:dev', taskType: 'email_draft', escalated: false });
    assert.equal(escalationRate('sales:dev', 'email_draft'), 0.5);
    assert.equal(escalationRate('sales:dev', 'note_summary'), 0); // isolated key
  });

  it('recommends full only above threshold and min samples', () => {
    // 4 of 4 escalate but below minSamples(10) → no recommendation yet
    for (let i = 0; i < 4; i++) {
      recordOutcome({ agent: 'cs:dev', taskType: 'generic_text', escalated: true });
    }
    assert.equal(shouldRecommendFull('cs:dev', 'generic_text'), false);
    // push to 12 total, all escalating → over threshold + samples
    for (let i = 0; i < 8; i++) {
      recordOutcome({ agent: 'cs:dev', taskType: 'generic_text', escalated: true });
    }
    assert.equal(shouldRecommendFull('cs:dev', 'generic_text'), true);
  });

  it('does not recommend full for a low escalation rate', () => {
    for (let i = 0; i < 20; i++) {
      recordOutcome({ agent: 'pm:dev', taskType: 'activity_create', escalated: i < 2 });
    }
    assert.equal(shouldRecommendFull('pm:dev', 'activity_create'), false); // 2/20 = 0.1
  });
});
