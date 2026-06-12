/**
 * Tests for the lite-tier surgical refiner.
 * [2026-06-12 Claude] Phase 2 of the lite-tier quality pipeline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { refineOnLite } from '../../../lib/quality/refiner.js';

function makeClient(reply, capture) {
  return {
    chat: {
      completions: {
        create: async (args) => {
          if (capture) capture(args);
          return { choices: [{ message: { content: reply } }] };
        },
      },
    },
  };
}

describe('refineOnLite', () => {
  it('returns the refined text on success', async () => {
    const client = makeClient('Dear Acme, about your Q3 renewal. Shall we chat?');
    const out = await refineOnLite({
      client,
      model: 'aisha-task-lite',
      draft: 'Dear [Company], about your renewal.',
      critiques: ['name the company', 'mention Q3'],
    });
    assert.match(out, /Acme/);
    assert.match(out, /Q3/);
  });

  it('passes the critiques and a low temperature to the model', async () => {
    let seen;
    const client = makeClient('revised', (args) => (seen = args));
    await refineOnLite({
      client,
      model: 'm',
      draft: 'draft text',
      critiques: ['fix A', 'fix B'],
      temperature: 0.15,
    });
    assert.equal(seen.temperature, 0.15);
    assert.match(seen.messages[1].content, /fix A/);
    assert.match(seen.messages[1].content, /fix B/);
  });

  it('returns the original draft when there are no critiques (no call)', async () => {
    let called = false;
    const client = makeClient('should not be used', () => (called = true));
    const out = await refineOnLite({ client, model: 'm', draft: 'original', critiques: [] });
    assert.equal(out, 'original');
    assert.equal(called, false);
  });

  it('strips stray """ fences the model may echo', async () => {
    const client = makeClient('"""Clean revised text."""');
    const out = await refineOnLite({ client, model: 'm', draft: 'd', critiques: ['x'] });
    assert.equal(out, 'Clean revised text.');
  });

  it('falls back to the original draft on an empty completion', async () => {
    const client = makeClient('   ');
    const out = await refineOnLite({ client, model: 'm', draft: 'keep me', critiques: ['x'] });
    assert.equal(out, 'keep me');
  });

  it('falls back to the original draft when the client throws', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => {
            throw new Error('down');
          },
        },
      },
    };
    const out = await refineOnLite({ client, model: 'm', draft: 'keep me', critiques: ['x'] });
    assert.equal(out, 'keep me');
  });
});
