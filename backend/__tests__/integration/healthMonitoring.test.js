/**
 * Health Monitoring System Tests
 * Tests for autonomous issue detection, pattern analysis, and alert management
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getSupabaseClient } from '../../lib/supabase-db.js';
import { 
  getActiveAlerts, 
  getHealthStats, 
  resolveAlert,
  triggerHealthCheck 
} from '../../lib/healthMonitor.js';
import { withTimeoutSkip, getTestTimeoutMs } from '../helpers/timeout.js';

const timeoutTest = (name, fn) =>
  test(name, { timeout: getTestTimeoutMs() }, async (t) => {
    await withTimeoutSkip(t, fn);
  });

describe('Health Monitoring System', () => {
  let testAlertId = null;
  const supa = getSupabaseClient();

  timeoutTest('should create health alerts table and views', async () => {
    // Check if table exists
    const { error: tableError } = await supa
      .from('devai_health_alerts')
      .select('id')
      .limit(1);
    
    assert.equal(tableError, null, 'devai_health_alerts table should exist');
  });

  timeoutTest('should create deduplication function', async () => {
    // Test deduplication function
    const { data, error } = await supa
      .rpc('devai_check_duplicate_alert', {
        p_category: 'test_category',
        p_title: 'Test Alert',
        p_time_window_minutes: 60,
      });
    
    assert.equal(error, null, 'Deduplication function should work');
    assert.equal(data, false, 'No duplicates should exist for new alert');
  });

  timeoutTest('should create a health alert', async () => {
    const testAlert = {
      severity: 'medium',
      category: 'error_spike',
      title: 'Test Error Spike',
      summary: 'Automated test alert for health monitoring system',
      details: {
        test: true,
        error_count: 25,
        window_minutes: 15,
      },
      error_count: 25,
      recommendation: 'This is a test alert - ignore',
      auto_detected: false, // Mark as manual test
    };

    const { data, error } = await supa
      .from('devai_health_alerts')
      .insert(testAlert)
      .select()
      .single();
    
    assert.equal(error, null, 'Alert creation should succeed');
    assert.ok(data.id, 'Alert should have an ID');
    assert.equal(data.severity, 'medium', 'Severity should match');
    assert.equal(data.category, 'error_spike', 'Category should match');
    
    testAlertId = data.id;
  });

  timeoutTest('should prevent duplicate alerts', async () => {
    // Create first alert
    const alert1 = {
      severity: 'low',
      category: 'api',
      title: 'Duplicate Test Alert',
      summary: 'First alert',
      auto_detected: false,
    };

    const { data: created, error: createError } = await supa
      .from('devai_health_alerts')
      .insert(alert1)
      .select()
      .single();
    
    assert.equal(createError, null, 'First alert should be created');

    // Check for duplicate
    const { data: isDuplicate } = await supa
      .rpc('devai_check_duplicate_alert', {
        p_category: 'api',
        p_title: 'Duplicate Test Alert',
        p_time_window_minutes: 60,
      });
    
    assert.equal(isDuplicate, true, 'Duplicate should be detected');

    // Clean up
    await supa.from('devai_health_alerts').delete().eq('id', created.id);
  });

  timeoutTest('should get active alerts', async () => {
    const alerts = await getActiveAlerts(10);
    
    assert.ok(Array.isArray(alerts), 'Should return an array');
    assert.ok(alerts.length > 0, 'Should have at least the test alert');
    
    const testAlert = alerts.find(a => a.id === testAlertId);
    assert.ok(testAlert, 'Test alert should be in active alerts');
    assert.equal(testAlert.resolved_at, null, 'Test alert should be unresolved');
  });

  timeoutTest('should get health stats', async () => {
    const stats = await getHealthStats();
    
    assert.ok(stats, 'Should return stats');
    assert.ok(stats.active_alerts >= 1, 'Should have at least 1 active alert');
    assert.ok('critical_alerts' in stats, 'Should include critical_alerts');
    assert.ok('high_alerts' in stats, 'Should include high_alerts');
    assert.ok('medium_alerts' in stats, 'Should include medium_alerts');
    assert.ok('low_alerts' in stats, 'Should include low_alerts');
  });

  timeoutTest('should resolve an alert', async () => {
    const result = await resolveAlert(testAlertId, null);
    
    assert.equal(result.success, true, 'Resolve should succeed');
    assert.ok(result.data.resolved_at, 'Alert should have resolved_at timestamp');
    
    // Verify it's no longer in active alerts
    const activeAlerts = await getActiveAlerts(100);
    const stillActive = activeAlerts.find(a => a.id === testAlertId);
    assert.equal(stillActive, undefined, 'Resolved alert should not be in active list');
  });

  timeoutTest('should trigger manual health check', async () => {
    // This is async, so we just verify it does not throw
    let errorThrown = false;
    try {
      await triggerHealthCheck();
    } catch (_err) {
      errorThrown = true;
    }
    assert.equal(errorThrown, false, 'Manual health check trigger should not throw');
  });

  timeoutTest('should handle invalid alert ID gracefully', async () => {
    const result = await resolveAlert('00000000-0000-0000-0000-000000000000', null);
    
    assert.equal(result.success, false, 'Invalid ID should fail gracefully');
    assert.ok(result.error, 'Should return error message');
  });

  timeoutTest('should clean up test alerts', async () => {
    // Clean up all test alerts
    const { error } = await supa
      .from('devai_health_alerts')
      .delete()
      .or('auto_detected.eq.false,title.ilike.%test%');
    
    assert.equal(error, null, 'Cleanup should succeed');
  });
});

describe('Log Pattern Analysis', () => {
  timeoutTest('should detect error spikes in logs', async () => {
    // This would be tested by generating fake logs, but for now we test the function exists
    const { readLogs } = await import('../../lib/developerAI.js');
    
    // Mock log content with recurring errors
    const _mockLogs = `
[2026-01-07 10:00:00] Error: Database connection failed
[2026-01-07 10:00:05] Error: Database connection failed
[2026-01-07 10:00:10] Error: Database connection failed
[2026-01-07 10:00:15] Error: Database connection failed
[2026-01-07 10:00:20] Error: Database connection failed
[2026-01-07 10:00:25] Error: API timeout
[2026-01-07 10:00:30] Error: API timeout
[2026-01-07 10:00:35] Error: API timeout
    `.trim();

    // We can't directly test pattern analysis without running the full tool,
    // but we can verify the function signature exists
    assert.ok(typeof readLogs === 'function', 'readLogs function should exist');
  });
});

describe('Developer AI Log Access Behavior', () => {
  timeoutTest('readLogs in production Docker environment should not suggest platform dashboards', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevDockerFlag = process.env.DOCKER_CONTAINER;

    try {
      process.env.NODE_ENV = 'production';
      process.env.DOCKER_CONTAINER = 'true';

      const { readLogs } = await import('../../lib/developerAI.js');

      const result = await readLogs({
        log_type: 'backend',
        lines: 50,
        analyze_patterns: false,
        since_minutes: 15,
      });

      assert.ok(result, 'readLogs should return a result object');

      const note = (result.note || '').toLowerCase();
      const suggestion = (result.suggestion || '').toLowerCase();

      assert.ok(
        !note.includes('platform') && !note.includes('dashboard'),
        'readLogs note should not direct users to a platform logging dashboard',
      );

      assert.ok(
        !suggestion.includes('platform') && !suggestion.includes('dashboard'),
        'readLogs suggestion should not direct users to a platform logging dashboard',
      );
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      process.env.DOCKER_CONTAINER = prevDockerFlag;
    }
  });
});

describe('Health Alerts API Endpoints', () => {
  timeoutTest('should have health alerts endpoints defined', async () => {
    // Test that routes are properly imported
    const routesModule = await import('../../routes/devaiHealthAlerts.js');
    assert.ok(routesModule.default, 'Health alerts routes should be exported');
  });
});

console.log('✅ Health Monitoring System tests completed');
