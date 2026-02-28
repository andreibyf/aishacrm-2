/**
 * Fetch team context for a user's identity block in AiSHA's system prompt.
 *
 * Queries team_members → teams → employees to build:
 *   - teamLines:        formatted team info for the CURRENT USER IDENTITY block
 *   - teamPronounRules: team-aware pronoun routing rules for the PRONOUN RESOLUTION block
 *
 * Uses Supabase client (not pgPool) per project convention.
 * Non-fatal on any error — returns empty strings so chat continues without team context.
 *
 * @param {Function} getSupabaseClient - Factory that returns a Supabase client instance
 * @param {string}   employeeId        - The authenticated user's employee UUID
 * @param {Function} [logger]          - Optional logger with .warn() method
 * @returns {Promise<{ teamLines: string, teamPronounRules: string }>}
 */
export async function fetchUserTeamContext(getSupabaseClient, employeeId, logger = null) {
  if (!employeeId) return { teamLines: '', teamPronounRules: '' };
  try {
    const supabase = getSupabaseClient();

    // Three lightweight queries to get: user's teams, team names, and teammates.
    // (Supabase JS doesn't support self-join on team_members elegantly.)

    // 1. Get the user's own team memberships
    const { data: myMemberships, error: memErr } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('employee_id', employeeId);

    if (memErr || !myMemberships?.length) {
      return { teamLines: '', teamPronounRules: '' };
    }

    const teamIds = myMemberships.map((m) => m.team_id);
    const myRoleByTeam = Object.fromEntries(myMemberships.map((m) => [m.team_id, m.role]));

    // 2. Get team names
    const { data: teams, error: teamErr } = await supabase
      .from('teams')
      .select('id, name')
      .in('id', teamIds);

    if (teamErr || !teams?.length) {
      return { teamLines: '', teamPronounRules: '' };
    }

    // 3. Get all members of those teams
    const { data: allMembers, error: memberErr } = await supabase
      .from('team_members')
      .select('team_id, employee_id, employees!inner ( first_name, last_name )')
      .in('team_id', teamIds);

    if (memberErr) {
      return { teamLines: '', teamPronounRules: '' };
    }

    // Group members by team, build compact display
    const membersByTeam = {};
    for (const m of allMembers || []) {
      if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
      const name = [m.employees?.first_name, m.employees?.last_name].filter(Boolean).join(' ');
      if (name) membersByTeam[m.team_id].push(name);
    }

    // Build team lines for system prompt (compact to stay within token budget)
    const teamLines = teams
      .map((t) => {
        const role = myRoleByTeam[t.id] || 'member';
        const members = (membersByTeam[t.id] || []).join(', ');
        return `- Team: ${t.name} (${role})\n  Members: ${members}\n  Team ID: ${t.id}`;
      })
      .join('\n');

    // Build team-aware pronoun rules
    const teamRuleParts = teams.map((t) => {
      return `- "${t.name} leads", "${t.name}'s leads" → call list_leads with assigned_to_team="${t.id}"`;
    });

    const teamPronounRules = [
      `- "my team's leads", "my team leads", "team leads" → call list_leads with assigned_to_team="${teams[0].id}"${teams.length > 1 ? ' (or ask which team if ambiguous)' : ''}`,
      ...teamRuleParts,
      '- "[person name]\'s leads" → find that person\'s employee UUID, then call list_leads with assigned_to="<their UUID>"',
      '- For any entity (contacts, accounts, opportunities, activities, bizdev sources), the same assigned_to_team parameter pattern applies to the corresponding list function.',
    ].join('\n');

    return { teamLines, teamPronounRules };
  } catch (err) {
    // Non-fatal: team context is additive, don't break chat if it fails
    if (logger?.warn) {
      logger.warn('[AI] Failed to fetch team context for identity block:', err?.message);
    }
    return { teamLines: '', teamPronounRules: '' };
  }
}
