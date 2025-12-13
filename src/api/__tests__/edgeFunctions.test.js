/* eslint-env node */
/* global process */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as supa from '@/lib/supabase';
import { getSupabaseAccessToken, getSupabaseFunctionsBase, mintLeadLink, buildPersonProfileUrl } from '@/api/edgeFunctions';

describe('edgeFunctions helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getSupabaseAccessToken returns token from session', async () => {
    vi.spyOn(supa.supabase.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
    const tok = await getSupabaseAccessToken();
    expect(tok).toBe('tok123');
  });

  it('getSupabaseFunctionsBase derives correct URL', () => {
    const original = process.env.VITE_SUPABASE_URL;
    process.env.VITE_SUPABASE_URL = 'https://abc.supabase.co';
    const base = getSupabaseFunctionsBase();
    expect(base).toBe('https://abc.functions.supabase.co');
    process.env.VITE_SUPABASE_URL = original;
  });

  it('buildPersonProfileUrl builds path', () => {
    const original = process.env.VITE_SUPABASE_URL;
    process.env.VITE_SUPABASE_URL = 'https://abc.supabase.co';
    expect(buildPersonProfileUrl('uuid-1')).toBe('https://abc.functions.supabase.co/person-profile/uuid-1');
    process.env.VITE_SUPABASE_URL = original;
  });

  it('mintLeadLink calls function with auth and returns URL', async () => {
    vi.spyOn(supa.supabase.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
    const original = process.env.VITE_SUPABASE_URL;
    process.env.VITE_SUPABASE_URL = 'https://abc.supabase.co';
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://abc.functions.supabase.co/person-profile/uuid-1?sig=xyz' })
    });
    const url = await mintLeadLink({ id: 'uuid-1' });
    expect(url).toContain('/person-profile/uuid-1');
    expect(mockFetch).toHaveBeenCalled();
    process.env.VITE_SUPABASE_URL = original;
  });
});
