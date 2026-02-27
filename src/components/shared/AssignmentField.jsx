import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import LazyEmployeeSelector from './LazyEmployeeSelector';
import AssignmentHistory from '../leads/AssignmentHistory';
import useTeamScope from '@/hooks/useTeamScope';

/**
 * AssignmentField — reusable "Assigned To" field with team-scoped dropdown,
 * claim/unassign buttons for non-managers, and optional assignment history.
 *
 * Props:
 *   value        - current assigned_to value (employee UUID or '')
 *   onChange      - (newValue) => void
 *   user          - current user object from auth context
 *   isManager     - boolean (true = show dropdown, false = claim/unassign)
 *   entityId      - UUID of the entity (for assignment history, optional)
 *   entityType    - 'lead' | 'contact' | 'account' | 'opportunity' | 'activity' | 'bizdev_source'
 *   tenantId      - tenant UUID (for assignment history)
 *   showHistory   - show assignment history trail (default: true when entityId exists)
 *   label         - field label (default: 'Assigned To')
 */
export default function AssignmentField({
  value,
  onChange,
  user,
  isManager = false,
  entityId,
  entityType = 'lead',
  tenantId,
  showHistory = true,
  label = 'Assigned To',
}) {
  const { allowedIds } = useTeamScope(user);

  const role = (user?.role || '').toLowerCase();
  const canUseDropdown = isManager || role === 'admin' || role === 'superadmin';

  return (
    <div className="space-y-2">
      <Label htmlFor="assigned_to" className="text-slate-200">
        {label}
      </Label>

      {canUseDropdown ? (
        // Managers/admins: team-scoped employee dropdown
        <LazyEmployeeSelector
          value={value || 'unassigned'}
          onValueChange={(v) => onChange(v === 'unassigned' ? '' : v)}
          placeholder="Select assignee"
          includeUnassigned={true}
          allowedIds={allowedIds}
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
            onClick={() => onChange(user?.employee_id || user?.id || user?.email)}
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
            onClick={() => onChange('')}
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
