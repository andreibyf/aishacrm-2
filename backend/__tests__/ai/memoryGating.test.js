/**
 * Memory Gating - Acceptance Tests
 * 
 * Tests for:
 * 1. shouldUseMemory() function - pattern matching for memory triggers
 * 2. shouldInjectConversationSummary() function - conditional summary injection
 * 3. getMemoryConfig() - verify reduced defaults
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  shouldUseMemory,
  shouldInjectConversationSummary,
  getMemoryConfig,
} from '../../lib/aiMemory/index.js';

describe('Memory Gating', () => {
  // Store original env values
  const originalEnv = {};
  
  beforeEach(() => {
    // Save and clear relevant env vars
    originalEnv.AI_MEMORY_ALWAYS_ON = process.env.AI_MEMORY_ALWAYS_ON;
    originalEnv.AI_MEMORY_ALWAYS_OFF = process.env.AI_MEMORY_ALWAYS_OFF;
    originalEnv.MEMORY_ENABLED = process.env.MEMORY_ENABLED;
    delete process.env.AI_MEMORY_ALWAYS_ON;
    delete process.env.AI_MEMORY_ALWAYS_OFF;
    // Enable memory for pattern matching tests
    process.env.MEMORY_ENABLED = 'true';
  });
  
  afterEach(() => {
    // Restore env vars
    if (originalEnv.AI_MEMORY_ALWAYS_ON !== undefined) {
      process.env.AI_MEMORY_ALWAYS_ON = originalEnv.AI_MEMORY_ALWAYS_ON;
    } else {
      delete process.env.AI_MEMORY_ALWAYS_ON;
    }
    if (originalEnv.AI_MEMORY_ALWAYS_OFF !== undefined) {
      process.env.AI_MEMORY_ALWAYS_OFF = originalEnv.AI_MEMORY_ALWAYS_OFF;
    } else {
      delete process.env.AI_MEMORY_ALWAYS_OFF;
    }
    if (originalEnv.MEMORY_ENABLED !== undefined) {
      process.env.MEMORY_ENABLED = originalEnv.MEMORY_ENABLED;
    } else {
      delete process.env.MEMORY_ENABLED;
    }
  });

  describe('shouldUseMemory', () => {
    describe('default behavior (OFF unless triggered)', () => {
      it('should return false for generic questions', () => {
        assert.strictEqual(shouldUseMemory('What is the weather?'), false);
        assert.strictEqual(shouldUseMemory('Create a new lead'), false);
        assert.strictEqual(shouldUseMemory('Show me my accounts'), false);
      });

      it('should return true for "last time" patterns', () => {
        assert.strictEqual(shouldUseMemory('What did we discuss last time?'), true);
        assert.strictEqual(shouldUseMemory('The last time we talked about leads'), true);
      });

      it('should return true for "previous" patterns', () => {
        assert.strictEqual(shouldUseMemory('What was our previous conversation about?'), true);
        assert.strictEqual(shouldUseMemory('In our previous discussion'), true);
      });

      it('should return true for "remind me" patterns', () => {
        assert.strictEqual(shouldUseMemory('Remind me what we talked about'), true);
        assert.strictEqual(shouldUseMemory('Can you remind me of the details?'), true);
      });

      it('should return true for "what did we" patterns', () => {
        assert.strictEqual(shouldUseMemory('What did we decide?'), true);
        assert.strictEqual(shouldUseMemory('What did we talk about?'), true);
      });

      it('should return true for "recap" patterns', () => {
        assert.strictEqual(shouldUseMemory('Give me a recap'), true);
        assert.strictEqual(shouldUseMemory('Can you recap our discussion?'), true);
      });

      it('should return true for "history" patterns', () => {
        assert.strictEqual(shouldUseMemory('Show me the history'), true);
        assert.strictEqual(shouldUseMemory('What is my history with this lead?'), true);
      });

      it('should return true for "follow up" patterns', () => {
        // Using "next steps" since the pattern is /\b(what\s+happened|follow\s*up|next\s+steps)\b/i
        assert.strictEqual(shouldUseMemory('What are the next steps?'), true);
        assert.strictEqual(shouldUseMemory('Any next steps pending?'), true);
      });

      it('should return true for "mentioned" patterns', () => {
        assert.strictEqual(shouldUseMemory('You mentioned something earlier'), true);
        assert.strictEqual(shouldUseMemory('As mentioned before'), true);
      });

      it('should return true for "earlier" patterns', () => {
        assert.strictEqual(shouldUseMemory('What did you say earlier?'), true);
        assert.strictEqual(shouldUseMemory('Earlier you told me...'), true);
      });

      it('should return true for "before" patterns', () => {
        assert.strictEqual(shouldUseMemory('What did we discuss before?'), true);
        assert.strictEqual(shouldUseMemory('As I said before'), true);
      });
    });

    describe('environment overrides', () => {
      it('should return true when AI_MEMORY_ALWAYS_ON=true (with MEMORY_ENABLED)', () => {
        // MEMORY_ENABLED is already set to true in beforeEach
        process.env.AI_MEMORY_ALWAYS_ON = 'true';
        assert.strictEqual(shouldUseMemory('Generic question'), true);
      });

      it('should return false when AI_MEMORY_ALWAYS_ON=true but MEMORY_ENABLED=false', () => {
        process.env.MEMORY_ENABLED = 'false';
        process.env.AI_MEMORY_ALWAYS_ON = 'true';
        // Master switch takes precedence over ALWAYS_ON
        assert.strictEqual(shouldUseMemory('Generic question'), false);
      });

      it('should return false when AI_MEMORY_ALWAYS_OFF=true', () => {
        process.env.AI_MEMORY_ALWAYS_OFF = 'true';
        // Even with trigger pattern, should be off
        assert.strictEqual(shouldUseMemory('What did we discuss last time?'), false);
      });

      it('should prioritize ALWAYS_OFF over everything', () => {
        process.env.AI_MEMORY_ALWAYS_ON = 'true';
        process.env.AI_MEMORY_ALWAYS_OFF = 'true';
        process.env.MEMORY_ENABLED = 'true';
        assert.strictEqual(shouldUseMemory('Any message'), false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        assert.strictEqual(shouldUseMemory(''), false);
      });

      it('should handle null/undefined', () => {
        assert.strictEqual(shouldUseMemory(null), false);
        assert.strictEqual(shouldUseMemory(undefined), false);
      });

      it('should be case-insensitive', () => {
        assert.strictEqual(shouldUseMemory('REMIND ME'), true);
        assert.strictEqual(shouldUseMemory('What Did We Discuss?'), true);
        assert.strictEqual(shouldUseMemory('LAST TIME'), true);
      });
    });
  });

  describe('shouldInjectConversationSummary', () => {
    it('should return false for short conversations', () => {
      assert.strictEqual(
        shouldInjectConversationSummary('Any message', 3),
        false
      );
    });

    it('should return true for long conversations with trigger', () => {
      // Needs both: long conversation AND trigger pattern
      assert.strictEqual(
        shouldInjectConversationSummary('What did we talk about earlier?', 10),
        true
      );
    });

    it('should respect custom minMessages threshold', () => {
      // With minMessages=5, 6 messages should qualify
      assert.strictEqual(
        shouldInjectConversationSummary('Remind me what we discussed', 6, 5),
        true
      );
      // But 4 messages should not
      assert.strictEqual(
        shouldInjectConversationSummary('Remind me what we discussed', 4, 5),
        false
      );
    });

    it('should return false without trigger even for long conversations', () => {
      // Long conversation but no trigger pattern
      assert.strictEqual(
        shouldInjectConversationSummary('Create a new lead', 20),
        false
      );
    });
  });

  describe('getMemoryConfig', () => {
    it('should return reduced defaults', () => {
      const config = getMemoryConfig();
      
      // Verify defaults match aiBudgetConfig.js DEFAULT_MEMORY
      assert.strictEqual(config.topK, 8);
      
      // Verify defaults match aiBudgetConfig.js DEFAULT_MEMORY
      assert.strictEqual(config.maxChunkChars, 3500);
    });

    it('should respect environment overrides', () => {
      const originalTopK = process.env.MEMORY_TOP_K;
      const originalMaxChunk = process.env.MEMORY_MAX_CHUNK_CHARS;
      
      process.env.MEMORY_TOP_K = '5';
      process.env.MEMORY_MAX_CHUNK_CHARS = '400';
      
      const config = getMemoryConfig();
      
      assert.strictEqual(config.topK, 5);
      assert.strictEqual(config.maxChunkChars, 400);
      
      // Restore
      if (originalTopK !== undefined) process.env.MEMORY_TOP_K = originalTopK;
      else delete process.env.MEMORY_TOP_K;
      if (originalMaxChunk !== undefined) process.env.MEMORY_MAX_CHUNK_CHARS = originalMaxChunk;
      else delete process.env.MEMORY_MAX_CHUNK_CHARS;
    });
  });
});
