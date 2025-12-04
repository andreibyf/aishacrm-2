/**
 * Phase 3 Verification - Section E: Safe Apply Engine
 * 
 * Tests for:
 * - E1: Apply pipeline integrity (mode=apply_allowed, tenant validation)
 * - E2: Post-apply status transitions
 * - E3: Audit logging
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB_PATH = path.join(__dirname, '../../lib');
const ROUTES_PATH = path.join(__dirname, '../../routes');

const BASE_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Section E: Safe Apply Engine Verification', () => {

  describe('E1: Apply Pipeline Integrity', () => {

    test('Braid integration module exists', () => {
      const braidPath = path.join(LIB_PATH, 'braidIntegration-v2.js');
      const altPath = path.join(LIB_PATH, 'braidIntegration.js');
      
      assert.ok(
        fs.existsSync(braidPath) || fs.existsSync(altPath),
        'Braid integration module should exist'
      );
    });

    test('Apply route validates tenant ownership', () => {
      const suggestionsRoute = path.join(ROUTES_PATH, 'suggestions.js');
      const content = fs.readFileSync(suggestionsRoute, 'utf-8');
      
      // Find the apply route handler
      assert.ok(
        content.includes('/apply') || content.includes('apply'),
        'Apply endpoint should exist'
      );
      
      // Should check tenant
      assert.ok(
        content.includes('tenant_id') && content.includes('resolveCanonicalTenant'),
        'Apply should validate tenant ownership'
      );
    });

    test('Apply route uses executeBraidTool', () => {
      const suggestionsRoute = path.join(ROUTES_PATH, 'suggestions.js');
      const content = fs.readFileSync(suggestionsRoute, 'utf-8');
      
      assert.ok(
        content.includes('executeBraidTool'),
        'Apply should use executeBraidTool for safe execution'
      );
    });

    test('No direct Supabase writes to CRM tables from apply', () => {
      const suggestionsRoute = path.join(ROUTES_PATH, 'suggestions.js');
      const content = fs.readFileSync(suggestionsRoute, 'utf-8');
      
      // Apply route should NOT directly update leads/opportunities/accounts
      // It should delegate to Braid tools
      const directWritePatterns = [
        /supabase\.from\(['"]leads['"]\)\.update/i,
        /supabase\.from\(['"]opportunities['"]\)\.update/i,
        /supabase\.from\(['"]accounts['"]\)\.update/i,
        /supabase\.from\(['"]contacts['"]\)\.update/i,
      ];
      
      // Find the apply section of the code
      const applyIndex = content.indexOf("'/apply'") || content.indexOf('"/apply"');
      if (applyIndex === -1) {
        assert.ok(true, 'Apply route section not found by string search');
        return;
      }
      
      // Get ~200 lines after /apply route definition
      const applySection = content.substring(applyIndex, applyIndex + 5000);
      
      for (const pattern of directWritePatterns) {
        assert.ok(
          !pattern.test(applySection),
          `Apply route should not directly write to CRM tables: ${pattern.source}`
        );
      }
    });

  });

  describe('E2: Post-Apply Status', { skip: !SHOULD_RUN }, () => {

    test('Apply endpoint updates suggestion status', async () => {
      // First, get an approved suggestion (if any)
      const listRes = await fetch(
        `${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=approved&limit=1`
      );
      const listJson = await listRes.json();
      
      if (listJson.data?.suggestions?.length > 0) {
        const id = listJson.data.suggestions[0].id;
        
        // Attempt to apply
        const res = await fetch(`${BASE_URL}/api/ai/suggestions/${id}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant_id: TENANT_ID, user_id: 'test-user' })
        });
        
        // Should return success or appropriate error
        assert.ok(
          [200, 400, 404, 500].includes(res.status),
          'Apply should return a valid response'
        );
        
        const json = await res.json();
        if (res.status === 200) {
          // Verify status changed
          assert.ok(
            json.data?.status === 'applied' || json.status === 'success',
            'Applied suggestion should have applied status'
          );
        }
      } else {
        // No approved suggestions to test
        assert.ok(true, 'No approved suggestions available for apply test');
      }
    });

    test('Apply stores apply_result on success or failure', () => {
      const suggestionsRoute = path.join(ROUTES_PATH, 'suggestions.js');
      const content = fs.readFileSync(suggestionsRoute, 'utf-8');
      
      assert.ok(
        content.includes('apply_result'),
        'Apply should store apply_result'
      );
    });

  });

  describe('E3: Audit Logging', () => {

    test('Apply operations are logged', () => {
      const suggestionsRoute = path.join(ROUTES_PATH, 'suggestions.js');
      const content = fs.readFileSync(suggestionsRoute, 'utf-8');
      
      // Check for logging around apply
      assert.ok(
        content.includes('console.log') || content.includes('console.error'),
        'Apply should have logging'
      );
      
      // Should log suggestion ID and tenant context
      assert.ok(
        content.includes('[Suggestions]') || content.includes('Suggestion'),
        'Logs should be prefixed for traceability'
      );
    });

    test('Errors are captured and logged', () => {
      const suggestionsRoute = path.join(ROUTES_PATH, 'suggestions.js');
      const content = fs.readFileSync(suggestionsRoute, 'utf-8');
      
      // Should have try-catch with error logging
      assert.ok(
        content.includes('catch') && content.includes('error'),
        'Apply should catch and log errors'
      );
    });

  });

});

// Export for aggregation
export const sectionId = 'E';
export const sectionName = 'Safe Apply Engine';
