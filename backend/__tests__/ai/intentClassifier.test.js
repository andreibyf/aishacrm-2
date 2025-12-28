/**
 * Intent Classifier Tests
 * Comprehensive tests for intent pattern matching and classification
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIntent } from '../../lib/intentClassifier.js';

describe('Intent Classifier', () => {
  
  describe('AI_SUGGEST_NEXT_ACTIONS intent', () => {
    
    test('matches direct "what should I do next" queries', () => {
      const testCases = [
        'what should I do next',
        'what should we do next',
        'What should I do next with this lead?',
        'what should we do next here'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches "what do you recommend/suggest" queries', () => {
      const testCases = [
        'what do you recommend',
        'what do you suggest',
        'What do you recommend for this account?',
        'what do you suggest here'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches "how should I/we proceed" queries', () => {
      const testCases = [
        'how should I proceed',
        'how should we proceed',
        'How should I proceed with this deal?',
        'how should we proceed from here'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches "next step" queries', () => {
      const testCases = [
        "what's my next step",
        "what is my next step",
        "what are my next steps",
        "what's the next step",
        "what are our next steps"
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches "suggest/recommend action/step" queries', () => {
      const testCases = [
        'suggest next action',
        'recommend next step',
        'suggest next steps',
        'recommend action',
        'suggest actions'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches "what are my/our next steps" queries', () => {
      const testCases = [
        'what are my next steps',
        'what my next steps',
        'what are our next steps'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches specific "what do you think about" queries (with plan/strategy context)', () => {
      const testCases = [
        'what do you think about this situation',
        'what do you think about my approach',
        'what do you think of this plan',
        'what do you think of the strategy',
        'what do you think about my next step',
        'what do you think of the next steps'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches specific "what would you" queries (with entity/action context)', () => {
      const testCases = [
        'what would you suggest for this lead',
        'what would you recommend for the account',
        'what would you do with this contact',
        'what would you suggest about this opportunity',
        'what would you do with the deal',
        'what would you recommend for this pipeline',
        'what would you suggest for this situation',
        'what would you do next',
        'what would you suggest now'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches "any suggestions/recommendations" queries', () => {
      const testCases = [
        'any suggestions',
        'any suggestion',
        'any recommendations',
        'any recommendation',
        'give me suggestions',
        'give me recommendations'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches "how should/can/do I approach/handle" queries', () => {
      const testCases = [
        'how should I approach this',
        'how can we handle this',
        'how do I deal with this',
        'how should I approach the situation',
        'how can I handle this lead'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    test('matches "what is the/my best next move/action/step" queries', () => {
      const testCases = [
        'what is the best next move',
        'what is my best next action',
        'what is the best next step',
        'what is my best move',
        'what is the best action',
        'what is my best step'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `Expected AI_SUGGEST_NEXT_ACTIONS for: "${message}"`);
      }
    });

    describe('False positives prevention (negative test cases)', () => {
      
      test('does NOT match general "what do you think" without action context', () => {
        const testCases = [
          'what do you think about Tesla',
          'what do you think about this pricing',
          'what do you think of this company',
          'what do you think about the weather',
          'what do you think of pizza'
        ];
        
        for (const message of testCases) {
          const intent = classifyIntent(message);
          assert.notEqual(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
            `Should NOT match AI_SUGGEST_NEXT_ACTIONS for: "${message}" (got: ${intent})`);
        }
      });

      test('does NOT match general "what would you" without entity/action context', () => {
        const testCases = [
          'what would you do with a million dollars',
          'what would you suggest for lunch',
          'what would you recommend for dinner',
          'what would you do on vacation',
          'what would you suggest for a gift'
        ];
        
        for (const message of testCases) {
          const intent = classifyIntent(message);
          assert.notEqual(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
            `Should NOT match AI_SUGGEST_NEXT_ACTIONS for: "${message}" (got: ${intent})`);
        }
      });

      test('does NOT match informational queries about entities', () => {
        const testCases = [
          'show me the lead',
          'get account details',
          'what is this contact',
          'tell me about this opportunity'
        ];
        
        for (const message of testCases) {
          const intent = classifyIntent(message);
          assert.notEqual(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
            `Should NOT match AI_SUGGEST_NEXT_ACTIONS for: "${message}" (got: ${intent})`);
        }
      });
    });
  });

  describe('NOTE_LIST_FOR_RECORD intent', () => {
    
    test('matches "show/get/display/read notes" queries', () => {
      const testCases = [
        'show notes',
        'get notes',
        'display notes',
        'read notes',
        'show all notes',
        'get the notes',
        'display all the notes',
        'read the notes'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'NOTE_LIST_FOR_RECORD', 
          `Expected NOTE_LIST_FOR_RECORD for: "${message}"`);
      }
    });

    test('matches "show/get/display notes for/on/about" queries', () => {
      const testCases = [
        'show notes for this lead',
        'get notes on the account',
        'display notes about this contact',
        'show all notes for this opportunity',
        'get the notes on this deal',
        'display all the notes about this'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'NOTE_LIST_FOR_RECORD', 
          `Expected NOTE_LIST_FOR_RECORD for: "${message}"`);
      }
    });

    test('matches "what are the notes" queries', () => {
      const testCases = [
        'what are the notes',
        'notes for this lead',
        'notes on the account',
        'notes about this contact',
        'what are the notes for this opportunity',
        'notes on this deal'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'NOTE_LIST_FOR_RECORD', 
          `Expected NOTE_LIST_FOR_RECORD for: "${message}"`);
      }
    });

    test('matches "last/latest/most recent note" queries', () => {
      const testCases = [
        'last note',
        'latest note',
        'most recent note',
        'what is the last note created',
        'what is the last note added',
        'what is the last note written'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'NOTE_LIST_FOR_RECORD', 
          `Expected NOTE_LIST_FOR_RECORD for: "${message}"`);
      }
    });

    test('matches "are there any notes" queries', () => {
      const testCases = [
        'are there any notes',
        'are there notes',
        'are there any notes for this lead',
        'are there notes on this account'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'NOTE_LIST_FOR_RECORD', 
          `Expected NOTE_LIST_FOR_RECORD for: "${message}"`);
      }
    });

    test('matches "check/see/view notes" queries', () => {
      const testCases = [
        'check notes',
        'see notes',
        'view notes',
        'check the notes',
        'see the notes',
        'view the notes'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'NOTE_LIST_FOR_RECORD', 
          `Expected NOTE_LIST_FOR_RECORD for: "${message}"`);
      }
    });

    describe('Edge cases - pattern conflict prevention', () => {
      
      test('does NOT match NOTE_SEARCH patterns', () => {
        const testCases = [
          'find notes about pricing',
          'search notes for contact info',
          'look for notes containing budget'
        ];
        
        for (const message of testCases) {
          const intent = classifyIntent(message);
          assert.notEqual(intent, 'NOTE_LIST_FOR_RECORD', 
            `Should match NOTE_SEARCH, not NOTE_LIST_FOR_RECORD for: "${message}" (got: ${intent})`);
          assert.equal(intent, 'NOTE_SEARCH', 
            `Expected NOTE_SEARCH for: "${message}"`);
        }
      });

      test('does NOT match NOTE_CREATE patterns', () => {
        const testCases = [
          'create a note',
          'add a note',
          'write a note'
        ];
        
        for (const message of testCases) {
          const intent = classifyIntent(message);
          assert.notEqual(intent, 'NOTE_LIST_FOR_RECORD', 
            `Should match NOTE_CREATE, not NOTE_LIST_FOR_RECORD for: "${message}" (got: ${intent})`);
        }
      });
    });
  });

  describe('Edge cases and special scenarios', () => {
    
    test('handles null/undefined/empty input gracefully', () => {
      assert.equal(classifyIntent(null), null);
      assert.equal(classifyIntent(undefined), null);
      assert.equal(classifyIntent(''), null);
      assert.equal(classifyIntent('   '), null);
    });

    test('handles non-string input gracefully', () => {
      assert.equal(classifyIntent(123), null);
      assert.equal(classifyIntent({}), null);
      assert.equal(classifyIntent([]), null);
    });

    test('returns null for unmatched patterns', () => {
      const testCases = [
        'hello',
        'random text',
        'xyz123',
        'just chatting here'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, null, 
          `Expected null for unmatched message: "${message}"`);
      }
    });

    test('case insensitive matching', () => {
      const testCases = [
        'WHAT SHOULD I DO NEXT',
        'What Should I Do Next',
        'wHaT sHoUlD i Do NeXt',
        'SHOW NOTES',
        'Show Notes',
        'sHoW nOtEs'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.notEqual(intent, null, 
          `Should match an intent for case variation: "${message}"`);
      }
    });

    test('handles messages with extra whitespace', () => {
      const testCases = [
        '  what should I do next  ',
        'what   should   I   do   next',
        '\nshow notes\n',
        '\t\tget notes\t\t'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.notEqual(intent, null, 
          `Should match an intent despite whitespace: "${message}"`);
      }
    });
  });

  describe('Priority ordering', () => {
    
    test('AI_SUGGEST_NEXT_ACTIONS has highest priority', () => {
      // Messages that could match multiple intents should resolve to AI_SUGGEST_NEXT_ACTIONS
      const testCases = [
        'what should I do next with this lead',
        'what are my next steps for this account'
      ];
      
      for (const message of testCases) {
        const intent = classifyIntent(message);
        assert.equal(intent, 'AI_SUGGEST_NEXT_ACTIONS', 
          `AI_SUGGEST_NEXT_ACTIONS should have priority for: "${message}"`);
      }
    });
  });
});
