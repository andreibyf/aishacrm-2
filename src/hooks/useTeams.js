import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getBackendUrl } from '@/api/backendUrl';

/**
 * useTeams — fetches available teams for the current tenant.
 *
 * Returns:
 *   teams:   Array of { id, name } objects
 *   loading: boolean
 *
 * Also returns team_members mapping so we can filter employees by team.
 *   membersByTeam: { [teamId]: string[] } — employee IDs per team
 */
export default function useTeams(tenantId) {
  const [teams, setTeams] = useState([]);
  const [membersByTeam, setMembersByTeam] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    const fetchTeams = async () => {
      setLoading(true);
      try {
        const BACKEND_URL = getBackendUrl();
        const headers = { 'Content-Type': 'application/json' };

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

        const res = await fetch(`${BACKEND_URL}/api/v2/leads/teams-with-members`, {
          credentials: 'include',
          headers,
        });

        if (res.ok) {
          const json = await res.json();
          const data = json.data || {};
          setTeams(data.teams || []);
          setMembersByTeam(data.membersByTeam || {});
        } else {
          console.warn('[useTeams] teams-with-members returned', res.status);
          setTeams([]);
          setMembersByTeam({});
        }
      } catch (err) {
        console.warn('[useTeams] Could not fetch teams:', err);
        setTeams([]);
        setMembersByTeam({});
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, [tenantId]);

  return { teams, membersByTeam, loading };
}
