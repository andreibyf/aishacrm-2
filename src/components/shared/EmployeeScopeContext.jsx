/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Employee } from '@/api/entities';
import { useTenant } from './tenantContext';
import { useUser } from './useUser';
import { getBackendUrl } from '@/api/backendUrl';

const EmployeeScopeContext = createContext(null);

export const EmployeeScopeProvider = ({ children }) => {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [selectedTeamId, setSelectedTeamIdState] = useState(null);
  const { user: currentUser } = useUser(); // Use centralized user context
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const employeesFetchedRef = useRef(null); // tracks tenant_id for which we fetched
  const { selectedTenantId } = useTenant();

  // Team data
  const [teams, setTeams] = useState([]); // [{ id, name, parent_team_id }]
  const [membersByTeam, setMembersByTeam] = useState({}); // { teamId: [employeeId, ...] }
  const [teamsLoading, setTeamsLoading] = useState(false);
  const teamsFetchedRef = useRef(null);
  const [visibilityMode, setVisibilityMode] = useState('hierarchical'); // 'shared' | 'hierarchical'

  useEffect(() => {
    try {
      const saved = localStorage.getItem('employee_scope_filter');
      if (saved && saved !== 'null' && saved !== 'undefined') {
        setSelectedEmployeeId(saved);
      }
      const savedTeam = localStorage.getItem('team_scope_filter');
      if (savedTeam && savedTeam !== 'null' && savedTeam !== 'undefined') {
        setSelectedTeamIdState(savedTeam);
      }
    } catch (error) {
      console.warn('Failed to load scope filters:', error);
    }
  }, []);

  // Centralized employees fetch - only load once per tenant
  // Using ref to track employees for the callback to avoid recreating on each employee change
  const employeesRef = useRef([]);
  employeesRef.current = employees;

  const loadEmployees = useCallback(async (tenantId, force = false) => {
    if (!tenantId) return [];
    // Skip if already fetched for this tenant (unless forced)
    if (!force && employeesFetchedRef.current === tenantId && employeesRef.current.length > 0) {
      return employeesRef.current;
    }
    setEmployeesLoading(true);
    try {
      const list = await Employee.list({ tenant_id: tenantId });
      const activeEmployees = (list || []).filter(
        (e) => e.is_active !== false && e.status !== 'inactive',
      );
      setEmployees(activeEmployees);
      employeesFetchedRef.current = tenantId;
      return activeEmployees;
    } catch (err) {
      console.error('[EmployeeScopeContext] Failed to load employees:', err);
      return [];
    } finally {
      setEmployeesLoading(false);
    }
  }, []); // No dependencies - uses refs for stable callback

  // Auto-load employees when tenant changes
  useEffect(() => {
    const tenantId = selectedTenantId || currentUser?.tenant_id;
    if (tenantId && employeesFetchedRef.current !== tenantId) {
      loadEmployees(tenantId);
    }
  }, [selectedTenantId, currentUser?.tenant_id, loadEmployees]);

  // Fetch teams with members for the scope dropdown
  const teamsRef = useRef([]);
  teamsRef.current = teams;

  const loadTeams = useCallback(async (tenantId, force = false) => {
    if (!tenantId) return;
    if (!force && teamsFetchedRef.current === tenantId && teamsRef.current.length > 0) return;
    setTeamsLoading(true);
    try {
      const BACKEND_URL = getBackendUrl();
      // Fetch teams + members and team settings (visibility mode) in parallel
      const [teamsRes, settingsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/v2/leads/teams-with-members?tenant_id=${tenantId}`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        }),
        fetch(`${BACKEND_URL}/api/v2/teams/settings?tenant_id=${tenantId}`, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        }).catch(() => null), // non-critical
      ]);
      if (teamsRes.ok) {
        const json = await teamsRes.json();
        const data = json.data || {};
        setTeams(data.teams || []);
        setMembersByTeam(data.membersByTeam || {});
        teamsFetchedRef.current = tenantId;
      } else {
        console.warn('[EmployeeScopeContext] teams-with-members returned', teamsRes.status);
      }
      if (settingsRes?.ok) {
        const sJson = await settingsRes.json();
        setVisibilityMode(sJson.data?.visibility_mode || 'hierarchical');
      }
    } catch (err) {
      console.error('[EmployeeScopeContext] Failed to load teams:', err);
    } finally {
      setTeamsLoading(false);
    }
  }, []); // No dependencies - uses refs for stable callback

  // Auto-load teams when tenant changes
  useEffect(() => {
    const tenantId = selectedTenantId || currentUser?.tenant_id;
    if (tenantId && teamsFetchedRef.current !== tenantId) {
      loadTeams(tenantId);
    }
  }, [selectedTenantId, currentUser?.tenant_id, loadTeams]);

  // Clear stale scope selections when superadmin switches tenants
  const prevTenantRef = useRef(null);
  useEffect(() => {
    const tenantId = selectedTenantId || currentUser?.tenant_id;
    if (!tenantId) return;
    if (prevTenantRef.current && prevTenantRef.current !== tenantId) {
      // Tenant changed — reset scope selections (team/employee from old tenant are invalid)
      setSelectedEmployeeId(null);
      setSelectedTeamIdState(null);
      try {
        localStorage.removeItem('employee_scope_filter');
        localStorage.removeItem('team_scope_filter');
      } catch {
        /* ignore */
      }
    }
    prevTenantRef.current = tenantId;
  }, [selectedTenantId, currentUser?.tenant_id]);

  const setEmployeeScope = (id) => {
    setSelectedEmployeeId(id);
    try {
      if (id) {
        localStorage.setItem('employee_scope_filter', id);
      } else {
        localStorage.removeItem('employee_scope_filter');
      }
    } catch (error) {
      console.warn('Failed to save employee scope filter:', error);
    }
  };

  const setTeamScope = (teamId) => {
    setSelectedTeamIdState(teamId);
    // When selecting a team, clear individual employee selection
    if (teamId) {
      setSelectedEmployeeId(null);
      try {
        localStorage.removeItem('employee_scope_filter');
      } catch {
        /* ignore */
      }
    }
    try {
      if (teamId) {
        localStorage.setItem('team_scope_filter', teamId);
      } else {
        localStorage.removeItem('team_scope_filter');
      }
    } catch (error) {
      console.warn('Failed to save team scope filter:', error);
    }
  };

  const clearEmployeeScope = () => {
    setSelectedEmployeeId(null);
    try {
      localStorage.removeItem('employee_scope_filter');
    } catch (error) {
      console.warn('Failed to clear employee scope filter:', error);
    }
  };

  const clearTeamScope = () => {
    setSelectedTeamIdState(null);
    try {
      localStorage.removeItem('team_scope_filter');
    } catch (error) {
      console.warn('Failed to clear team scope filter:', error);
    }
  };

  const clearAllScopes = () => {
    clearEmployeeScope();
    clearTeamScope();
  };

  // Helper: determine if user can view all records
  const canViewAllRecords = () => {
    const u = currentUser;
    if (!u) return false;
    if (u.role === 'superadmin' || u.role === 'admin') return true;
    if (u.employee_role === 'manager') return true;
    if (u.role === 'power-user') return true;
    return false;
  };

  // Helper: determine employee-type
  const isEmployee = () => {
    const u = currentUser;
    return !!u && u.employee_role === 'employee' && u.role !== 'admin' && u.role !== 'superadmin';
  };

  // Employees in the selected team (for display and filtering)
  const teamEmployees = useMemo(() => {
    if (!selectedTeamId || !membersByTeam[selectedTeamId]) return [];
    const memberIds = membersByTeam[selectedTeamId] || [];
    return (employees || []).filter((e) => memberIds.includes(e.id));
  }, [selectedTeamId, membersByTeam, employees]);

  // Employees visible to the current user based on team role hierarchy + visibility mode.
  // Used by per-page Assigned To filter dropdowns so users only see
  // employees they have visibility over.
  const visibleEmployees = useMemo(() => {
    const u = currentUser;
    if (!u || !employees?.length) return [];

    // Admin/superadmin: see all employees
    if (u.role === 'admin' || u.role === 'superadmin') return employees;

    // Find the current user's employee ID
    const myEmpId =
      u.employee_id || employees.find((e) => e.email === u.email || e.user_email === u.email)?.id;

    if (!myEmpId) return [];

    // Shared mode: everyone sees ALL employees (org-wide read access)
    if (visibilityMode === 'shared') return employees;

    // Hierarchical mode: only see employees from your own team(s)
    // For directors, also include child teams (parent_team_id matches own teams)
    const myTeamIds = new Set();
    for (const teamId of Object.keys(membersByTeam)) {
      const memberIds = membersByTeam[teamId] || [];
      if (memberIds.includes(myEmpId)) {
        myTeamIds.add(teamId);
      }
    }

    // Directors: also include child teams (teams whose parent_team_id is one of our teams)
    if (u.employee_role === 'director' && teams.length > 0) {
      for (const team of teams) {
        if (team.parent_team_id && myTeamIds.has(team.parent_team_id)) {
          myTeamIds.add(team.id);
        }
      }
    }

    const visibleIds = new Set();
    for (const teamId of myTeamIds) {
      const memberIds = membersByTeam[teamId] || [];
      memberIds.forEach((id) => visibleIds.add(id));
    }
    visibleIds.add(myEmpId);
    return employees.filter((e) => visibleIds.has(e.id));
  }, [currentUser, employees, membersByTeam, visibilityMode, teams]);

  // Helper: build a filter applying employee scope
  const getFilter = (baseFilter = {}) => {
    const u = currentUser;
    // If no user yet, return base filter
    if (!u) return { ...baseFilter };

    // If a specific employee ID was selected, scope to that
    if (selectedEmployeeId && selectedEmployeeId !== 'unassigned') {
      return {
        ...baseFilter,
        $or: [{ created_by: selectedEmployeeId }, { assigned_to: selectedEmployeeId }],
      };
    }

    // Unassigned selection: show items without an assignee
    if (selectedEmployeeId === 'unassigned') {
      return { ...baseFilter, assigned_to: null };
    }

    // Team selection: scope to team member employee IDs
    if (selectedTeamId === '__unassigned__') {
      return { ...baseFilter, assigned_to: null };
    }
    if (selectedTeamId && membersByTeam[selectedTeamId]) {
      const memberIds = membersByTeam[selectedTeamId];
      if (memberIds.length > 0) {
        return {
          ...baseFilter,
          assigned_to: { $in: memberIds },
        };
      }
    }

    // If user can view all, do not restrict further
    if (canViewAllRecords()) return { ...baseFilter };

    // Default: restrict to current user's created/assigned
    return {
      ...baseFilter,
      $or: [{ created_by: u.email }, { assigned_to: u.email }],
    };
  };

  return (
    <EmployeeScopeContext.Provider
      value={{
        // current value
        selectedEmployeeId,
        selectedTeamId,
        // backward-compat aliases
        selectedEmail: selectedEmployeeId,
        setSelectedEmployeeId: setEmployeeScope,
        // explicit API
        setEmployeeScope,
        setTeamScope,
        clearEmployeeScope,
        clearTeamScope,
        clearAllScopes,
        // helpers
        canViewAllRecords,
        isEmployee,
        getFilter,
        // centralized employees (avoid redundant fetches)
        employees,
        visibleEmployees,
        employeesLoading,
        loadEmployees,
        // team data
        teams,
        teamsLoading,
        membersByTeam,
        teamEmployees,
        loadTeams,
        visibilityMode,
      }}
    >
      {children}
    </EmployeeScopeContext.Provider>
  );
};

export const useEmployeeScope = () => {
  const context = useContext(EmployeeScopeContext);
  if (!context) {
    return {
      selectedEmployeeId: null,
      selectedTeamId: null,
      selectedEmail: null,
      setSelectedEmployeeId: () => {},
      setEmployeeScope: () => {},
      setTeamScope: () => {},
      clearEmployeeScope: () => {},
      clearTeamScope: () => {},
      clearAllScopes: () => {},
      canViewAllRecords: () => false,
      isEmployee: () => false,
      getFilter: (f = {}) => ({ ...f }),
      employees: [],
      visibleEmployees: [],
      employeesLoading: false,
      loadEmployees: async () => [],
      teams: [],
      teamsLoading: false,
      membersByTeam: {},
      teamEmployees: [],
      loadTeams: async () => {},
      visibilityMode: 'hierarchical',
    };
  }
  return context;
};
