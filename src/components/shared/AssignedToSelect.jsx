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
import { useEmployeeScope } from './EmployeeScopeContext';
import { useMemo } from 'react';

/**
 * AssignedToSelect — Shared "Assigned To" dropdown that groups employees by team.
 *
 * Directors and managers see employees grouped under their team names.
 * Ungrouped employees (not in any team) appear under "No Team".
 * If there are no teams, employees are shown as a flat list (original behavior).
 *
 * Props:
 *   value       — current filter value ('all' | 'unassigned' | employee UUID)
 *   onChange     — callback(value)
 *   className    — optional extra class for the trigger
 */
export default function AssignedToSelect({ value, onChange, className = '' }) {
  const { visibleEmployees, teams, membersByTeam } = useEmployeeScope();

  // Build team-grouped employee structure
  const { grouped, ungrouped, hasTeams } = useMemo(() => {
    if (!teams?.length || !Object.keys(membersByTeam || {}).length) {
      return { grouped: [], ungrouped: visibleEmployees || [], hasTeams: false };
    }

    const assignedIds = new Set();
    const teamGroups = [];

    for (const team of teams) {
      const memberIds = membersByTeam[team.id] || [];
      if (memberIds.length === 0) continue;

      const members = (visibleEmployees || []).filter((emp) => memberIds.includes(emp.id));
      if (members.length === 0) continue;

      members.forEach((m) => assignedIds.add(m.id));
      teamGroups.push({ team, members });
    }

    const remaining = (visibleEmployees || []).filter((emp) => !assignedIds.has(emp.id));

    return { grouped: teamGroups, ungrouped: remaining, hasTeams: true };
  }, [visibleEmployees, teams, membersByTeam]);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={`w-44 shrink-0 bg-slate-800 border-slate-700 text-slate-200 ${className}`}
      >
        <SelectValue placeholder="All Assignees" />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700 max-h-[400px]">
        <SelectItem value="all" className="text-slate-200 hover:bg-slate-700">
          All Assignees
        </SelectItem>
        <SelectItem value="unassigned" className="text-slate-200 hover:bg-slate-700">
          Unassigned
        </SelectItem>

        {hasTeams ? (
          <>
            {/* Team-grouped employees */}
            {grouped.map(({ team, members }) => (
              <SelectGroup key={team.id}>
                <SelectSeparator className="bg-slate-700" />
                <SelectLabel className="text-slate-500 text-xs uppercase tracking-wide px-2">
                  {team.name} ({members.length})
                </SelectLabel>
                {members.map((emp) => (
                  <SelectItem
                    key={emp.id}
                    value={emp.id}
                    className="text-slate-200 hover:bg-slate-700"
                  >
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}

            {/* Employees not in any team */}
            {ungrouped.length > 0 && (
              <SelectGroup>
                <SelectSeparator className="bg-slate-700" />
                <SelectLabel className="text-slate-500 text-xs uppercase tracking-wide px-2">
                  No Team
                </SelectLabel>
                {ungrouped.map((emp) => (
                  <SelectItem
                    key={emp.id}
                    value={emp.id}
                    className="text-slate-200 hover:bg-slate-700"
                  >
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </>
        ) : (
          /* Flat list when no teams configured */
          (visibleEmployees || []).map((emp) => (
            <SelectItem key={emp.id} value={emp.id} className="text-slate-200 hover:bg-slate-700">
              {emp.first_name} {emp.last_name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
