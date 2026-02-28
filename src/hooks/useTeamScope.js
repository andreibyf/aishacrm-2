import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getBackendUrl } from '@/api/backendUrl';

/**
 * useTeamScope — fetches the team visibility scope for the current user.
 *
 * Returns:
 *   allowedIds:        null (admin bypass) | string[] (employee UUIDs this user can see/assign to)
 *   teamIds:           string[] — all team IDs this user belongs to
 *   fullAccessTeamIds: string[] — team IDs where user has full R/W
 *   highestRole:       'director' | 'manager' | 'member' | 'none' | 'admin'
 *   bypass:            boolean — true for admin/superadmin
 *   loading:           boolean — true while fetching scope
 *
 * Usage:
 *   const { allowedIds, teamIds, fullAccessTeamIds, highestRole, bypass, loading } = useTeamScope(user);
 */
export default function useTeamScope(user) {
  const [allowedIds, setAllowedIds] = useState(null);
  const [teamIds, setTeamIds] = useState([]);
  const [fullAccessTeamIds, setFullAccessTeamIds] = useState([]);
  const [highestRole, setHighestRole] = useState('none');
  const [bypass, setBypass] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const role = (user.role || '').toLowerCase();
    // Admins/superadmins bypass — null means no filtering
    if (role === 'superadmin' || role === 'admin') {
      setAllowedIds(null);
      setTeamIds([]);
      setFullAccessTeamIds([]);
      setHighestRole('admin');
      setBypass(true);
      setLoading(false);
      return;
    }

    const fetchScope = async () => {
      setLoading(true);
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
          const data = json.data || {};
          if (data.bypass) {
            setAllowedIds(null);
            setBypass(true);
            setHighestRole('admin');
          } else {
            setAllowedIds(data.employeeIds || []);
            setBypass(false);
            setHighestRole(data.highestRole || 'none');
          }
          setTeamIds(data.teamIds || []);
          setFullAccessTeamIds(data.fullAccessTeamIds || []);
        } else {
          console.warn('[useTeamScope] team-scope returned', res.status);
          // Fail open — don't restrict
          setAllowedIds(null);
          setBypass(true);
        }
      } catch (err) {
        console.warn('[useTeamScope] Could not fetch team scope:', err);
        // Fail open — don't restrict
        setAllowedIds(null);
        setBypass(true);
      } finally {
        setLoading(false);
      }
    };

    fetchScope();
  }, [user]);

  return { allowedIds, teamIds, fullAccessTeamIds, highestRole, bypass, loading };
}
