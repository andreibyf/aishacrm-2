/**
 * Unit tests for src/api/functions.js
 * Verifies core API function exports
 */
import { describe, test, expect } from 'vitest';

describe('[PLATFORM] functions.js exports', () => {
  test('core function exports are defined via proxy', async () => {
    const functions = await import('./functions');

    // Verify AI-related function exports
    expect(functions.aiToken).toBeDefined();
    expect(typeof functions.aiToken).toBe('function');

    expect(functions.aiRun).toBeDefined();
    expect(typeof functions.aiRun).toBe('function');

    // Verify voice function export
    expect(functions.voiceCommand).toBeDefined();
    expect(typeof functions.voiceCommand).toBe('function');

    // Verify data functions
    expect(functions.checkDataVolume).toBeDefined();
    expect(typeof functions.checkDataVolume).toBe('function');
  });

  test('getAuthorizationHeader is exported for dynamic API helpers', async () => {
    const functions = await import('./functions');

    expect(functions.getAuthorizationHeader).toBeDefined();
    expect(typeof functions.getAuthorizationHeader).toBe('function');
  });

  test('generateAIEmailDraft is callable with tenant_id in payload', async () => {
    // Regression: ContactDetailPanel was calling generateAIEmailDraft without tenant_id,
    // causing validateTenantAccess to return 400 for superadmin users.
    // Verify the function is exported and accepts a tenant_id field without throwing.
    const { generateAIEmailDraft } = await import('./functions');
    expect(typeof generateAIEmailDraft).toBe('function');
    // Calling without a live backend will reject, but it should not throw synchronously —
    // the payload shape with tenant_id must be accepted.
    const result = generateAIEmailDraft({
      recipientEmail: 'test@example.com',
      recipientName: 'Test User',
      context: 'Unit test context',
      prompt: 'Write a test email',
      tenant_id: '759a83e8-0000-0000-0000-000000000000',
    });
    // Returns a Promise (may reject if backend is unavailable — that is expected in unit tests)
    expect(result).toBeInstanceOf(Promise);
  });
});
