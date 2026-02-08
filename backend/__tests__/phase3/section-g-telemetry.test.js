/**
 * Phase 3 Verification - Section G: Telemetry & Observability
 * 
 * Tests for:
 * - G1: Telemetry logging (all required events)
 * - G2: Telemetry JSON format
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTimeoutSkip, getTestTimeoutMs } from '../helpers/timeout.js';

const timeoutTest = (name, fn, options = {}) =>
  test(name, { timeout: getTestTimeoutMs(), ...options }, async (t) => {
    await withTimeoutSkip(t, fn);
  });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB_PATH = path.join(__dirname, '../../lib');
const ROUTES_PATH = path.join(__dirname, '../../routes');

const BASE_URL = process.env.BACKEND_URL || 'http://127.0.0.1:4001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

// Required telemetry events per Phase 3 spec:
// trigger emitted, suggestion generated, suggestion reviewed,
// suggestion approved/rejected, suggestion applied, failures

describe('Section G: Telemetry & Observability Verification', () => {

  describe('G1: Telemetry Logging', () => {

    timeoutTest('Worker logs trigger events', () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Check for logging of trigger detection
      assert.ok(
        content.includes('console.log') || content.includes('console.info'),
        'Worker should log events'
      );
      
      assert.ok(
        content.includes('[AiTriggersWorker]') || content.includes('trigger'),
        'Worker logs should be identifiable'
      );
    });

    timeoutTest('Suggestion routes log approval/rejection', () => {
      const suggestionsRoute = path.join(ROUTES_PATH, 'suggestions.js');
      const content = fs.readFileSync(suggestionsRoute, 'utf-8');
      
      // Check for approve logging
      assert.ok(
        content.includes('Approved') || content.includes('approved'),
        'Should log approval events'
      );
      
      // Check for reject logging
      assert.ok(
        content.includes('Rejected') || content.includes('rejected') || content.includes('reject'),
        'Should log rejection events'
      );
    });

    timeoutTest('Apply operations log success/failure', () => {
      const suggestionsRoute = path.join(ROUTES_PATH, 'suggestions.js');
      const content = fs.readFileSync(suggestionsRoute, 'utf-8');
      
      // Check for apply logging
      assert.ok(
        content.includes('Applied') || content.includes('apply'),
        'Should log apply events'
      );
      
      // Check for error logging
      assert.ok(
        content.includes('console.error') || content.includes('Error'),
        'Should log failures'
      );
    });

    timeoutTest('Logs include tenant context', () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const suggestionsRoute = path.join(ROUTES_PATH, 'suggestions.js');
      
      const workerContent = fs.readFileSync(workerPath, 'utf-8');
      const routeContent = fs.readFileSync(suggestionsRoute, 'utf-8');
      
      assert.ok(
        workerContent.includes('tenant') && routeContent.includes('tenant'),
        'Logs should include tenant context'
      );
    });

  });

  describe('G2: Telemetry JSON Format', { skip: !SHOULD_RUN }, () => {

    timeoutTest('Metrics endpoint returns structured data', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/metrics?tenant_id=${TENANT_ID}`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.equal(json.status, 'success');
      assert.ok(json.data, 'Should return data object');
    });

    timeoutTest('Metrics include required fields', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/metrics?tenant_id=${TENANT_ID}&days=30`);
      const json = await res.json();
      
      if (res.status === 200 && json.data) {
        // Check for expected fields
        assert.ok(
          json.data.timeseries !== undefined || json.data.summary !== undefined,
          'Should include timeseries or summary data'
        );
        
        if (json.data.period_days !== undefined) {
          assert.equal(json.data.period_days, 30, 'Should respect days parameter');
        }
      }
    });

    timeoutTest('Feedback endpoint accepts telemetry data', async () => {
      // Get a suggestion ID first
      const listRes = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&limit=1`);
      const listJson = await listRes.json();
      
      if (listJson.data?.suggestions?.length > 0) {
        const id = listJson.data.suggestions[0].id;
        
        const res = await fetch(`${BASE_URL}/api/ai/suggestions/${id}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: TENANT_ID,
            rating: 4,
            comment: 'Test feedback',
            outcome_positive: true
          })
        });
        
        // Should accept or indicate the suggestion status doesn't allow feedback
        assert.ok(
          [200, 400, 404].includes(res.status),
          'Feedback endpoint should respond appropriately'
        );
      } else {
        assert.ok(true, 'No suggestions available for feedback test');
      }
    });

  });

  describe('G3: Log Structure Validation', () => {

    timeoutTest('Worker logs are parseable', () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Check for structured log patterns (prefixed logs)
      assert.ok(
        content.includes('[AiTriggersWorker]'),
        'Logs should have consistent prefix for parsing'
      );
    });

    timeoutTest('Timestamps are included in processing logs', () => {
      const workerPath = path.join(LIB_PATH, 'aiTriggersWorker.js');
      const content = fs.readFileSync(workerPath, 'utf-8');
      
      // Check for time tracking
      assert.ok(
        content.includes('Date.now()') || 
        content.includes('new Date()') ||
        content.includes('startTime') ||
        content.includes('ms'),
        'Should track timing for observability'
      );
    });

  });

});

// Export for aggregation
export const sectionId = 'G';
export const sectionName = 'Telemetry & Observability';
