/**
 * Tests for the lite-tier quality pipeline orchestrator.
 * [2026-06-12 Claude] Phase 3 of the lite-tier quality pipeline — control flow:
 * gate → rule-fix | refine | escalate → re-gate, shadow vs active.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runQualityPipeline } from '../../../lib/quality/runQualityPipeline.js';
import { _resetCounters } from '../../../lib/quality/escalator.js';

// Stub client that routes by system prompt: the critic says "reviewer",
// the refiner says "revise".
function makeClient({ critic = '{"relevant":true,"missing":[]}', refine = '' } = {}) {
  return {
    chat: {
      completions: {
        create: async (args) => {
          const sys = args.messages?.[0]?.content || '';
          const reply = /reviewer/i.test(sys) ? critic : refine;
          return { choices: [{ message: { content: reply } }] };
        },
      },
    },
  };
}

const PROFILE = { display_name: 'Dana Reed' };

describe('runQualityPipeline', () => {
  beforeEach(() => _resetCounters());

  it('ships a clean output unchanged with no escalation', async () => {
    const output = 'Hi Acme Corporation, reaching out about your renewal. Can we schedule a call?';
    const { output: out, meta } = await runQualityPipeline({
      output,
      taskType: 'email_draft',
      taskDescription: 'Draft an email to Acme Corporation about the renewal',
      agentProfile: PROFILE,
      config: { mode: 'active' },
    });
    assert.equal(out, output);
    assert.equal(meta.finalGatePass, true);
    assert.equal(meta.escalated, false);
    assert.equal(meta.refineCount, 0);
  });

  it('escalates a multi-step task up front in active mode, observes only in shadow', async () => {
    const base = {
      output: 'whatever',
      taskType: 'generic_text',
      isMultiStep: true,
      taskDescription: 'Email Acme, then once they reply schedule a call',
    };
    const active = await runQualityPipeline({ ...base, config: { mode: 'active' } });
    assert.equal(active.meta.escalated, true);
    assert.equal(active.meta.escalateReason, 'multi_step');

    const shadow = await runQualityPipeline({ ...base, config: { mode: 'shadow' } });
    assert.equal(shadow.meta.escalated, false);
    assert.equal(shadow.meta.escalateReason, 'multi_step');
  });

  it('escalates immediately on a severe (off-topic) relevance miss, skipping refine', async () => {
    let refineCalled = false;
    const client = {
      chat: {
        completions: {
          create: async () => {
            refineCalled = true;
            return { choices: [{ message: { content: 'x' } }] };
          },
        },
      },
    };
    const { meta } = await runQualityPipeline({
      output: 'The weather today is sunny and warm.',
      taskType: 'email_draft',
      taskDescription: 'Email Acme Corporation about renewal',
      agentProfile: PROFILE,
      client,
      model: 'aisha-task-lite',
      config: { mode: 'active' },
    });
    assert.equal(meta.escalated, true);
    assert.equal(meta.escalateReason, 'severe_defect');
    assert.equal(meta.refineCount, 0);
    assert.equal(refineCalled, false);
  });

  it('rule-fixes a mechanical placeholder defect without a model call (active)', async () => {
    const output =
      'Hi Acme Corporation, about your renewal. Let me know if we can chat. [Your Name]';
    const { output: out, meta } = await runQualityPipeline({
      output,
      taskType: 'email_draft',
      taskDescription: 'Email Acme Corporation about renewal',
      agentProfile: PROFILE,
      config: { mode: 'active' },
    });
    assert.match(out, /Dana Reed/);
    assert.doesNotMatch(out, /\[Your Name\]/);
    assert.ok(meta.ruleFixes.includes('no_unfilled_placeholders'));
    assert.equal(meta.finalGatePass, true);
    assert.equal(meta.escalated, false);
    assert.equal(meta.refineCount, 0);
  });

  it('shadow mode never mutates the output and never escalates', async () => {
    const output =
      'Hi Acme Corporation, about your renewal. Let me know if we can chat. [Your Name]';
    const { output: out, meta } = await runQualityPipeline({
      output,
      taskType: 'email_draft',
      taskDescription: 'Email Acme Corporation about renewal',
      agentProfile: PROFILE,
      config: { mode: 'shadow' },
    });
    assert.equal(out, output); // unchanged
    assert.equal(meta.escalated, false);
    assert.deepEqual(meta.ruleFixes, []);
    assert.ok(meta.wouldRuleFix.includes('no_unfilled_placeholders'));
  });

  it('refines a mild relevance miss on lite and re-gates to a pass', async () => {
    const client = makeClient({
      critic: '{"relevant": false, "missing": ["mention Brightwave", "mention the Initiative"]}',
      refine:
        'Hello Acme Corporation and Brightwave team, about the Initiative renewal. Can we chat?',
    });
    const { output: out, meta } = await runQualityPipeline({
      output: 'Hello Acme, quick note. Can we chat?',
      taskType: 'email_draft',
      taskDescription: 'Email Acme Corporation Brightwave Initiative about renewal',
      agentProfile: PROFILE,
      client,
      model: 'aisha-task-lite',
      config: { mode: 'active', refineMaxAttempts: 1 },
    });
    assert.equal(meta.refineCount, 1);
    assert.equal(meta.finalGatePass, true);
    assert.equal(meta.escalated, false);
    assert.match(out, /Brightwave/);
    assert.match(out, /Initiative/);
  });

  it('escalates when refine fails to fix the defect within the cap', async () => {
    const client = makeClient({
      critic: '{"relevant": false, "missing": ["mention Brightwave"]}',
      refine: 'Hello Acme team, regarding matters. Can we chat now?', // still off-subject
    });
    const { meta } = await runQualityPipeline({
      output: 'Hello Acme, quick note. Can we chat?',
      taskType: 'email_draft',
      taskDescription: 'Email Acme Corporation Brightwave Initiative about renewal',
      agentProfile: PROFILE,
      client,
      model: 'aisha-task-lite',
      config: { mode: 'active', refineMaxAttempts: 1 },
    });
    assert.equal(meta.refineCount, 1);
    assert.equal(meta.finalGatePass, false);
    assert.equal(meta.escalated, true);
    assert.equal(meta.escalateReason, 'refine_cap_exhausted');
  });

  it('respects escalateEnabled=false (signals nothing to escalate)', async () => {
    const { meta } = await runQualityPipeline({
      output: 'The weather today is sunny.',
      taskType: 'generic_text',
      taskDescription: 'Email Acme Corporation about renewal',
      config: { mode: 'active', escalateEnabled: false },
    });
    assert.equal(meta.escalated, false);
  });
});
