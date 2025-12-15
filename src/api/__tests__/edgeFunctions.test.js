/* eslint-env node */
/* global process */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supa from '@/lib/supabase';
import { getSupabaseAccessToken, getSupabaseFunctionsBase, mintLeadLink, buildPersonProfileUrl } from '@/api/edgeFunctions';
import { fetchPersonProfile } from '@/api/edgeFunctions';

describe('edgeFunctions helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.VITE_AISHACRM_BACKEND_URL;
    delete process.env.VITE_SUPABASE_URL;
  });

  it('getSupabaseAccessToken returns token from session', async () => {
    vi.spyOn(supa.supabase.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
    const tok = await getSupabaseAccessToken();
    expect(tok).toBe('tok123');
  });

  it('getSupabaseFunctionsBase prefers backend proxy when configured', () => {
    process.env.VITE_AISHACRM_BACKEND_URL = 'https://backend.example.com';
    const base = getSupabaseFunctionsBase();
    expect(base).toBe('https://backend.example.com/api/edge');
  });

  it('buildPersonProfileUrl builds path', () => {
    // With no backend env configured, dev default should use localhost proxy
    expect(buildPersonProfileUrl('uuid-1')).toBe('http://localhost:4001/api/edge/person-profile/uuid-1');
  });

  it('mintLeadLink calls function with auth and returns URL', async () => {
    vi.spyOn(supa.supabase.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
    process.env.VITE_AISHACRM_BACKEND_URL = 'https://backend.example.com';
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://abc.functions.supabase.co/person-profile/uuid-1?sig=xyz' })
    });
    const url = await mintLeadLink({ id: 'uuid-1' });
    expect(url).toContain('/person-profile/uuid-1');
    expect(mockFetch).toHaveBeenCalled();
    expect(mockFetch.mock.calls[0][0]).toContain('/api/edge/mint-lead-link');
  });

  it('fetchPersonProfile uses supabase.functions.invoke (POST) on success', async () => {
    // Mock invoke success
    vi.spyOn(supa.supabase.functions, 'invoke').mockResolvedValue({ data: { id: 'uuid-1', type: 'lead' }, error: null });
    const data = await fetchPersonProfile({ person_id: 'uuid-1', person_type: 'lead' });
    expect(data).toEqual({ id: 'uuid-1', type: 'lead' });
    expect(supa.supabase.functions.invoke).toHaveBeenCalledWith('person-profile', expect.objectContaining({ method: 'POST' }));
  });

  it('fetchPersonProfile falls back to backend proxy GET when invoke fails', async () => {
    // Force invoke to fail
    vi.spyOn(supa.supabase.functions, 'invoke').mockResolvedValue({ data: null, error: new Error('CORS') });
    // Auth token
    vi.spyOn(supa.supabase.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
    process.env.VITE_AISHACRM_BACKEND_URL = 'https://backend.example.com';
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ id: 'uuid-1', type: 'lead' }) });
    const data = await fetchPersonProfile({ person_id: 'uuid-1', person_type: 'lead' });
    expect(data).toEqual({ id: 'uuid-1', type: 'lead' });
    expect(mockFetch).toHaveBeenCalled();
    expect(mockFetch.mock.calls[0][0]).toContain('/api/edge/person-profile/uuid-1');
  });
});
