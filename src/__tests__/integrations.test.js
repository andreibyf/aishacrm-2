/**
 * Integration Tests for File Upload
 * Tests the UploadFile function from src/api/integrations.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('UploadFile', () => {
  let originalFetch;
  let mockFile;

  beforeEach(() => {
    // Save original fetch
    originalFetch = globalThis.fetch;
    
    // Create a mock file
    mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
    
    // Mock console methods to suppress logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should send request with headers object when tenant_id is provided', async () => {
    // Mock successful upload response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          file_url: 'https://example.com/file.txt',
          filename: 'uploads/test/file.txt'
        }
      })
    });

    // Import here to get fresh module with mocked fetch
    const { UploadFile } = await import('../api/integrations.js');

    const result = await UploadFile({
      file: mockFile,
      tenant_id: 'test-tenant-uuid'
    });

    // Verify fetch was called
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Get the fetch call arguments
    const [url, options] = globalThis.fetch.mock.calls[0];

    // Verify URL
    expect(url).toContain('/api/storage/upload');

    // Verify headers is an object (not undefined)
    expect(options.headers).toBeDefined();
    expect(typeof options.headers).toBe('object');
    expect(options.headers['x-tenant-id']).toBe('test-tenant-uuid');

    // Verify other options
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect(options.body).toBeInstanceOf(FormData);

    // Verify result
    expect(result.success).toBe(true);
    expect(result.file_url).toBe('https://example.com/file.txt');
    expect(result.filename).toBe('uploads/test/file.txt');
  });

  it('should send request with empty headers object when tenant_id is not provided', async () => {
    // Mock successful upload response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          file_url: 'https://example.com/file.txt',
          filename: 'uploads/test/file.txt'
        }
      })
    });

    const { UploadFile } = await import('../api/integrations.js');

    await UploadFile({
      file: mockFile
      // No tenant_id provided
    });

    // Get the fetch call arguments
    const [, options] = globalThis.fetch.mock.calls[0];

    // Verify headers is an object (not undefined)
    expect(options.headers).toBeDefined();
    expect(typeof options.headers).toBe('object');
    
    // Should be empty object
    expect(Object.keys(options.headers).length).toBe(0);
  });

  it('should handle upload errors gracefully', async () => {
    // Mock failed upload response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        status: 'error',
        message: 'File too large'
      })
    });

    const { UploadFile } = await import('../api/integrations.js');

    // Should throw error
    await expect(
      UploadFile({
        file: mockFile,
        tenant_id: 'test-tenant'
      })
    ).rejects.toThrow('File too large');

    // Verify error was logged
    expect(console.error).toHaveBeenCalled();
  });

  it('should handle network errors gracefully', async () => {
    // Mock network error
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { UploadFile } = await import('../api/integrations.js');

    // Should throw error
    await expect(
      UploadFile({
        file: mockFile,
        tenant_id: 'test-tenant'
      })
    ).rejects.toThrow('Network error');

    // Verify error was logged
    expect(console.error).toHaveBeenCalled();
  });

  it('should log detailed information during upload', async () => {
    // Mock successful upload
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: {
          file_url: 'https://example.com/file.txt',
          filename: 'uploads/test/file.txt'
        }
      })
    });

    const { UploadFile } = await import('../api/integrations.js');

    await UploadFile({
      file: mockFile,
      tenant_id: 'test-tenant'
    });

    // Verify logging was called with expected messages
    const logCalls = console.log.mock.calls.flat();
    const logMessages = logCalls.filter(call => typeof call === 'string');
    
    expect(logMessages.some(msg => msg.includes('[UploadFile] Starting upload'))).toBe(true);
    expect(logMessages.some(msg => msg.includes('[UploadFile] Sending request to'))).toBe(true);
    expect(logMessages.some(msg => msg.includes('[UploadFile] Response status'))).toBe(true);
    expect(logMessages.some(msg => msg.includes('[UploadFile] Upload successful'))).toBe(true);
  });
});
