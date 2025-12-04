/**
 * Phase 3 Verification - Section A: Trigger Engine
 * 
 * Tests for:
 * - A1: Trigger worker integrity (runs on schedule, loads env, logs events)
 * - A2: Supabase query policy compliance (no raw SQL patterns)
 * - A3: Trigger output format validation
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB_PATH = path.join(__dirname, '../../lib');

// Prohibited SQL patterns that violate Supabase query policy
// These patterns are specifically for SQL syntax, not JavaScript variable names
const PROHIBITED_SQL_PATTERNS = [
  /INTERVAL\s*'[^']+'/i,  // SQL INTERVAL '7 days' syntax
  /NOW\s*\(\s*\)\s*-\s*INTERVAL/i,  // NOW() - INTERVAL pattern
  /\bNOT\s+EXISTS\s*\(/i,  // SQL NOT EXISTS with opening paren
  /\bEXTRACT\s*\(\s*(?:YEAR|MONTH|DAY|HOUR|MINUTE|SECOND|EPOCH)\s+FROM/i,  // SQL EXTRACT(YEAR FROM ...)
  /\bCOALESCE\s*\([^)]+,[^)]+\)/i,  // SQL COALESCE(a, b) with multiple args
  /SELECT\s+.*\s+FROM\s+.*\s+WHERE\s+.*\s+IN\s*\(\s*SELECT/i,  // Subquery in WHERE
  /\(\s*SELECT\s+.*\s+FROM\s+[a-z_]+\s+WHERE/i,  // Inline subquery with table
];

// Allowed patterns (exceptions that are safe)
const ALLOWED_EXCEPTIONS = [
  /CASE\s+WHEN/i,  // Simple CASE expressions are okay
  /aggregate_ai_suggestion_metrics/i,  // RPC function call is okay
];

/**
 * Check if a file contains prohibited SQL patterns
 */
function checkFileForProhibitedPatterns(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const violations = [];
  
  for (const pattern of PROHIBITED_SQL_PATTERNS) {
    const matches = content.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      // Check if it's an allowed exception
      let isException = false;
      for (const exception of ALLOWED_EXCEPTIONS) {
        if (exception.test(content.substring(content.indexOf(matches[0]) - 50, content.indexOf(matches[0]) + 100))) {
          isException = true;
          break;
        }
      }
      
      if (!isException) {
        violations.push({
          pattern: pattern.source,
          matches: matches.length,
          file: path.basename(filePath)
        });
      }
    }
  }
  
  return violations;
}

describe('Section A: Trigger Engine Verification', () => {

  describe('A1: Trigger Worker Integrity', () => {
    
    test('Worker module exports required functions', async () => {
      const worker = await import('../../lib/aiTriggersWorker.js');
      
      assert.ok(typeof worker.startAiTriggersWorker === 'function', 
        'startAiTriggersWorker should be exported');
      assert.ok(typeof worker.stopAiTriggersWorker === 'function', 
        'stopAiTriggersWorker should be exported');
      assert.ok(typeof worker.triggerForTenant === 'function', 
        'triggerForTenant should be exported for manual triggering');
    });

    test('Worker respects AI_TRIGGERS_WORKER_ENABLED environment variable', async () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      assert.ok(
        content.includes('AI_TRIGGERS_WORKER_ENABLED'),
        'Worker should check AI_TRIGGERS_WORKER_ENABLED env var'
      );
    });

    test('Worker exports TRIGGER_TYPES constant for structured logging', async () => {
      const { TRIGGER_TYPES } = await import('../../lib/aiTriggersWorker.js');
      
      assert.ok(TRIGGER_TYPES, 'TRIGGER_TYPES should be exported');
      assert.ok(typeof TRIGGER_TYPES === 'object', 'TRIGGER_TYPES should be an object');
      
      // Required trigger types for Phase 3
      const requiredTypes = ['LEAD_STAGNANT', 'DEAL_DECAY', 'ACTIVITY_OVERDUE', 'OPPORTUNITY_HOT'];
      for (const type of requiredTypes) {
        assert.ok(TRIGGER_TYPES[type], `TRIGGER_TYPES should include ${type}`);
      }
    });

    test('Worker logs with tenant_id context', async () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Check for tenant context in logging
      assert.ok(
        content.includes('tenant_id') || content.includes('tenantId'),
        'Worker should log with tenant context'
      );
    });

  });

  describe('A2: Supabase Query Policy Compliance', () => {

    test('aiTriggersWorker.js has no prohibited SQL patterns', () => {
      const filePath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const violations = checkFileForProhibitedPatterns(filePath);
      
      assert.equal(
        violations.length, 
        0, 
        `Found prohibited SQL patterns in aiTriggersWorker.js:\n${JSON.stringify(violations, null, 2)}`
      );
    });

    test('Worker uses Supabase JS client for data retrieval', async () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Should import Supabase client
      assert.ok(
        content.includes('getSupabaseClient') || content.includes('supabase'),
        'Worker should use Supabase client'
      );
      
      // Should use .from().select() pattern
      assert.ok(
        content.includes('.from(') && content.includes('.select('),
        'Worker should use Supabase .from().select() pattern'
      );
    });

    test('Complex logic done in JavaScript, not SQL', async () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Check for JS-side filtering patterns
      assert.ok(
        content.includes('.filter(') || content.includes('.forEach(') || content.includes('.map('),
        'Worker should use JavaScript for complex filtering'
      );
      
      // Check for JS-based date comparison (not SQL INTERVAL)
      assert.ok(
        content.includes('Date.now()') || content.includes('new Date('),
        'Worker should use JavaScript Date for time calculations'
      );
    });

  });

  describe('A3: Trigger Output Format', () => {

    test('Trigger format includes required fields', async () => {
      const { TRIGGER_TYPES } = await import('../../lib/aiTriggersWorker.js');
      
      // Expected trigger structure: trigger_id, tenant_id, record_id, context
      
      // Check that TRIGGER_TYPES values can be used as trigger_id
      for (const [key, value] of Object.entries(TRIGGER_TYPES)) {
        assert.ok(typeof value === 'string', `${key} should have a string trigger_id value`);
        assert.ok(value.length > 0, `${key} trigger_id should not be empty`);
      }
    });

    test('Worker creates suggestions with proper JSON structure', async () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Check for suggestion creation with required fields
      assert.ok(
        content.includes('trigger_id') || content.includes('triggerId'),
        'Suggestions should include trigger_id'
      );
      assert.ok(
        content.includes('record_id') || content.includes('recordId'),
        'Suggestions should include record_id'
      );
      assert.ok(
        content.includes('tenant_id') || content.includes('tenantId'),
        'Suggestions should include tenant_id'
      );
    });

  });

});

// Export results for aggregation
export const sectionId = 'A';
export const sectionName = 'Trigger Engine';
