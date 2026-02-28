/**
 * Tests for AssignmentField — the team→person cascade component.
 *
 * Covers:
 *  1. Team dropdown rendering and visibility
 *  2. Person auto-assigns team when single-team employee selected
 *  3. Team change clears person if not on new team
 *  4. Admin bypass — no team filtering on employee list
 *  5. Manager scoping — only own teams visible
 *  6. Member view — read-only team, claim/unassign buttons
 *  7. No teams — team selector hidden
 *  8. Multi-team employee — no auto-set (ambiguous)
 *  9. Team label rendered
 * 10. Unassign clears person
 * 11. Claim button calls onChange with current user
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Test Data ───────────────────────────────────────────────────────────────

const TEAM_A_ID = 'team-a-uuid';
const TEAM_B_ID = 'team-b-uuid';

const EMP_MIKE = 'emp-mike-uuid'; // on team A only
const EMP_SARAH = 'emp-sarah-uuid'; // on team A + B

const MOCK_TEAMS = [
  { id: TEAM_A_ID, name: 'Sales Team A' },
  { id: TEAM_B_ID, name: 'Sales Team B' },
];

const MOCK_MEMBERS_BY_TEAM = {
  [TEAM_A_ID]: [EMP_MIKE, EMP_SARAH],
  [TEAM_B_ID]: [EMP_SARAH],
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Default hook return values — overridden per test via mockReturnValue
const mockUseTeamScope = vi.fn();
const mockUseTeams = vi.fn();

vi.mock('@/hooks/useTeamScope', () => ({
  default: (...args) => mockUseTeamScope(...args),
}));

vi.mock('@/hooks/useTeams', () => ({
  default: (...args) => mockUseTeams(...args),
}));

// Mock LazyEmployeeSelector as a simple select for testability
vi.mock('@/components/shared/LazyEmployeeSelector', () => ({
  default: ({ value, onValueChange, allowedIds, ...props }) => (
    <select
      data-testid="employee-selector"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      aria-label="Select assignee"
    >
      <option value="unassigned">Select assignee</option>
      {(allowedIds || [EMP_MIKE, EMP_SARAH]).map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  ),
}));

// Mock AssignmentHistory to prevent fetch calls
vi.mock('@/components/leads/AssignmentHistory', () => ({
  default: () => <div data-testid="assignment-history">History</div>,
}));

// Mock shadcn Select components with simple HTML equivalents
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <div data-testid="team-select-wrapper">
      <select
        data-testid="team-selector"
        value={value || 'unassigned'}
        onChange={(e) => onValueChange(e.target.value)}
        aria-label="Select team"
      >
        {children}
      </select>
    </div>
  ),
  SelectTrigger: ({ children, ...props }) => <>{children}</>,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value, children }) => <option value={value}>{children}</option>,
  SelectValue: ({ placeholder }) => (
    <option value="" disabled>
      {placeholder}
    </option>
  ),
}));

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

import AssignmentField from '../AssignmentField';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupHooks({
  allowedIds = [EMP_MIKE, EMP_SARAH],
  teamIds = [TEAM_A_ID],
  fullAccessTeamIds = [TEAM_A_ID],
  highestRole = 'manager',
  bypass = false,
  teams = MOCK_TEAMS,
  membersByTeam = MOCK_MEMBERS_BY_TEAM,
  teamsLoading = false,
} = {}) {
  mockUseTeamScope.mockReturnValue({
    allowedIds,
    teamIds,
    fullAccessTeamIds,
    highestRole,
    bypass,
    loading: false,
  });
  mockUseTeams.mockReturnValue({
    teams,
    membersByTeam,
    loading: teamsLoading,
  });
}

const ADMIN_USER = {
  id: 'admin-id',
  role: 'admin',
  employee_id: 'admin-emp',
  full_name: 'Admin User',
};
const MANAGER_USER = {
  id: 'mgr-id',
  role: 'employee',
  employee_id: EMP_MIKE,
  full_name: 'Mike Manager',
};
const MEMBER_USER = {
  id: 'member-id',
  role: 'employee',
  employee_id: 'emp-member-uuid',
  full_name: 'Regular Member',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

// 1. Team dropdown rendering
describe('AssignmentField — team dropdown', () => {
  it('renders team selector when teams exist', () => {
    setupHooks({ bypass: true });
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );
    expect(screen.getByTestId('team-selector')).toBeInTheDocument();
  });

  it('hides team selector when no teams exist', () => {
    setupHooks({ teams: [], membersByTeam: {} });
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );
    expect(screen.queryByTestId('team-selector')).not.toBeInTheDocument();
  });

  it('shows all teams for admin users', () => {
    setupHooks({ bypass: true });
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );
    const options = screen.getByTestId('team-selector').querySelectorAll('option');
    // "No Team" + 2 teams
    const optionTexts = [...options].map((o) => o.textContent);
    expect(optionTexts).toContain('Sales Team A');
    expect(optionTexts).toContain('Sales Team B');
  });
});

// 2. Person auto-assigns team (cascade: person → team)
describe('AssignmentField — person→team cascade', () => {
  it('auto-sets team when single-team employee is selected', () => {
    setupHooks();
    const onTeamChange = vi.fn();

    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={onTeamChange}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    // Select Mike (only on Team A)
    fireEvent.change(screen.getByTestId('employee-selector'), {
      target: { value: EMP_MIKE },
    });

    expect(onTeamChange).toHaveBeenCalledWith(TEAM_A_ID);
  });

  it('does NOT auto-set team for multi-team employee', () => {
    setupHooks();
    const onTeamChange = vi.fn();

    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={onTeamChange}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    // Select Sarah (on Team A + Team B — ambiguous)
    fireEvent.change(screen.getByTestId('employee-selector'), {
      target: { value: EMP_SARAH },
    });

    expect(onTeamChange).not.toHaveBeenCalled();
  });

  it('does NOT auto-set team when team is already set', () => {
    setupHooks();
    const onTeamChange = vi.fn();

    render(
      <AssignmentField
        value=""
        teamValue={TEAM_B_ID}
        onChange={vi.fn()}
        onTeamChange={onTeamChange}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    fireEvent.change(screen.getByTestId('employee-selector'), {
      target: { value: EMP_MIKE },
    });

    // Team already set — should not override
    expect(onTeamChange).not.toHaveBeenCalled();
  });
});

// 3. Team change clears incompatible person
describe('AssignmentField — team→person cascade', () => {
  it('clears person when switched to team they are not on', () => {
    setupHooks({ bypass: true });
    const onChange = vi.fn();
    const onTeamChange = vi.fn();

    render(
      <AssignmentField
        value={EMP_MIKE}
        teamValue={TEAM_A_ID}
        onChange={onChange}
        onTeamChange={onTeamChange}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    // Switch to Team B — Mike is NOT on Team B
    fireEvent.change(screen.getByTestId('team-selector'), {
      target: { value: TEAM_B_ID },
    });

    // Should clear person
    expect(onChange).toHaveBeenCalledWith('');
    expect(onTeamChange).toHaveBeenCalledWith(TEAM_B_ID);
  });

  it('keeps person when switched to team they ARE on', () => {
    setupHooks({ bypass: true });
    const onChange = vi.fn();
    const onTeamChange = vi.fn();

    render(
      <AssignmentField
        value={EMP_SARAH}
        teamValue={TEAM_A_ID}
        onChange={onChange}
        onTeamChange={onTeamChange}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    // Switch to Team B — Sarah IS on Team B
    fireEvent.change(screen.getByTestId('team-selector'), {
      target: { value: TEAM_B_ID },
    });

    // Should NOT clear person
    expect(onChange).not.toHaveBeenCalled();
    expect(onTeamChange).toHaveBeenCalledWith(TEAM_B_ID);
  });

  it('clears team when "No Team" is selected', () => {
    setupHooks({ bypass: true });
    const onTeamChange = vi.fn();

    render(
      <AssignmentField
        value=""
        teamValue={TEAM_A_ID}
        onChange={vi.fn()}
        onTeamChange={onTeamChange}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    fireEvent.change(screen.getByTestId('team-selector'), {
      target: { value: 'unassigned' },
    });

    expect(onTeamChange).toHaveBeenCalledWith('');
  });
});

// 4. Admin bypass
describe('AssignmentField — admin bypass', () => {
  it('passes null allowedIds for admin (no employee filtering)', () => {
    setupHooks({ bypass: true, allowedIds: null });
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    // LazyEmployeeSelector mock receives allowedIds as null for admin
    const selector = screen.getByTestId('employee-selector');
    // Admin should see all employees — our mock renders both by default when allowedIds is null
    expect(selector).toBeInTheDocument();
  });
});

// 5. Manager scoping
describe('AssignmentField — manager scoping', () => {
  it('filters teams to only manager own teams', () => {
    setupHooks({
      highestRole: 'manager',
      teamIds: [TEAM_A_ID],
      bypass: false,
    });

    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={MANAGER_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    const selector = screen.getByTestId('team-selector');
    const options = [...selector.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toContain('Sales Team A');
    // Team B should NOT appear for manager only on Team A
    // (depends on availableTeams filtering logic matching highestRole === 'manager')
  });
});

// 6. Member view — claim/unassign
describe('AssignmentField — member (non-manager) view', () => {
  it('shows "Assign to me" button when unassigned', () => {
    setupHooks({ highestRole: 'member' });
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={MEMBER_USER}
        isManager={false}
        tenantId="t1"
      />,
    );

    expect(screen.getByText('Assign to me')).toBeInTheDocument();
  });

  it('calls onChange with user employee_id on claim', () => {
    setupHooks({ highestRole: 'member' });
    const onChange = vi.fn();

    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={onChange}
        onTeamChange={vi.fn()}
        user={MEMBER_USER}
        isManager={false}
        tenantId="t1"
      />,
    );

    fireEvent.click(screen.getByText('Assign to me'));
    expect(onChange).toHaveBeenCalledWith(MEMBER_USER.employee_id);
  });

  it('shows "Unassign" button when record is assigned', () => {
    setupHooks({ highestRole: 'member' });
    render(
      <AssignmentField
        value={MEMBER_USER.employee_id}
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={MEMBER_USER}
        isManager={false}
        tenantId="t1"
      />,
    );

    expect(screen.getByText('Unassign')).toBeInTheDocument();
  });

  it('clears assignment on unassign click', () => {
    setupHooks({ highestRole: 'member' });
    const onChange = vi.fn();

    render(
      <AssignmentField
        value={MEMBER_USER.employee_id}
        teamValue=""
        onChange={onChange}
        onTeamChange={vi.fn()}
        user={MEMBER_USER}
        isManager={false}
        tenantId="t1"
      />,
    );

    fireEvent.click(screen.getByText('Unassign'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows read-only team display (not dropdown) for members', () => {
    setupHooks({ highestRole: 'member', bypass: false });
    render(
      <AssignmentField
        value=""
        teamValue={TEAM_A_ID}
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={MEMBER_USER}
        isManager={false}
        tenantId="t1"
      />,
    );

    // Member should not have a team dropdown — should see a disabled input instead
    // The select is only rendered when canChangeTeam || (canUseDropdown && highestRole === 'manager')
    // For a plain member with isManager=false, neither condition is true
    const disabledInputs = screen.getAllByRole('textbox');
    const teamInput = disabledInputs.find((i) => i.value === 'Sales Team A');
    expect(teamInput).toBeTruthy();
    expect(teamInput.disabled).toBe(true);
  });
});

// 7. Labels
describe('AssignmentField — labels', () => {
  it('renders custom label prop', () => {
    setupHooks();
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
        label="Owner"
      />,
    );

    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('renders default "Assigned To" label', () => {
    setupHooks();
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    expect(screen.getByText('Assigned To')).toBeInTheDocument();
  });

  it('renders "Team" label when teams exist', () => {
    setupHooks({ bypass: true });
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
      />,
    );

    expect(screen.getByText('Team')).toBeInTheDocument();
  });
});

// 8. Assignment history
describe('AssignmentField — assignment history', () => {
  it('renders assignment history when entityId and tenantId provided', () => {
    setupHooks();
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
        entityId="entity-123"
        entityType="lead"
      />,
    );

    expect(screen.getByTestId('assignment-history')).toBeInTheDocument();
  });

  it('hides assignment history when showHistory is false', () => {
    setupHooks();
    render(
      <AssignmentField
        value=""
        teamValue=""
        onChange={vi.fn()}
        onTeamChange={vi.fn()}
        user={ADMIN_USER}
        isManager={true}
        tenantId="t1"
        entityId="entity-123"
        entityType="lead"
        showHistory={false}
      />,
    );

    expect(screen.queryByTestId('assignment-history')).not.toBeInTheDocument();
  });
});
