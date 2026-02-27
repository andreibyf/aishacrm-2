import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getBackendUrl } from '@/api/backendUrl';

/**
 * useTeamScope — fetches the team visibility scope for the current user.
 *
 * Returns `allowedIds`:
 *   null  = admin/superadmin (no filtering, show all employees)
 *   []    = loading or error
 *   [...] = array of employee UUIDs this user can see/assign to
 *
 * Usage:
 *   const { allowedIds } = useTeamScope(user);
 *   <LazyEmployeeSelector allowedIds={allowedIds} ... />
 */
export default function useTeamScope(user) {
  const [allowedIds, setAllowedIds] = useState(null);

  useEffect(() => {
    if (!user) return;

    const role = (user.role || '').toLowerCase();
    // Admins/superadmins bypass — null means no filtering
    if (role === 'superadmin' || role === 'admin') {
      setAllowedIds(null);
      return;
    }

    const fetchScope = async () => {
      try {
        const BACKEND_URL = getBackendUrl();
        const headers = { 'Content-Type': 'application/json' };

        // Include Supabase auth token for cross-domain requests
        if (isSupabaseConfigured()) {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (session?.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`;
            }
          } catch {
            // Continue without token
          }
        }

        const res = await fetch(`${BACKEND_URL}/api/v2/leads/team-scope`, {
          credentials: 'include',
          headers,
        });
        if (res.ok) {
          const json = await res.json();
          if (json.data?.bypass) {
            setAllowedIds(null);
          } else if (json.data?.employeeIds) {
            setAllowedIds(json.data.employeeIds);
          }
        } else {
          console.warn('[useTeamScope] team-scope returned', res.status);
          // Fail open — don't restrict
          setAllowedIds(null);
        }
      } catch (err) {
        console.warn('[useTeamScope] Could not fetch team scope:', err);
        // Fail open — don't restrict
        setAllowedIds(null);
      }
    };

    fetchScope();
  }, [user]);

  return { allowedIds };
}
