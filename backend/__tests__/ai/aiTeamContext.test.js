/**
 * Unit tests for backend/lib/aiTeamContext.js — fetchUserTeamContext
 *
 * Tests system prompt team identity injection across all scenarios:
 *   - Single-team member, manager, multi-team director
 *   - No team memberships, null/undefined employee ID
 *   - Supabase errors on each query, thrown exceptions
 *   - Edge cases: empty names, empty members, missing roles, duplicates
 *   - Token budget sanity, output format validation
 *   - Integration: identity block string rendering (mirrors ai.js template)
 *   - Factory contract, large team stress test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUserTeamContext } from '../../lib/aiTeamContext.js';

// ─── Test Data (mirrors dev tenant b62b764d-...) ─────────────────────────────

const TEAM_A_ID = 'bb000001-0000-0000-0000-000000000001';
const TEAM_B_ID = 'bb000001-0000-0000-0000-000000000002';

const EMP_SARAH = 'aa000001-0000-0000-0000-000000000001'; // director on A + B
const EMP_MIKE = 'aa000001-0000-0000-0000-000000000002'; // manager on A
const EMP_TOM = 'aa000001-0000-0000-0000-000000000004'; // member on A
const EMP_AMY = 'aa000001-0000-0000-0000-000000000005'; // member on A
const EMP_JANE = 'aa000001-0000-0000-0000-000000000003'; // manager on B
const EMP_BOB = 'aa000001-0000-0000-0000-000000000006'; // member on B
const EMP_NONAME = 'aa000001-0000-0000-0000-000000000099'; // edge case: no name fields
const EMP_NOTEAM = 'aa000001-0000-0000-0000-000000000077'; // no team memberships

const ALL_TEAM_MEMBERS = [
  { team_id: TEAM_A_ID, employee_id: EMP_SARAH, role: 'director' },
  { team_id: TEAM_A_ID, employee_id: EMP_MIKE, role: 'manager' },
  { team_id: TEAM_A_ID, employee_id: EMP_TOM, role: 'member' },
  { team_id: TEAM_A_ID, employee_id: EMP_AMY, role: 'member' },
  { team_id: TEAM_B_ID, employee_id: EMP_SARAH, role: 'director' },
  { team_id: TEAM_B_ID, employee_id: EMP_JANE, role: 'manager' },
  { team_id: TEAM_B_ID, employee_id: EMP_BOB, role: 'member' },
];

const EMPLOYEE_NAMES = {
  [EMP_SARAH]: { first_name: 'Sarah', last_name: 'Director' },
  [EMP_MIKE]: { first_name: 'Mike', last_name: 'ManagerA' },
  [EMP_TOM]: { first_name: 'Tom', last_name: 'RepA1' },
  [EMP_AMY]: { first_name: 'Amy', last_name: 'RepA2' },
  [EMP_JANE]: { first_name: 'Jane', last_name: 'ManagerB' },
  [EMP_BOB]: { first_name: 'Bob', last_name: 'RepB1' },
  [EMP_NONAME]: { first_name: null, last_name: null },
};

const TEAMS = [
  { id: TEAM_A_ID, name: 'Sales Team A' },
  { id: TEAM_B_ID, name: 'Sales Team B' },
];

// ─── Mock Supabase Builder ───────────────────────────────────────────────────

function mockSupabase(tableResults = {}) {
  const callIndex = {};

  function createChain(table) {
    const idx = (callIndex[table] = (callIndex[table] || 0) + 1);
    const results = tableResults[table];

    let result;
    if (Array.isArray(results)) {
      result = results[idx - 1] || results[results.length - 1];
    } else {
      result = results || { data: null, error: null };
    }

    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
      catch: (onRejected) => Promise.resolve(result).catch(onRejected),
    };

    return chain;
  }

  return { from: (table) => createChain(table) };
}

function buildMockFactory({ myMemberships, teams, allMembersWithNames }) {
  const membersWithEmployees = allMembersWithNames.map((m) => ({
    team_id: m.team_id,
    employee_id: m.employee_id,
    employees: EMPLOYEE_NAMES[m.employee_id] || { first_name: null, last_name: null },
  }));

  const sb = mockSupabase({
    team_members: [
      { data: myMemberships, error: null },
      { data: membersWithEmployees, error: null },
    ],
    teams: { data: teams, error: null },
  });

  return () => sb;
}

/**
 * Simulates the template-string logic from ai.js to verify
 * the final system prompt renders correctly end-to-end.
 */
function renderIdentityBlock({
  userName,
  userEmail,
  userId,
  userRole,
  teamLines,
  teamPronounRules,
}) {
  return userName || userEmail
    ? `\n\n**CURRENT USER IDENTITY:**\n- Name: ${userName || 'Unknown'}\n- Email: ${userEmail || 'Unknown'}\n- User ID: ${userId || 'Unknown'}\n- Role: ${userRole}${teamLines ? `\n${teamLines}` : ''}\n\n**PRONOUN RESOLUTION RULES (MANDATORY):**\n- "my leads", "leads assigned to me", "how many leads do I have" → call list_leads with assigned_to="${userId}"\n${teamPronounRules || '- "my team leads", "team leads" → call list_leads WITHOUT assigned_to (visibility scoping handles team filtering)'}\n- "unassigned leads" → call list_leads with assigned_to="unassigned"\n- NEVER use search_leads for assignment queries — it only searches by text. Use list_leads with assigned_to param.\n- Always include the assigned_to_name field when listing records so users can see who owns each record`
    : '';
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('aiTeamContext — fetchUserTeamContext', () => {
  // ── Null / empty input ──────────────────────────────────────────────────

  it('returns empty strings for null employeeId', async () => {
    const result = await fetchUserTeamContext(() => mockSupabase({}), null);
    assert.equal(result.teamLines, '');
    assert.equal(result.teamPronounRules, '');
  });

  it('returns empty strings for undefined employeeId', async () => {
    const result = await fetchUserTeamContext(() => mockSupabase({}), undefined);
    assert.equal(result.teamLines, '');
    assert.equal(result.teamPronounRules, '');
  });

  it('returns empty strings for empty string employeeId', async () => {
    const result = await fetchUserTeamContext(() => mockSupabase({}), '');
    assert.equal(result.teamLines, '');
    assert.equal(result.teamPronounRules, '');
  });

  // ── User with no team memberships ───────────────────────────────────────

  it('returns empty strings when user has no team memberships', async () => {
    const factory = () => mockSupabase({ team_members: { data: [], error: null } });
    const result = await fetchUserTeamContext(factory, EMP_NOTEAM);
    assert.equal(result.teamLines, '');
    assert.equal(result.teamPronounRules, '');
  });

  it('returns empty strings when team_members query returns null data', async () => {
    const factory = () => mockSupabase({ team_members: { data: null, error: null } });
    const result = await fetchUserTeamContext(factory, EMP_NOTEAM);
    assert.equal(result.teamLines, '');
    assert.equal(result.teamPronounRules, '');
  });

  // ── Single-team member (Tom RepA1) ──────────────────────────────────────

  describe('single-team member (Tom RepA1)', () => {
    let result;

    it('fetches team context successfully', async () => {
      const factory = buildMockFactory({
        myMemberships: [{ team_id: TEAM_A_ID, role: 'member' }],
        teams: [TEAMS[0]],
        allMembersWithNames: ALL_TEAM_MEMBERS.filter((m) => m.team_id === TEAM_A_ID),
      });
      result = await fetchUserTeamContext(factory, EMP_TOM);
    });

    it('includes team name and role', () => {
      assert.ok(result.teamLines.includes('Sales Team A (member)'));
    });
    it('includes team ID', () => {
      assert.ok(result.teamLines.includes(TEAM_A_ID));
    });
    it('includes all team A members', () => {
      for (const name of ['Sarah Director', 'Mike ManagerA', 'Tom RepA1', 'Amy RepA2']) {
        assert.ok(result.teamLines.includes(name), `Missing member: ${name}`);
      }
    });
    it('pronoun rules use assigned_to_team', () => {
      assert.ok(result.teamPronounRules.includes(`assigned_to_team="${TEAM_A_ID}"`));
    });
    it('pronoun rules include "my team" mapping', () => {
      assert.ok(result.teamPronounRules.includes('my team'));
    });
    it('pronoun rules include team name routing', () => {
      assert.ok(result.teamPronounRules.includes('Sales Team A leads'));
    });
    it('does NOT include multi-team ambiguity hint', () => {
      assert.ok(!result.teamPronounRules.includes('ask which team'));
    });
    it('includes person name lookup rule', () => {
      assert.ok(result.teamPronounRules.includes('[person name]'));
    });
    it('includes cross-entity note', () => {
      assert.ok(result.teamPronounRules.includes('contacts, accounts, opportunities'));
    });
  });

  // ── Single-team manager (Mike ManagerA) ─────────────────────────────────

  it('shows manager role for Mike ManagerA', async () => {
    const factory = buildMockFactory({
      myMemberships: [{ team_id: TEAM_A_ID, role: 'manager' }],
      teams: [TEAMS[0]],
      allMembersWithNames: ALL_TEAM_MEMBERS.filter((m) => m.team_id === TEAM_A_ID),
    });
    const result = await fetchUserTeamContext(factory, EMP_MIKE);
    assert.ok(result.teamLines.includes('Sales Team A (manager)'));
  });

  // ── Multi-team director (Sarah Director) ────────────────────────────────

  describe('multi-team director (Sarah Director)', () => {
    let result;

    it('fetches both teams', async () => {
      const factory = buildMockFactory({
        myMemberships: [
          { team_id: TEAM_A_ID, role: 'director' },
          { team_id: TEAM_B_ID, role: 'director' },
        ],
        teams: TEAMS,
        allMembersWithNames: ALL_TEAM_MEMBERS,
      });
      result = await fetchUserTeamContext(factory, EMP_SARAH);
    });

    it('includes both teams with director role', () => {
      assert.ok(result.teamLines.includes('Sales Team A (director)'));
      assert.ok(result.teamLines.includes('Sales Team B (director)'));
    });
    it('includes both team IDs', () => {
      assert.ok(result.teamLines.includes(TEAM_A_ID));
      assert.ok(result.teamLines.includes(TEAM_B_ID));
    });
    it('includes Team A members', () => {
      assert.ok(result.teamLines.includes('Tom RepA1'));
    });
    it('includes Team B members', () => {
      assert.ok(result.teamLines.includes('Bob RepB1'));
    });
    it('pronoun rules for both teams', () => {
      assert.ok(result.teamPronounRules.includes('Sales Team A leads'));
      assert.ok(result.teamPronounRules.includes('Sales Team B leads'));
    });
    it('includes multi-team ambiguity hint', () => {
      assert.ok(result.teamPronounRules.includes('ask which team if ambiguous'));
    });
  });

  // ── Supabase error handling ─────────────────────────────────────────────

  describe('Supabase error handling', () => {
    it('returns empty on team_members query error', async () => {
      const factory = () =>
        mockSupabase({
          team_members: { data: null, error: { message: 'DB error' } },
        });
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      assert.equal(result.teamLines, '');
    });

    it('returns empty on teams query error', async () => {
      const factory = () =>
        mockSupabase({
          team_members: [{ data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null }],
          teams: { data: null, error: { message: 'Teams error' } },
        });
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      assert.equal(result.teamLines, '');
    });

    it('returns empty on teams query returning empty array', async () => {
      const factory = () =>
        mockSupabase({
          team_members: [{ data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null }],
          teams: { data: [], error: null },
        });
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      assert.equal(result.teamLines, '');
    });

    it('returns empty on all-members query error', async () => {
      const factory = () =>
        mockSupabase({
          team_members: [
            { data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null },
            { data: null, error: { message: 'Join error' } },
          ],
          teams: { data: [TEAMS[0]], error: null },
        });
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      assert.equal(result.teamLines, '');
    });
  });

  // ── Exception handling ─────────────────────────────────────────────────

  describe('exception handling', () => {
    it('returns empty when getSupabaseClient throws', async () => {
      const result = await fetchUserTeamContext(() => {
        throw new Error('init fail');
      }, EMP_TOM);
      assert.equal(result.teamLines, '');
    });

    it('logs warning when logger provided', async () => {
      const warnings = [];
      const mockLogger = { warn: (...args) => warnings.push(args.join(' ')) };
      await fetchUserTeamContext(
        () => {
          throw new Error('Connection refused');
        },
        EMP_TOM,
        mockLogger,
      );
      assert.equal(warnings.length, 1);
      assert.ok(warnings[0].includes('Connection refused'));
    });

    it('does not throw when logger is null', async () => {
      const result = await fetchUserTeamContext(
        () => {
          throw new Error('boom');
        },
        EMP_TOM,
        null,
      );
      assert.equal(result.teamLines, '');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles employee with null name fields', async () => {
      const factory = buildMockFactory({
        myMemberships: [{ team_id: TEAM_A_ID, role: 'member' }],
        teams: [TEAMS[0]],
        allMembersWithNames: [{ team_id: TEAM_A_ID, employee_id: EMP_NONAME, role: 'member' }],
      });
      const result = await fetchUserTeamContext(factory, EMP_NONAME);
      assert.ok(result.teamLines.includes('Sales Team A (member)'));
      assert.ok(result.teamLines.includes(TEAM_A_ID));
    });

    it('handles team with empty members list after join', async () => {
      const factory = () =>
        mockSupabase({
          team_members: [
            { data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null },
            { data: [], error: null },
          ],
          teams: { data: [TEAMS[0]], error: null },
        });
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      assert.ok(result.teamLines.includes('Sales Team A (member)'));
      assert.ok(result.teamLines.includes('Members: '));
    });

    it('defaults to "member" role for unknown team ID', async () => {
      const factory = buildMockFactory({
        myMemberships: [{ team_id: TEAM_A_ID, role: 'member' }],
        teams: [{ id: 'unknown-id', name: 'Phantom Team' }],
        allMembersWithNames: [],
      });
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      assert.ok(result.teamLines.includes('Phantom Team (member)'));
    });
  });

  // ── Token budget ───────────────────────────────────────────────────────

  describe('token budget', () => {
    it('single-team output stays under 1200 chars', async () => {
      const factory = buildMockFactory({
        myMemberships: [{ team_id: TEAM_A_ID, role: 'manager' }],
        teams: [TEAMS[0]],
        allMembersWithNames: ALL_TEAM_MEMBERS.filter((m) => m.team_id === TEAM_A_ID),
      });
      const result = await fetchUserTeamContext(factory, EMP_MIKE);
      const total = result.teamLines.length + result.teamPronounRules.length;
      assert.ok(total < 1200, `Single-team: ${total} chars, expected < 1200`);
    });

    it('dual-team output stays under 1800 chars', async () => {
      const factory = buildMockFactory({
        myMemberships: [
          { team_id: TEAM_A_ID, role: 'director' },
          { team_id: TEAM_B_ID, role: 'director' },
        ],
        teams: TEAMS,
        allMembersWithNames: ALL_TEAM_MEMBERS,
      });
      const result = await fetchUserTeamContext(factory, EMP_SARAH);
      const total = result.teamLines.length + result.teamPronounRules.length;
      assert.ok(total < 1800, `Dual-team: ${total} chars, expected < 1800`);
    });

    it('20-member team stays under 2000 chars', async () => {
      const largeTeamId = 'cc000001-0000-0000-0000-000000000001';
      const largeMembers = [];
      const names = {};
      for (let i = 1; i <= 20; i++) {
        const id = `ee${i.toString().padStart(6, '0')}-0000-0000-0000-000000000001`;
        largeMembers.push({ team_id: largeTeamId, employee_id: id, role: 'member' });
        names[id] = { first_name: `Rep${i}`, last_name: `Person${i}` };
      }
      const membersWithEmp = largeMembers.map((m) => ({
        team_id: m.team_id,
        employee_id: m.employee_id,
        employees: names[m.employee_id],
      }));
      const sb = mockSupabase({
        team_members: [
          { data: [{ team_id: largeTeamId, role: 'member' }], error: null },
          { data: membersWithEmp, error: null },
        ],
        teams: { data: [{ id: largeTeamId, name: 'Enterprise Sales' }], error: null },
      });
      const result = await fetchUserTeamContext(() => sb, largeMembers[0].employee_id);
      assert.ok(result.teamLines.includes('Rep1 Person1'));
      assert.ok(result.teamLines.includes('Rep20 Person20'));
      const total = result.teamLines.length + result.teamPronounRules.length;
      assert.ok(total < 2000, `20-member: ${total} chars, expected < 2000`);
    });
  });

  // ── Output format ──────────────────────────────────────────────────────

  describe('output format', () => {
    it('teamLines follows Team/Members/Team ID structure', async () => {
      const factory = buildMockFactory({
        myMemberships: [{ team_id: TEAM_A_ID, role: 'member' }],
        teams: [TEAMS[0]],
        allMembersWithNames: ALL_TEAM_MEMBERS.filter((m) => m.team_id === TEAM_A_ID),
      });
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      const lines = result.teamLines.split('\n');
      assert.match(lines[0], /^- Team: .+ \(\w+\)$/);
      assert.match(lines[1], /^\s+Members: .+/);
      assert.match(lines[2], /^\s+Team ID: [0-9a-f-]+$/);
    });

    it('pronoun rules reference assigned_to_team for team queries', async () => {
      const factory = buildMockFactory({
        myMemberships: [{ team_id: TEAM_A_ID, role: 'member' }],
        teams: [TEAMS[0]],
        allMembersWithNames: ALL_TEAM_MEMBERS.filter((m) => m.team_id === TEAM_A_ID),
      });
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      const teamRules = result.teamPronounRules
        .split('\n')
        .filter((l) => l.includes('team') || l.includes('Team'));
      for (const line of teamRules) {
        if (line.includes('[person name]') || line.includes('same assigned_to_team')) continue;
        if (line.includes('my team') || line.includes('Team')) {
          assert.ok(line.includes('assigned_to_team'), `Missing assigned_to_team in: "${line}"`);
        }
      }
    });
  });

  // ── Identity block integration (mirrors ai.js template) ────────────────

  describe('identity block integration', () => {
    it('renders full block with team context for single-team user', async () => {
      const factory = buildMockFactory({
        myMemberships: [{ team_id: TEAM_A_ID, role: 'manager' }],
        teams: [TEAMS[0]],
        allMembersWithNames: ALL_TEAM_MEMBERS.filter((m) => m.team_id === TEAM_A_ID),
      });
      const { teamLines, teamPronounRules } = await fetchUserTeamContext(factory, EMP_MIKE);
      const block = renderIdentityBlock({
        userName: 'Mike ManagerA',
        userEmail: 'mike@test.com',
        userId: EMP_MIKE,
        userRole: 'manager',
        teamLines,
        teamPronounRules,
      });

      // Core fields preserved
      assert.ok(block.includes('Name: Mike ManagerA'));
      assert.ok(block.includes('Email: mike@test.com'));
      assert.ok(block.includes(`User ID: ${EMP_MIKE}`));
      assert.ok(block.includes('Role: manager'));
      // Team injected
      assert.ok(block.includes('Sales Team A (manager)'));
      assert.ok(block.includes(`assigned_to_team="${TEAM_A_ID}"`));
      // Old fallback NOT present
      assert.ok(!block.includes('visibility scoping handles team filtering'));
    });

    it('renders block WITHOUT team context when user has no teams', async () => {
      const factory = () => mockSupabase({ team_members: { data: [], error: null } });
      const { teamLines, teamPronounRules } = await fetchUserTeamContext(factory, EMP_NOTEAM);
      const block = renderIdentityBlock({
        userName: 'Solo User',
        userEmail: 'solo@test.com',
        userId: EMP_NOTEAM,
        userRole: 'employee',
        teamLines,
        teamPronounRules,
      });

      assert.ok(block.includes('Name: Solo User'));
      assert.ok(!block.includes('Team:'));
      assert.ok(!block.includes('Members:'));
      // Fallback pronoun rule IS present
      assert.ok(block.includes('visibility scoping handles team filtering'));
    });

    it('renders empty string when no userName and no userEmail', () => {
      const block = renderIdentityBlock({
        userName: null,
        userEmail: null,
        userId: EMP_TOM,
        userRole: 'employee',
        teamLines: 'data',
        teamPronounRules: 'rules',
      });
      assert.equal(block, '');
    });

    it('renders multi-team director block with ambiguity hint', async () => {
      const factory = buildMockFactory({
        myMemberships: [
          { team_id: TEAM_A_ID, role: 'director' },
          { team_id: TEAM_B_ID, role: 'director' },
        ],
        teams: TEAMS,
        allMembersWithNames: ALL_TEAM_MEMBERS,
      });
      const { teamLines, teamPronounRules } = await fetchUserTeamContext(factory, EMP_SARAH);
      const block = renderIdentityBlock({
        userName: 'Sarah Director',
        userEmail: 'sarah@test.com',
        userId: EMP_SARAH,
        userRole: 'admin',
        teamLines,
        teamPronounRules,
      });

      assert.ok(block.includes('Sales Team A (director)'));
      assert.ok(block.includes('Sales Team B (director)'));
      assert.ok(block.includes(`assigned_to_team="${TEAM_A_ID}"`));
      assert.ok(block.includes(`assigned_to_team="${TEAM_B_ID}"`));
      assert.ok(block.includes('ask which team'));
      assert.ok(!block.includes('visibility scoping handles team filtering'));
    });
  });

  // ── Factory contract ───────────────────────────────────────────────────

  describe('Supabase factory contract', () => {
    it('calls getSupabaseClient exactly once', async () => {
      let callCount = 0;
      const sb = mockSupabase({
        team_members: [
          { data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null },
          { data: [], error: null },
        ],
        teams: { data: [TEAMS[0]], error: null },
      });
      const factory = () => {
        callCount++;
        return sb;
      };
      await fetchUserTeamContext(factory, EMP_TOM);
      assert.equal(callCount, 1, 'factory should be called exactly once');
    });
  });

  // ── Duplicate member handling ──────────────────────────────────────────

  describe('duplicate handling', () => {
    it('includes duplicate names if join returns them', async () => {
      const dupeMembers = [
        {
          team_id: TEAM_A_ID,
          employee_id: EMP_TOM,
          employees: { first_name: 'Tom', last_name: 'RepA1' },
        },
        {
          team_id: TEAM_A_ID,
          employee_id: EMP_TOM,
          employees: { first_name: 'Tom', last_name: 'RepA1' },
        },
      ];
      const sb = mockSupabase({
        team_members: [
          { data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null },
          { data: dupeMembers, error: null },
        ],
        teams: { data: [TEAMS[0]], error: null },
      });
      const result = await fetchUserTeamContext(() => sb, EMP_TOM);
      const membersLine = result.teamLines.split('\n').find((l) => l.includes('Members:'));
      const matches = membersLine.match(/Tom RepA1/g);
      assert.equal(matches.length, 2, 'duplicate names should both appear');
    });
  });

  // ── Mixed role across teams ────────────────────────────────────────────

  describe('mixed roles across teams', () => {
    it('shows different roles per team (member on A, director on B)', async () => {
      const factory = buildMockFactory({
        myMemberships: [
          { team_id: TEAM_A_ID, role: 'member' },
          { team_id: TEAM_B_ID, role: 'director' },
        ],
        teams: TEAMS,
        allMembersWithNames: ALL_TEAM_MEMBERS,
      });
      const result = await fetchUserTeamContext(factory, EMP_SARAH);
      assert.ok(result.teamLines.includes('Sales Team A (member)'));
      assert.ok(result.teamLines.includes('Sales Team B (director)'));
    });

    it('generates pronoun rules for both teams regardless of role difference', async () => {
      const factory = buildMockFactory({
        myMemberships: [
          { team_id: TEAM_A_ID, role: 'member' },
          { team_id: TEAM_B_ID, role: 'director' },
        ],
        teams: TEAMS,
        allMembersWithNames: ALL_TEAM_MEMBERS,
      });
      const result = await fetchUserTeamContext(factory, EMP_SARAH);
      assert.ok(result.teamPronounRules.includes(`assigned_to_team="${TEAM_A_ID}"`));
      assert.ok(result.teamPronounRules.includes(`assigned_to_team="${TEAM_B_ID}"`));
    });
  });

  // ── Team names with special characters ─────────────────────────────────

  describe('special characters in team names', () => {
    it('handles apostrophes in team name', async () => {
      const specialTeamId = 'dd000001-0000-0000-0000-000000000001';
      const factory = () => {
        const sb = mockSupabase({
          team_members: [
            { data: [{ team_id: specialTeamId, role: 'member' }], error: null },
            { data: [], error: null },
          ],
          teams: { data: [{ id: specialTeamId, name: "Dre's Sales Team" }], error: null },
        });
        return sb;
      };
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      assert.ok(result.teamLines.includes("Dre's Sales Team (member)"));
      assert.ok(result.teamPronounRules.includes("Dre's Sales Team leads"));
    });

    it('handles unicode in team name', async () => {
      const specialTeamId = 'dd000001-0000-0000-0000-000000000002';
      const factory = () => {
        const sb = mockSupabase({
          team_members: [
            { data: [{ team_id: specialTeamId, role: 'member' }], error: null },
            { data: [], error: null },
          ],
          teams: {
            data: [{ id: specialTeamId, name: 'Ventas Espa\u00f1a \ud83c\uddea\ud83c\uddf8' }],
            error: null,
          },
        });
        return sb;
      };
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      assert.ok(result.teamLines.includes('Ventas Espa\u00f1a'));
    });

    it('handles quotes in team name without breaking template', async () => {
      const specialTeamId = 'dd000001-0000-0000-0000-000000000003';
      const factory = () => {
        const sb = mockSupabase({
          team_members: [
            { data: [{ team_id: specialTeamId, role: 'member' }], error: null },
            { data: [], error: null },
          ],
          teams: { data: [{ id: specialTeamId, name: 'Team "Alpha"' }], error: null },
        });
        return sb;
      };
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      // Should not produce malformed prompt — team name with quotes is valid
      assert.ok(result.teamLines.includes('Team "Alpha" (member)'));
      // Verify the pronoun rule doesn't break nesting
      assert.ok(result.teamPronounRules.includes('Team "Alpha" leads'));
    });
  });

  // ── Orphaned team_member (employee deleted but membership remains) ─────

  describe('orphaned team member records', () => {
    it('handles member with missing employees join data (null employees object)', async () => {
      const orphanedMembers = [
        { team_id: TEAM_A_ID, employee_id: 'deleted-emp-id', employees: null },
        {
          team_id: TEAM_A_ID,
          employee_id: EMP_TOM,
          employees: { first_name: 'Tom', last_name: 'RepA1' },
        },
      ];
      const sb = mockSupabase({
        team_members: [
          { data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null },
          { data: orphanedMembers, error: null },
        ],
        teams: { data: [TEAMS[0]], error: null },
      });
      const result = await fetchUserTeamContext(() => sb, EMP_TOM);
      // Should still include the valid member
      assert.ok(result.teamLines.includes('Tom RepA1'));
      // Should not crash on null employees
      assert.ok(result.teamLines.includes('Sales Team A'));
    });
  });

  // ── Order stability ────────────────────────────────────────────────────

  describe('output ordering', () => {
    it('teams appear in the order returned by the teams query', async () => {
      // Return Team B before Team A
      const reversedTeams = [TEAMS[1], TEAMS[0]];
      const factory = buildMockFactory({
        myMemberships: [
          { team_id: TEAM_A_ID, role: 'director' },
          { team_id: TEAM_B_ID, role: 'director' },
        ],
        teams: reversedTeams,
        allMembersWithNames: ALL_TEAM_MEMBERS,
      });
      const result = await fetchUserTeamContext(factory, EMP_SARAH);
      const teamBIdx = result.teamLines.indexOf('Sales Team B');
      const teamAIdx = result.teamLines.indexOf('Sales Team A');
      assert.ok(
        teamBIdx < teamAIdx,
        'Team B should appear before Team A when query returns B first',
      );
    });

    it('members within a team appear in query return order', async () => {
      // Return Amy before Tom
      const reorderedMembers = [
        {
          team_id: TEAM_A_ID,
          employee_id: EMP_AMY,
          employees: { first_name: 'Amy', last_name: 'RepA2' },
        },
        {
          team_id: TEAM_A_ID,
          employee_id: EMP_TOM,
          employees: { first_name: 'Tom', last_name: 'RepA1' },
        },
      ];
      const sb = mockSupabase({
        team_members: [
          { data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null },
          { data: reorderedMembers, error: null },
        ],
        teams: { data: [TEAMS[0]], error: null },
      });
      const result = await fetchUserTeamContext(() => sb, EMP_TOM);
      const membersLine = result.teamLines.split('\n').find((l) => l.includes('Members:'));
      const amyIdx = membersLine.indexOf('Amy RepA2');
      const tomIdx = membersLine.indexOf('Tom RepA1');
      assert.ok(amyIdx < tomIdx, 'Amy should appear before Tom when query returns Amy first');
    });
  });

  // ── Supabase query column verification ─────────────────────────────────

  describe('Supabase query columns', () => {
    it('first query selects team_id and role from team_members', async () => {
      let capturedSelects = [];
      const mockSb = {
        from: (table) => {
          const chain = {
            select: (cols) => {
              capturedSelects.push({ table, cols });
              return chain;
            },
            eq: () => chain,
            in: () => chain,
            then: (resolve) => resolve({ data: [], error: null }),
            catch: () => {},
          };
          return chain;
        },
      };
      await fetchUserTeamContext(() => mockSb, EMP_TOM);
      // First select should be on team_members for 'team_id, role'
      assert.ok(capturedSelects.length >= 1);
      assert.equal(capturedSelects[0].table, 'team_members');
      assert.ok(capturedSelects[0].cols.includes('team_id'));
      assert.ok(capturedSelects[0].cols.includes('role'));
    });

    it('teams query selects id and name', async () => {
      let capturedSelects = [];
      const mockSb = {
        from: (table) => {
          const chain = {
            select: (cols) => {
              capturedSelects.push({ table, cols });
              return chain;
            },
            eq: () => chain,
            in: () => chain,
            then: (resolve) => {
              if (table === 'team_members' && capturedSelects.length === 1) {
                return resolve({ data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null });
              }
              if (table === 'teams') {
                return resolve({ data: [TEAMS[0]], error: null });
              }
              return resolve({ data: [], error: null });
            },
            catch: () => {},
          };
          return chain;
        },
      };
      await fetchUserTeamContext(() => mockSb, EMP_TOM);
      const teamsSelect = capturedSelects.find((s) => s.table === 'teams');
      assert.ok(teamsSelect, 'should query teams table');
      assert.ok(teamsSelect.cols.includes('id'));
      assert.ok(teamsSelect.cols.includes('name'));
    });

    it('members query uses employees!inner join', async () => {
      let capturedSelects = [];
      let callCount = {};
      const mockSb = {
        from: (table) => {
          callCount[table] = (callCount[table] || 0) + 1;
          const chain = {
            select: (cols) => {
              capturedSelects.push({ table, cols, call: callCount[table] });
              return chain;
            },
            eq: () => chain,
            in: () => chain,
            then: (resolve) => {
              if (table === 'team_members' && callCount[table] === 1) {
                return resolve({ data: [{ team_id: TEAM_A_ID, role: 'member' }], error: null });
              }
              if (table === 'teams') {
                return resolve({ data: [TEAMS[0]], error: null });
              }
              return resolve({ data: [], error: null });
            },
            catch: () => {},
          };
          return chain;
        },
      };
      await fetchUserTeamContext(() => mockSb, EMP_TOM);
      // Second team_members call should use employees!inner join
      const secondTmSelect = capturedSelects.find(
        (s) => s.table === 'team_members' && s.call === 2,
      );
      assert.ok(secondTmSelect, 'should query team_members a second time for members');
      assert.ok(
        secondTmSelect.cols.includes('employees!inner'),
        `Expected employees!inner join in: "${secondTmSelect.cols}"`,
      );
    });
  });

  // ── Concurrent calls ───────────────────────────────────────────────────

  describe('concurrent calls', () => {
    it('handles simultaneous calls for different users without interference', async () => {
      const factoryMike = buildMockFactory({
        myMemberships: [{ team_id: TEAM_A_ID, role: 'manager' }],
        teams: [TEAMS[0]],
        allMembersWithNames: ALL_TEAM_MEMBERS.filter((m) => m.team_id === TEAM_A_ID),
      });
      const factorySarah = buildMockFactory({
        myMemberships: [
          { team_id: TEAM_A_ID, role: 'director' },
          { team_id: TEAM_B_ID, role: 'director' },
        ],
        teams: TEAMS,
        allMembersWithNames: ALL_TEAM_MEMBERS,
      });

      const [mikeResult, sarahResult] = await Promise.all([
        fetchUserTeamContext(factoryMike, EMP_MIKE),
        fetchUserTeamContext(factorySarah, EMP_SARAH),
      ]);

      // Mike: single team, manager
      assert.ok(mikeResult.teamLines.includes('Sales Team A (manager)'));
      assert.ok(!mikeResult.teamLines.includes('Sales Team B'));

      // Sarah: both teams, director
      assert.ok(sarahResult.teamLines.includes('Sales Team A (director)'));
      assert.ok(sarahResult.teamLines.includes('Sales Team B (director)'));
    });
  });

  // ── Return type contract ───────────────────────────────────────────────

  describe('return type contract', () => {
    it('always returns an object with teamLines and teamPronounRules as strings', async () => {
      const scenarios = [
        // Happy path
        buildMockFactory({
          myMemberships: [{ team_id: TEAM_A_ID, role: 'member' }],
          teams: [TEAMS[0]],
          allMembersWithNames: ALL_TEAM_MEMBERS.filter((m) => m.team_id === TEAM_A_ID),
        }),
        // No teams
        () => mockSupabase({ team_members: { data: [], error: null } }),
        // Error
        () => mockSupabase({ team_members: { data: null, error: { message: 'fail' } } }),
        // Exception
        () => {
          throw new Error('boom');
        },
      ];

      for (const factory of scenarios) {
        const result = await fetchUserTeamContext(factory, EMP_TOM);
        assert.equal(typeof result, 'object', 'should return object');
        assert.equal(typeof result.teamLines, 'string', 'teamLines should be string');
        assert.equal(typeof result.teamPronounRules, 'string', 'teamPronounRules should be string');
      }
    });

    it('never returns undefined or null for either field', async () => {
      const factory = () => {
        throw new Error('total failure');
      };
      const result = await fetchUserTeamContext(factory, EMP_TOM);
      assert.notEqual(result.teamLines, undefined);
      assert.notEqual(result.teamLines, null);
      assert.notEqual(result.teamPronounRules, undefined);
      assert.notEqual(result.teamPronounRules, null);
    });
  });
});
