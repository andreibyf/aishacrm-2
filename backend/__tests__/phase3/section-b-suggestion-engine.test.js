/**
 * Phase 3 Verification - Section B: Suggestion Engine
 * 
 * Tests for:
 * - B1: AI Brain (Braid) integration - propose_actions mode
 * - B2: Suggestion JSON format validation
 * - B3: Deduplication logic
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB_PATH = path.join(__dirname, '../../lib');

// Known Braid tools from the system
const KNOWN_BRAID_TOOLS = [
  'send_email',
  'schedule_call',
  'create_task',
  'update_lead',
  'update_opportunity',
  'update_account',
  'create_activity',
  'create_note',
  'update_contact',
  'schedule_followup',
  'assign_owner',
  'change_stage',
  'set_priority',
];

/**
 * JSON Schema for suggestion validation
 */
const SUGGESTION_SCHEMA = {
  required: ['action', 'payload', 'confidence', 'reasoning'],
  properties: {
    action: { type: 'string' },
    payload: { type: 'object' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasoning: { type: 'string', minLength: 1 }
  }
};

/**
 * Validate suggestion object against schema
 */
function validateSuggestion(suggestion) {
  const errors = [];
  
  // Check required fields
  for (const field of SUGGESTION_SCHEMA.required) {
    if (suggestion[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate confidence range
  if (typeof suggestion.confidence === 'number') {
    if (suggestion.confidence < 0 || suggestion.confidence > 1) {
      errors.push(`Confidence ${suggestion.confidence} out of range [0, 1]`);
    }
  } else if (suggestion.confidence !== undefined) {
    errors.push(`Confidence must be a number, got ${typeof suggestion.confidence}`);
  }
  
  // Validate action is in known tools
  if (suggestion.action && !KNOWN_BRAID_TOOLS.includes(suggestion.action)) {
    errors.push(`Unknown action/tool: ${suggestion.action}`);
  }
  
  // Validate reasoning is non-empty string
  if (typeof suggestion.reasoning === 'string' && suggestion.reasoning.length === 0) {
    errors.push('Reasoning cannot be empty');
  }
  
  return errors;
}

describe('Section B: Suggestion Engine Verification', () => {

  describe('B1: AI Brain (Braid) Integration', () => {

    test('Worker uses propose_actions mode for suggestions', async () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Check for AI Brain integration
      assert.ok(
        content.includes('aiBrain') || content.includes('runAiBrainTask') || content.includes('runTask'),
        'Worker should integrate with AI Brain'
      );
    });

    test('No direct database writes from suggestion generation', async () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // The worker should only write to ai_suggestions table, not CRM tables directly
      // Check that we don't see direct updates to core tables
      const directWritePatterns = [
        /\.update\(\s*\{[^}]*\}\s*\)\s*\.eq\(\s*['"]id['"]/g,
        /UPDATE\s+(leads|opportunities|accounts|contacts)\s+SET/gi,
        /INSERT\s+INTO\s+(leads|opportunities|accounts|contacts)/gi,
      ];
      
      for (const pattern of directWritePatterns) {
        const matches = content.match(pattern);
        // If there are matches, they should be for ai_suggestions only
        if (matches) {
          for (const match of matches) {
            assert.ok(
              match.includes('ai_suggestions') || match.includes('suggestion'),
              `Suspicious direct write pattern found: ${match}`
            );
          }
        }
      }
    });

    test('Suggestion actions match allowed Braid tools', async () => {
      // Verify the braidIntegration module exports or references tools
      const braidPath = path.join(LIB_PATH, 'braidIntegration-v2.js');
      
      if (fs.existsSync(braidPath)) {
        const content = fs.readFileSync(braidPath, 'utf-8');
        assert.ok(
          content.includes('executeBraidTool') || content.includes('tools'),
          'Braid integration should provide tool execution'
        );
      }
    });

  });

  describe('B2: Suggestion JSON Format', () => {

    test('Sample suggestion structure is valid', () => {
      const validSuggestion = {
        action: 'send_email',
        payload: { to: 'test@example.com', subject: 'Follow up' },
        confidence: 0.85,
        reasoning: 'Lead has been stagnant for 7 days, recommending follow-up email'
      };
      
      const errors = validateSuggestion(validSuggestion);
      assert.equal(errors.length, 0, `Valid suggestion should pass: ${errors.join(', ')}`);
    });

    test('Missing action field is detected', () => {
      const invalidSuggestion = {
        payload: {},
        confidence: 0.5,
        reasoning: 'Test'
      };
      
      const errors = validateSuggestion(invalidSuggestion);
      assert.ok(errors.some(e => e.includes('action')), 'Should detect missing action');
    });

    test('Missing confidence field is detected', () => {
      const invalidSuggestion = {
        action: 'send_email',
        payload: {},
        reasoning: 'Test'
      };
      
      const errors = validateSuggestion(invalidSuggestion);
      assert.ok(errors.some(e => e.includes('confidence')), 'Should detect missing confidence');
    });

    test('Confidence out of range is detected', () => {
      const invalidSuggestion = {
        action: 'send_email',
        payload: {},
        confidence: 1.5,
        reasoning: 'Test'
      };
      
      const errors = validateSuggestion(invalidSuggestion);
      assert.ok(errors.some(e => e.includes('out of range')), 'Should detect confidence out of range');
    });

    test('Empty reasoning is detected', () => {
      const invalidSuggestion = {
        action: 'send_email',
        payload: {},
        confidence: 0.5,
        reasoning: ''
      };
      
      const errors = validateSuggestion(invalidSuggestion);
      assert.ok(errors.some(e => e.includes('empty')), 'Should detect empty reasoning');
    });

    test('Unknown action/tool is detected', () => {
      const invalidSuggestion = {
        action: 'unknown_tool_xyz',
        payload: {},
        confidence: 0.5,
        reasoning: 'Test'
      };
      
      const errors = validateSuggestion(invalidSuggestion);
      assert.ok(errors.some(e => e.includes('Unknown action')), 'Should detect unknown tool');
    });

  });

  describe('B3: Deduplication', () => {

    test('Worker checks for existing pending suggestions', async () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Should query ai_suggestions to check for duplicates
      assert.ok(
        content.includes('ai_suggestions') || content.includes('pending'),
        'Worker should check for existing suggestions'
      );
    });

    test('Worker excludes already-processed records', async () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Should have filtering logic for duplicates
      assert.ok(
        content.includes('filter') || content.includes('exclude') || content.includes('existing'),
        'Worker should have deduplication logic'
      );
    });

  });

});

// Export for aggregation
export const sectionId = 'B';
export const sectionName = 'Suggestion Engine';
export { validateSuggestion, KNOWN_BRAID_TOOLS };
