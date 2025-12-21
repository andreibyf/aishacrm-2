/**
 * Unit tests for src/api/entities.js
 * Smoke test - verifies the module can be imported
 */
import { describe, test, expect, vi } from 'vitest';

// Mock fetch to avoid network calls during import
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));

describe('entities.js', () => {
  test('module can be imported without errors', async () => {
    // The main test is that this import succeeds without throwing
    const module = await import('./entities');
    
    // Verify it's a valid module with exports
    expect(module).toBeDefined();
    expect(Object.keys(module).length).toBeGreaterThan(0);
    
    // Log what we got for visibility
    console.log('Entities module exports:', Object.keys(module).slice(0, 10).join(', '), '...');
  });
});
