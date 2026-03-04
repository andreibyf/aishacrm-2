import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Building2 } from 'lucide-react';
import { useEmployeeScope } from './EmployeeScopeContext';

/**
 * EmployeeScopeFilter — Header dropdown for scoping CRM data by team.
 *
 * Individual employee filtering is handled at the record level
 * via the Assigned To filter on each entity page.
 *
 * Values:
 *   "all"          → tenant-wide (no team filter)
 *   "team:<uuid>"  → filter to a specific team's members
 */
export default function EmployeeScopeFilter({ user, selectedTenantId: _selectedTenantId }) {
  const {
    selectedTeamId,
    setTeamScope,
    teams,
    membersByTeam,
    teamsLoading: loadingTeams,
  } = useEmployeeScope();

  // Determine if user should see this filter
  const isManager = user?.employee_role === 'manager';
  const isDirector = user?.employee_role === 'director';
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const hasAggregatedScope = user?.permissions?.dashboard_scope === 'aggregated';

  const shouldShowFilter = isManager || isDirector || isAdmin || hasAggregatedScope;

  // Don't render if user shouldn't see this filter
  if (!shouldShowFilter) {
    return null;
  }

  const loading = loadingTeams;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Users className="w-4 h-4" />
        <span>Loading...</span>
      </div>
    );
  }

  const currentValue =
    selectedTeamId === '__unassigned__'
      ? 'unassigned'
      : selectedTeamId
        ? `team:${selectedTeamId}`
        : 'all';

  // Handle selection change
  const handleChange = (value) => {
    if (value === 'all') {
      setTeamScope(null);
    } else if (value === 'unassigned') {
      setTeamScope('__unassigned__');
    } else if (value.startsWith('team:')) {
      const teamId = value.replace('team:', '');
      setTeamScope(teamId);
      // setTeamScope already clears employee selection
    }
  };

  const hasTeams = teams.length > 0;

  return (
    <div className="flex items-center gap-2">
      {hasTeams ? (
        <Building2 className="w-4 h-4 text-slate-400" />
      ) : (
        <Users className="w-4 h-4 text-slate-400" />
      )}
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger className="w-[220px] bg-slate-800 border-slate-700 text-slate-200">
          <SelectValue placeholder="All Records" />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700 text-slate-200 max-h-[400px]">
          <SelectItem value="all" className="hover:bg-slate-700">
            All Records
          </SelectItem>
          <SelectItem value="unassigned" className="hover:bg-slate-700">
            Unassigned
          </SelectItem>
          {/* Teams section */}
          {hasTeams && (
            <>
              <SelectSeparator className="bg-slate-700" />
              <SelectGroup>
                <SelectLabel className="text-slate-500 text-xs uppercase tracking-wide px-2">
                  Teams
                </SelectLabel>
                {teams.map((team) => {
                  const memberCount = (membersByTeam[team.id] || []).length;
                  return (
                    <SelectItem
                      key={`team:${team.id}`}
                      value={`team:${team.id}`}
                      className="hover:bg-slate-700"
                    >
                      {team.name} ({memberCount})
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
