/**
 * Tests for the lite-tier relevance critic.
 * [2026-06-12 Claude] Phase 2 of the lite-tier quality pipeline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assessRelevance } from '../../../lib/quality/relevanceCritic.js';

function makeClient(reply) {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: reply } }] }),
      },
    },
  };
}

describe('assessRelevance', () => {
  it('returns relevant=true with no missing when the model says so', async () => {
    const client = makeClient('{"relevant": true, "missing": []}');
    const r = await assessRelevance({
      client,
      model: 'aisha-task-lite',
      output: 'Hello Acme, about your renewal.',
      taskDescription: 'Email Acme about the renewal',
    });
    assert.equal(r.relevant, true);
    assert.deepEqual(r.missing, []);
    assert.equal(r.assessed, true);
  });

  it('surfaces missing elements when not relevant', async () => {
    const client = makeClient(
      '{"relevant": false, "missing": ["mention the renewal", "name Acme"]}',
    );
    const r = await assessRelevance({
      client,
      model: 'aisha-task-lite',
      output: 'The weather is nice.',
      taskDescription: 'Email Acme about the renewal',
    });
    assert.equal(r.relevant, false);
    assert.deepEqual(r.missing, ['mention the renewal', 'name Acme']);
  });

  it('parses JSON embedded in prose (small-model wrapping)', async () => {
    const client = makeClient('Here is my review: {"relevant": false, "missing": ["x"]} thanks');
    const r = await assessRelevance({
      client,
      model: 'm',
      output: 'something',
      taskDescription: 'ask',
    });
    assert.equal(r.relevant, false);
    assert.deepEqual(r.missing, ['x']);
  });

  it('abstains (relevant=true, assessed=false) on unparseable output', async () => {
    const client = makeClient('I think it is probably fine, hard to say.');
    const r = await assessRelevance({ client, model: 'm', output: 'x', taskDescription: 'y' });
    assert.equal(r.relevant, true);
    assert.equal(r.assessed, false);
  });

  it('abstains when the client throws', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => {
            throw new Error('boom');
          },
        },
      },
    };
    const r = await assessRelevance({ client, model: 'm', output: 'x', taskDescription: 'y' });
    assert.equal(r.relevant, true);
    assert.equal(r.assessed, false);
  });

  it('abstains with no client or empty output (no call made)', async () => {
    const a = await assessRelevance({ client: null, output: 'x', taskDescription: 'y' });
    assert.deepEqual(a, { relevant: true, missing: [], assessed: false });
    const b = await assessRelevance({
      client: makeClient('{}'),
      output: '   ',
      taskDescription: 'y',
    });
    assert.equal(b.assessed, false);
  });
});
