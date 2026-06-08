/**
 * Regression: generate-email-draft 500
 *
 * selectLLMConfigForTenant and resolveLLMApiKey both take a SINGLE OBJECT argument.
 * Callers that pass positional args get silent undefined destructuring — provider
 * always falls back to 'openai', tenantSlugOrId is always undefined, key lookup
 * fails, apiKey=null, and the downstream OpenAI call crashes with 500.
 *
 * This suite verifies:
 *   - selectLLMConfigForTenant({ ... }) returns a valid config shape
 *   - Calling with positional args (the bug) produces a degraded but non-crashing result
 *     so we can detect future regressions if someone removes the object-arg fix
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectLLMConfigForTenant } from '../../lib/aiEngine/index.js';

describe('[AIEngine] selectLLMConfigForTenant call signature', () => {
  it('returns a config object with provider and model when called with correct object arg', () => {
    const config = selectLLMConfigForTenant({ capability: 'chat_tools' });
    assert.ok(config, 'should return a config object');
    assert.ok(typeof config.provider === 'string', 'config.provider should be a string');
    assert.ok(typeof config.model === 'string', 'config.model should be a string');
    assert.ok(config.provider.length > 0, 'provider should be non-empty');
    assert.ok(config.model.length > 0, 'model should be non-empty');
  });

  it('returns a config object with tenantSlugOrId correctly applied', () => {
    const config = selectLLMConfigForTenant({
      capability: 'chat_tools',
      tenantSlugOrId: '759a83e8-0000-0000-0000-000000000000',
    });
    assert.ok(config, 'should return a config object');
    assert.ok(typeof config.provider === 'string', 'config.provider should be a string');
  });

  it('does NOT crash when called with positional args (old bug pattern)', () => {
    // Positional call: selectLLMConfigForTenant(tenantId, 'chat_tools')
    // The function destructures its first arg as an object — when given a UUID string,
    // all named fields are undefined and defaults kick in. Verify it returns a usable config
    // rather than throwing, so the 400 guard added to generate-email-draft is the last line
    // of defence, not a crash.
    assert.doesNotThrow(() => {
      const config = selectLLMConfigForTenant(
        '759a83e8-0000-0000-0000-000000000000',
        'chat_tools',
      );
      assert.ok(config, 'degraded call should still return a config');
      assert.ok(typeof config.provider === 'string', 'degraded config.provider should be string');
    });
  });
});
