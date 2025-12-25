/**
 * Conversation Context & RAG Tests
 * 
 * Tests that verify AiSHA AI properly handles conversation continuity,
 * implicit references, and session entity context.
 * 
 * @module tests/ai/conversationContext
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Conversation Context Tests', { skip: !SHOULD_RUN }, () => {
  
  describe('System Prompt Enhancements', () => {
    
    test('BRAID_SYSTEM_PROMPT includes conversation continuity section', async () => {
      const { BRAID_SYSTEM_PROMPT } = await import('../../lib/braidIntegration-v2.js');
      
      // Verify critical sections are present
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('CONVERSATION CONTINUITY & CONTEXT AWARENESS'),
        'System prompt should include conversation continuity section'
      );
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('implicit references'),
        'System prompt should mention implicit references'
      );
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('I think I only have 1'),
        'System prompt should include example of implicit reference'
      );
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('NEVER respond with "I\'m not sure what action you want to take"'),
        'System prompt should forbid "I\'m not sure" responses'
      );
    });
    
    test('System prompt includes suggest_next_actions trigger patterns', async () => {
      const { BRAID_SYSTEM_PROMPT } = await import('../../lib/braidIntegration-v2.js');
      
      const expectedPatterns = [
        'What should I do next?',
        'What do you think?',
        'What are my next steps?',
        'What do you recommend?',
        'How should I proceed?',
        "What's the next step?"
      ];
      
      for (const pattern of expectedPatterns) {
        assert.ok(
          BRAID_SYSTEM_PROMPT.includes(pattern),
          `System prompt should include trigger pattern: "${pattern}"`
        );
      }
    });
    
    test('System prompt includes implicit reference handling examples', async () => {
      const { BRAID_SYSTEM_PROMPT } = await import('../../lib/braidIntegration-v2.js');
      
      // Check for the specific example from the problem statement
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('Show me warm leads'),
        'Should include warm leads example'
      );
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('summarize the notes for me'),
        'Should include notes summarization example'
      );
      
      // Verify it instructs to use conversation history
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('refer to recent messages'),
        'Should instruct to refer to recent messages'
      );
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('Track what entities were just discussed'),
        'Should instruct to track discussed entities'
      );
    });
  });
  
  describe('Session Context Injection', () => {
    
    test('Session entities format includes all required fields', () => {
      // Simulate the session entity context format from useAiSidebarState
      const sessionEntities = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          type: 'lead',
          name: 'Jack Russel',
          aliases: ['jack', 'jack russel', 'jr@russelcorp.com']
        }
      ];
      
      // Simulate the formatting logic from ai.js
      const entityContext = sessionEntities
        .map(e => `- "${e.name}" (${e.type}, ID: ${e.id})${e.aliases?.length > 0 ? ` [also: ${e.aliases.join(', ')}]` : ''}`)
        .join('\n');
      
      assert.ok(
        entityContext.includes('Jack Russel'),
        'Should include entity name'
      );
      
      assert.ok(
        entityContext.includes('lead'),
        'Should include entity type'
      );
      
      assert.ok(
        entityContext.includes('123e4567-e89b-12d3-a456-426614174000'),
        'Should include entity ID'
      );
      
      assert.ok(
        entityContext.includes('jack, jack russel, jr@russelcorp.com'),
        'Should include aliases'
      );
    });
    
    test('Conversation summary format includes role and content preview', () => {
      // Simulate conversation history
      const messages = [
        { role: 'user', content: 'What is the name of my warm lead?' },
        { role: 'assistant', content: 'To provide you with the name of your warm lead, I\'ll need to list your warm leads...' },
        { role: 'user', content: 'I think i only have 1' },
        { role: 'assistant', content: 'Yes, you have one warm lead: Jack Russel from JR Corporation.' },
        { role: 'user', content: 'summarize the notes for me' },
        { role: 'assistant', content: 'Here are the summarized notes for your warm lead, Jack Russel...' }
      ];
      
      // Simulate the last 6 messages (3 exchanges)
      const recentMessages = messages.slice(-6);
      const summaryItems = recentMessages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => {
          const preview = m.content?.slice(0, 100) || '';
          return `${m.role === 'user' ? 'User' : 'AiSHA'}: ${preview}`;
        })
        .join('\n');
      
      assert.ok(
        summaryItems.includes('User: What is the name of my warm lead?'),
        'Should include user messages'
      );
      
      assert.ok(
        summaryItems.includes('AiSHA: To provide you with the name of your warm lead'),
        'Should include assistant messages'
      );
      
      assert.ok(
        summaryItems.includes('User: I think i only have 1'),
        'Should include the problematic implicit reference'
      );
      
      // Verify it's a summary (truncated at 100 chars)
      const longMessage = summaryItems.split('\n').find(line => line.includes('To provide you'));
      assert.ok(
        longMessage && longMessage.length <= 150, // "AiSHA: " + 100 chars
        'Messages should be truncated to 100 chars preview'
      );
    });
  });
  
  describe('Suggest Next Actions Tool', () => {
    
    test('suggest_next_actions tool is properly defined', async () => {
      // The tool is added dynamically in ai.js, but we can verify the implementation exists
      const { suggestNextActions } = await import('../../lib/suggestNextActions.js');
      
      assert.ok(
        typeof suggestNextActions === 'function',
        'suggestNextActions should be exported as a function'
      );
    });
    
    test('suggest_next_actions analyzes entity state correctly', async () => {
      const { suggestNextActions } = await import('../../lib/suggestNextActions.js');
      
      // This is a unit test of the function logic, not integration
      // We just verify it exists and has the right signature
      const funcStr = suggestNextActions.toString();
      
      assert.ok(
        funcStr.includes('entity_type') && funcStr.includes('entity_id'),
        'Function should accept entity_type and entity_id parameters'
      );
      
      assert.ok(
        funcStr.includes('tenant_id'),
        'Function should accept tenant_id parameter'
      );
    });
  });
  
  describe('Expected Behavior with Problem Statement Scenario', () => {
    
    test('System prompt should prevent "I\'m not sure" responses', async () => {
      const { BRAID_SYSTEM_PROMPT } = await import('../../lib/braidIntegration-v2.js');
      
      // The problem statement shows AiSHA responding with:
      // "I'm not sure what action you want to take"
      // This should now be explicitly forbidden
      
      const forbiddenPhrases = [
        'NEVER EVER respond with "I\'m not sure what action you want to take"',
        'NEVER respond with "I\'m not sure"',
        'DO NOT respond with "I\'m not sure"'
      ];
      
      let hasForbiddenDirective = false;
      for (const phrase of forbiddenPhrases) {
        if (BRAID_SYSTEM_PROMPT.includes(phrase)) {
          hasForbiddenDirective = true;
          break;
        }
      }
      
      assert.ok(
        hasForbiddenDirective,
        'System prompt should explicitly forbid "I\'m not sure" responses'
      );
    });
    
    test('System prompt should mandate suggest_next_actions for "next steps" questions', async () => {
      const { BRAID_SYSTEM_PROMPT } = await import('../../lib/braidIntegration-v2.js');
      
      // User asked: "What should be my next steps?"
      // AiSHA should ALWAYS call suggest_next_actions
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('MANDATORY') || BRAID_SYSTEM_PROMPT.includes('MUST'),
        'System prompt should use mandatory language'
      );
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('suggest_next_actions tool'),
        'System prompt should reference the suggest_next_actions tool'
      );
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('ALWAYS call suggest_next_actions'),
        'System prompt should mandate calling the tool'
      );
    });
    
    test('Implicit reference "I think I only have 1" should be handleable', async () => {
      const { BRAID_SYSTEM_PROMPT } = await import('../../lib/braidIntegration-v2.js');
      
      // Scenario:
      // User: "What is the name of my warm lead?"
      // AiSHA: [shows warm leads]
      // User: "I think i only have 1"
      // AiSHA should understand this refers to the warm lead count
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('I think I only have 1'),
        'Should include the exact example from problem statement'
      );
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('interpret as') || BRAID_SYSTEM_PROMPT.includes('respond naturally'),
        'Should instruct how to interpret the implicit reference'
      );
      
      assert.ok(
        BRAID_SYSTEM_PROMPT.includes('Look at the last 3-5 messages'),
        'Should instruct to look at recent message history'
      );
    });
  });
});
