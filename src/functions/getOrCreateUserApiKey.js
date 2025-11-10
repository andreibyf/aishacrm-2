/**
 * Get or Create User API Key (Local Implementation)
 * Generates and stores a user-specific API key for AI integrations (e.g., ElevenLabs)
 * Uses sessionStorage (ephemeral) by default, localStorage (persistent) if explicitly allowed
 */

export async function getOrCreateUserApiKey(args = {}) {
  try {
    const mockTenant = args?.tenantId || 'local-tenant-001';
    const storageKey = `local_user_api_key_${mockTenant}`;
    const persistAllowed = (import.meta.env.VITE_ALLOW_PERSIST_API_KEYS === 'true');

    // Prefer sessionStorage (ephemeral). Migrate any legacy localStorage secret.
    let existing = null;
    try {
      existing = sessionStorage.getItem(storageKey);
    } catch { /* ignore */ }
    
    if (!existing) {
      try {
        const legacy = localStorage.getItem(storageKey);
        if (legacy) {
          // If persistence is not allowed, migrate to session storage and remove persistent copy
          try { sessionStorage.setItem(storageKey, legacy); } catch { /* ignore */ }
          if (!persistAllowed) {
            try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
          }
          existing = legacy;
        }
      } catch { /* ignore */ }
    }
    
    if (existing) {
      return { 
        status: 'success',
        data: { success: true, apiKey: existing } 
      };
    }
    
    // Generate a key using secure randomness when available
    const makeSecureId = () => {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID().replace(/-/g, '');
        }
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
          const bytes = new Uint8Array(16);
          crypto.getRandomValues(bytes);
          return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }
      } catch { /* fall through */ }
      // Fallback (non-cryptographic) - very unlikely path in modern browsers
      return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    };
    
    const generated = `aisha_${makeSecureId()}`;
    
    // Store in session (ephemeral). Optionally persist if explicitly allowed.
    try { sessionStorage.setItem(storageKey, generated); } catch { /* ignore */ }
    if (persistAllowed) {
      try { localStorage.setItem(storageKey, generated); } catch { /* ignore */ }
    }
    
    return { 
      status: 'success',
      data: { success: true, apiKey: generated } 
    };
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn(`[Local] getOrCreateUserApiKey failed: ${err?.message || err}`);
    }
    return { 
      status: 'error',
      data: { success: false, error: err?.message || String(err) } 
    };
  }
}
