import { createContext, useEffect, useState, useCallback } from 'react';
import { User } from '@/api/entities';
import { createMockUser, isLocalDevMode } from '@/api/mockData';
import { normalizeUser } from '@/utils/normalizeUser.js';

// Internal context object for user data
const UserContextInternal = createContext({
  user: null,
  loading: true,
  reloadUser: async () => {},
});

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const u = await User.me();
      const normalized = normalizeUser(u);
      if (import.meta.env.DEV && u && normalized && u !== normalized) {
        // Lightweight diff logging for debugging schema alignment
        try {
          const snapshot = {
            in: {
              email: u?.email,
              role: u?.role,
              tenant_id: u?.tenant_id,
              meta_role: u?.user_metadata?.role,
              meta_tenant: u?.user_metadata?.tenant_id,
            },
            out: {
              email: normalized.email,
              role: normalized.role,
              tenant_id: normalized.tenant_id,
            },
          };
          console.log('[UserContext] normalizeUser snapshot:', snapshot);
        } catch {
          /* swallow debug logging error */
        }
      }
      if (!normalized && isLocalDevMode()) {
        const mock = createMockUser();
        if (import.meta.env.DEV) {
          console.log(
            '[UserContext] No authenticated user; using mock user for local dev/test:',
            mock.email,
          );
        }
        const mockNorm = normalizeUser(mock);
        setUser(mockNorm);
        window.__USER_ROLE = mockNorm?.role || null;
      } else {
        setUser(normalized);
        window.__USER_ROLE = normalized?.role || null;
      }
    } catch (err) {
      const message = err?.message || err;
      if (import.meta.env.DEV) {
        console.error('[UserContext] Failed to load user:', message);
      }
      // In local dev/test mode with no auth configured, fall back to a mock superadmin user
      try {
        if (isLocalDevMode()) {
          const mock = createMockUser();
          if (import.meta.env.DEV) {
            console.log('[UserContext] Using mock user for local dev/test:', mock.email);
          }
          setUser(normalizeUser(mock));
        } else {
          setUser(null);
          window.__USER_ROLE = null;
        }
      } catch {
        setUser(null);
        window.__USER_ROLE = null;
      }
    } finally {
      setLoading(false);
    }
  }, []); // Empty deps - stable function reference

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <UserContextInternal.Provider
      value={{ user, loading, reloadUser: loadUser, refetch: loadUser }}
    >
      {children}
    </UserContextInternal.Provider>
  );
}

export default UserContextInternal;
