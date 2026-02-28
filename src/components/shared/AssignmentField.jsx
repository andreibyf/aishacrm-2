import { useState, useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import LazyEmployeeSelector from './LazyEmployeeSelector';
import AssignmentHistory from '../leads/AssignmentHistory';
import useTeamScope from '@/hooks/useTeamScope';
import useTeams from '@/hooks/useTeams';

/**
 * AssignmentField — reusable "Assigned To" field with team→person cascade,
 * claim/unassign buttons for non-managers, and optional assignment history.
 *
 * Props:
 *   value           - current assigned_to value (employee UUID or '')
 *   teamValue       - current assigned_to_team value (team UUID or '')
 *   onChange         - (newValue) => void — for assigned_to
 *   onTeamChange    - (newTeamId) => void — for assigned_to_team
 *   user            - current user object from auth context
 *   isManager       - boolean (true = show dropdown, false = claim/unassign)
 *   entityId        - UUID of the entity (for assignment history, optional)
 *   entityType      - 'lead' | 'contact' | 'account' | 'opportunity' | 'activity' | 'bizdev_source'
 *   tenantId        - tenant UUID (for fetching teams + assignment history)
 *   showHistory     - show assignment history trail (default: true when entityId exists)
 *   label           - field label (default: 'Assigned To')
 */
export default function AssignmentField({
  value,
  teamValue,
  onChange,
  onTeamChange,
  user,
  isManager = false,
  entityId,
  entityType = 'lead',
  tenantId,
  showHistory = true,
  label = 'Assigned To',
}) {
  const {
    allowedIds,
    teamIds: userTeamIds,
    fullAccessTeamIds,
    highestRole,
    bypass,
  } = useTeamScope(user);
  const { teams, membersByTeam, loading: teamsLoading } = useTeams(tenantId);

  const role = (user?.role || '').toLowerCase();
  const canUseDropdown = isManager || role === 'admin' || role === 'superadmin';
  const canChangeTeam =
    bypass ||
    highestRole === 'director' ||
    highestRole === 'admin' ||
    role === 'admin' ||
    role === 'superadmin';

  // Filter teams available for selection
  const availableTeams = useMemo(() => {
    if (!teams || teams.length === 0) return [];
    // Admin/director: all teams
    if (canChangeTeam) return teams;
    // Manager: own teams
    if (highestRole === 'manager') return teams.filter((t) => userTeamIds.includes(t.id));
    // Member: own teams (read-only display)
    return teams.filter((t) => userTeamIds.includes(t.id));
  }, [teams, canChangeTeam, highestRole, userTeamIds]);

  // Compute which employees to show in person dropdown based on selected team
  const filteredAllowedIds = useMemo(() => {
    if (bypass) return null; // Admin: no filtering
    if (teamValue && membersByTeam[teamValue]) {
      // Team selected: only show that team's members
      return membersByTeam[teamValue];
    }
    // No team selected: use the default allowedIds from team scope
    return allowedIds;
  }, [bypass, teamValue, membersByTeam, allowedIds]);

  // Handle team change — clear person if they're not on the new team
  const handleTeamChange = (newTeamId) => {
    const actualTeamId = newTeamId === 'unassigned' ? '' : newTeamId;
    if (onTeamChange) {
      onTeamChange(actualTeamId);
    }
    // If person is currently assigned and not a member of the new team, clear them
    if (value && actualTeamId && membersByTeam[actualTeamId]) {
      if (!membersByTeam[actualTeamId].includes(value)) {
        onChange('');
      }
    }
  };

  // Handle person change — auto-set team if single-team employee
  const handlePersonChange = (newPersonId) => {
    onChange(newPersonId);
    // If no team set and person belongs to exactly one team, auto-set it
    if (newPersonId && !teamValue && onTeamChange) {
      const personTeams = Object.entries(membersByTeam)
        .filter(([, members]) => members.includes(newPersonId))
        .map(([teamId]) => teamId);
      if (personTeams.length === 1) {
        onTeamChange(personTeams[0]);
      }
    }
  };

  // Show team selector only when teams exist
  const showTeamSelector = availableTeams.length > 0;

  return (
    <div className="space-y-2">
      {/* Team selector */}
      {showTeamSelector && (
        <div>
          <Label htmlFor="assigned_to_team" className="text-slate-200">
            Team
          </Label>
          {canChangeTeam || (canUseDropdown && highestRole === 'manager') ? (
            <Select value={teamValue || 'unassigned'} onValueChange={handleTeamChange}>
              <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Select team..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="unassigned" className="text-slate-200 hover:bg-slate-700">
                  No Team
                </SelectItem>
                {availableTeams.map((team) => (
                  <SelectItem
                    key={team.id}
                    value={team.id}
                    className="text-slate-200 hover:bg-slate-700"
                  >
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            // Members: read-only team display
            <Input
              value={
                teamValue
                  ? availableTeams.find((t) => t.id === teamValue)?.name || 'Unknown Team'
                  : 'No Team'
              }
              disabled
              className="mt-1 bg-slate-700 border-slate-600 text-slate-400 cursor-not-allowed"
            />
          )}
        </div>
      )}

      {/* Person selector */}
      <Label htmlFor="assigned_to" className="text-slate-200">
        {label}
      </Label>

      {canUseDropdown ? (
        // Managers/admins: team-scoped employee dropdown
        <LazyEmployeeSelector
          value={value || 'unassigned'}
          onValueChange={(v) => handlePersonChange(v === 'unassigned' ? '' : v)}
          placeholder="Select assignee"
          includeUnassigned={true}
          allowedIds={filteredAllowedIds}
          className="mt-1 bg-slate-700 border-slate-600 text-slate-200"
        />
      ) : !value || value === 'unassigned' ? (
        // Non-managers viewing unassigned record: show claim button
        <div className="flex gap-2 mt-1">
          <Input
            value="Unassigned"
            disabled
            className="bg-slate-700 border-slate-600 text-slate-400 cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => handlePersonChange(user?.employee_id || user?.id || user?.email)}
            className="px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md whitespace-nowrap transition-colors"
          >
            Assign to me
          </button>
        </div>
      ) : (
        // Non-managers with assigned record: show name + unassign
        <div className="flex gap-2 mt-1">
          <Input
            value={user?.full_name || user?.email || 'You'}
            disabled
            className="bg-slate-600 border-slate-500 text-slate-300 cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => handlePersonChange('')}
            className="px-3 py-2 text-sm font-medium bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-md whitespace-nowrap transition-colors border border-slate-500"
          >
            Unassign
          </button>
        </div>
      )}

      {/* Assignment history trail */}
      {showHistory && entityId && tenantId && (
        <AssignmentHistory entityId={entityId} entityType={entityType} tenantId={tenantId} />
      )}
    </div>
  );
}
