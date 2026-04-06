import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampInt,
  DEFAULT_BUDGET,
  DEFAULT_MEMORY,
  BOUNDS,
  DROP_ORDER,
  CORE_TOOLS,
  getAiBudgetConfig,
  getAiMemoryConfig,
} from '../../lib/aiBudgetConfig.js';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.AI_TOKEN_HARD_CEILING;
  delete process.env.AI_SYSTEM_PROMPT_CAP;
  delete process.env.AI_TOOL_SCHEMA_CAP;
  delete process.env.AI_MEMORY_CAP;
  delete process.env.AI_TOOL_RESULT_CAP;
  delete process.env.AI_OUTPUT_MAX_TOKENS;
  delete process.env.MEMORY_ENABLED;
  delete process.env.AI_MEMORY_ALWAYS_ON;
  delete process.env.AI_MEMORY_ALWAYS_OFF;
  delete process.env.MEMORY_TOP_K;
  delete process.env.MEMORY_MAX_CHUNK_CHARS;
  delete process.env.MEMORY_MIN_SIMILARITY;
  delete process.env.MEMORY_EMBEDDING_PROVIDER;
  delete process.env.MEMORY_EMBEDDING_MODEL;
}

describe('aiBudgetConfig', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    resetEnv();
  });

  it('clampInt uses fallback for invalid numbers and clamps to bounds', () => {
    assert.equal(clampInt('X', 'not-a-number', 1, 10, 7), 7);
    assert.equal(clampInt('X', '0', 1, 10, 7), 1);
    assert.equal(clampInt('X', '999', 1, 10, 7), 10);
    assert.equal(clampInt('X', '8', 1, 10, 7), 8);
  });

  it('returns default budget when no env overrides are set', () => {
    const cfg = getAiBudgetConfig();
    assert.equal(cfg.hardCeiling, DEFAULT_BUDGET.HARD_CEILING);
    assert.equal(cfg.systemPromptCap, DEFAULT_BUDGET.SYSTEM_PROMPT_CAP);
    assert.equal(cfg.toolSchemaCap, DEFAULT_BUDGET.TOOL_SCHEMA_CAP);
    assert.equal(cfg.memoryCap, DEFAULT_BUDGET.MEMORY_CAP);
    assert.equal(cfg.toolResultCap, DEFAULT_BUDGET.TOOL_RESULT_CAP);
    assert.equal(cfg.outputMaxTokens, DEFAULT_BUDGET.OUTPUT_MAX_TOKENS);
    assert.deepEqual(cfg.dropOrder, DROP_ORDER);
    assert.deepEqual(cfg.coreTools, CORE_TOOLS);
  });

  it('applies env overrides with bounds enforcement', () => {
    process.env.AI_TOKEN_HARD_CEILING = String(BOUNDS.HARD_CEILING.max + 5000);
    process.env.AI_SYSTEM_PROMPT_CAP = String(BOUNDS.SYSTEM_PROMPT_CAP.min - 10);
    process.env.AI_TOOL_SCHEMA_CAP = '1500';
    process.env.AI_MEMORY_CAP = '900';
    process.env.AI_TOOL_RESULT_CAP = '1300';
    process.env.AI_OUTPUT_MAX_TOKENS = '700';

    const cfg = getAiBudgetConfig();

    assert.equal(cfg.hardCeiling, BOUNDS.HARD_CEILING.max);
    assert.equal(cfg.systemPromptCap, BOUNDS.SYSTEM_PROMPT_CAP.min);
    assert.equal(cfg.toolSchemaCap, 1500);
    assert.equal(cfg.memoryCap, 900);
    assert.equal(cfg.toolResultCap, 1300);
    assert.equal(cfg.outputMaxTokens, 700);

    assert.equal(cfg.caps.HARD_CEILING, BOUNDS.HARD_CEILING.max);
    assert.equal(cfg.caps.SYSTEM_PROMPT, BOUNDS.SYSTEM_PROMPT_CAP.min);
  });

  it('returns default memory config and honors memory env overrides', () => {
    let memory = getAiMemoryConfig();
    assert.equal(memory.enabled, false);
    assert.equal(memory.alwaysOn, false);
    assert.equal(memory.alwaysOff, false);
    assert.equal(memory.topK, DEFAULT_MEMORY.TOP_K);
    assert.equal(memory.maxChunkChars, DEFAULT_MEMORY.MAX_CHUNK_CHARS);
    assert.equal(memory.minSimilarity, DEFAULT_MEMORY.MIN_SIMILARITY);

    process.env.MEMORY_ENABLED = 'true';
    process.env.AI_MEMORY_ALWAYS_ON = 'true';
    process.env.AI_MEMORY_ALWAYS_OFF = 'false';
    process.env.MEMORY_TOP_K = '12';
    process.env.MEMORY_MAX_CHUNK_CHARS = '1200';
    process.env.MEMORY_MIN_SIMILARITY = '0.82';
    process.env.MEMORY_EMBEDDING_PROVIDER = 'custom-provider';
    process.env.MEMORY_EMBEDDING_MODEL = 'custom-model';

    memory = getAiMemoryConfig();
    assert.equal(memory.enabled, true);
    assert.equal(memory.alwaysOn, true);
    assert.equal(memory.alwaysOff, false);
    assert.equal(memory.topK, 12);
    assert.equal(memory.maxChunkChars, 1200);
    assert.equal(memory.minSimilarity, 0.82);
    assert.equal(memory.embeddingProvider, 'custom-provider');
    assert.equal(memory.embeddingModel, 'custom-model');
  });
});
