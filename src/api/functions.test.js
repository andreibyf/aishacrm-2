/**
 * Unit tests for src/api/functions.js
 * Verifies core API function exports
 */
import { describe, test, expect } from 'vitest';

describe('functions.js exports', () => {
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
});
