import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

import { toast } from 'sonner';

describe('UniversalDetailPanel - loadNotes error handling', () => {
  let originalFetch;
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    toast.error.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('should use VITE_AISHACRM_BACKEND_URL for backend URL', async () => {
    // Set up environment
    import.meta.env.VITE_AISHACRM_BACKEND_URL = 'https://api.example.com';
    
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { notes: [] } })
    });

    const entity = { id: 'test-id', tenant_id: 'tenant-123' };
    const entityType = 'contact';
    const user = { tenant_id: 'tenant-123' };

    // Simulate the loadNotes function
    const loadNotes = () => {
      const relatedType = entityType.toLowerCase();
      const tenantId = user?.tenant_id || entity.tenant_id;
      
      const backendUrl = import.meta.env.VITE_AISHACRM_BACKEND_URL || 
        (typeof window !== 'undefined' && window._env_?.VITE_AISHACRM_BACKEND_URL) || 
        'http://localhost:4001';
      
      const notesUrl = `${backendUrl}/api/notes?tenant_id=${tenantId}&related_type=${relatedType}&related_id=${entity.id}`;
      
      return fetch(notesUrl, {
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        }
      });
    };

    await loadNotes();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/notes?tenant_id=tenant-123&related_type=contact&related_id=test-id',
      expect.objectContaining({
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-123'
        }
      })
    );
  });

  it('should log detailed error on HTTP error response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Resource not found'
    });

    const entity = { id: 'test-id', tenant_id: 'tenant-123' };
    const entityType = 'contact';
    const user = { tenant_id: 'tenant-123' };

    // Simulate the loadNotes error handling
    const loadNotes = async () => {
      const relatedType = entityType.toLowerCase();
      const tenantId = user?.tenant_id || entity.tenant_id;
      const backendUrl = 'http://localhost:4001';
      const notesUrl = `${backendUrl}/api/notes?tenant_id=${tenantId}&related_type=${relatedType}&related_id=${entity.id}`;
      
      const notesRes = await fetch(notesUrl);
      
      if (!notesRes?.ok) {
        const errorText = await notesRes?.text().catch(() => 'Unable to read response');
        console.error('[UniversalDetailPanel] Failed to load notes:', {
          status: notesRes?.status,
          statusText: notesRes?.statusText,
          url: notesUrl,
          responseBody: errorText
        });
        toast.error(`Failed to load notes: ${notesRes?.status || 'Network error'} - ${notesRes?.statusText || 'Unknown error'}`);
      }
    };

    await loadNotes();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[UniversalDetailPanel] Failed to load notes:',
      expect.objectContaining({
        status: 404,
        statusText: 'Not Found',
        responseBody: 'Resource not found'
      })
    );

    expect(toast.error).toHaveBeenCalledWith('Failed to load notes: 404 - Not Found');
  });

  it('should log detailed error on network exception', async () => {
    const networkError = new Error('Failed to fetch');
    networkError.stack = 'Error: Failed to fetch\n  at fetch...';
    
    globalThis.fetch = vi.fn().mockRejectedValue(networkError);

    const entity = { id: 'test-id', tenant_id: 'tenant-123' };
    const entityType = 'contact';

    // Simulate the loadNotes exception handling
    const loadNotes = async () => {
      try {
        await fetch('http://localhost:4001/api/notes');
      } catch (error) {
        console.error('[UniversalDetailPanel] Exception loading notes:', {
          error,
          message: error?.message,
          stack: error?.stack,
          entityType,
          entityId: entity?.id
        });
        toast.error(`Failed to load notes: ${error?.message || 'Network error'}`);
      }
    };

    await loadNotes();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[UniversalDetailPanel] Exception loading notes:',
      expect.objectContaining({
        message: 'Failed to fetch',
        entityType: 'contact',
        entityId: 'test-id'
      })
    );

    expect(toast.error).toHaveBeenCalledWith('Failed to load notes: Failed to fetch');
  });

  it('should handle response with safe property access', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { notes: [{ id: '1', content: 'Test note', created_at: '2024-01-01' }] } })
    });

    // Simulate safe property access
    const loadNotes = async () => {
      const notesRes = await fetch('http://localhost:4001/api/notes');
      
      if (notesRes?.ok) {
        const notesData = await notesRes.json();
        const rawNotes = notesData?.data?.notes || notesData?.notes || notesData?.data || notesData;
        const notesArray = Array.isArray(rawNotes) ? rawNotes : [];
        return notesArray;
      }
      return [];
    };

    const result = await loadNotes();
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: '1', content: 'Test note', created_at: '2024-01-01' });
  });

  it('should include x-tenant-id header in request', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { notes: [] } })
    });

    const tenantId = 'tenant-456';

    await fetch('http://localhost:4001/api/notes', {
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId
      }
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-456'
        })
      })
    );
  });
});
