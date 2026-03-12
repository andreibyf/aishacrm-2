/**
 * AssignedToDisplay - Displays assigned employee/user name with loading state
 * 
 * Never shows raw UUIDs. Shows animated "Updating" while resolving names.
 * Falls back to "Unassigned" if no assignment.
 * 
 * Supports both Map objects and plain objects for lookups.
 */
export default function AssignedToDisplay({
  assignedToName,
  assignedTo,
  employeesMap = {},
  usersMap = {},
  className = '',
}) {
  // No assignment at all
  if (!assignedToName && !assignedTo) {
    return <span className={`text-slate-500 ${className}`}>Unassigned</span>;
  }

  // Helper to get from Map or plain object
  const getFromMapOrObject = (mapOrObj, key) => {
    if (!mapOrObj || !key) return null;
    if (mapOrObj instanceof Map) {
      const item = mapOrObj.get(key);
      if (!item) return null;
      // Handle employee objects with first_name/last_name
      if (item.first_name || item.last_name) {
        return `${item.first_name || ''} ${item.last_name || ''}`.trim();
      }
      // Handle user objects with full_name
      return item.full_name || item.name || null;
    }
    // Plain object lookup (already returns name string)
    return mapOrObj[key] || null;
  };

  // Try to resolve name from various sources
  const resolvedName =
    assignedToName ||
    getFromMapOrObject(employeesMap, assignedTo) ||
    getFromMapOrObject(usersMap, assignedTo);

  // If we have an assigned_to but no resolved name yet, show animated loading
  // Never fall back to showing raw UUID
  if (!resolvedName && assignedTo) {
    return (
      <span className={`text-slate-400 ${className}`}>
        Updating<span className="animate-ellipsis"></span>
      </span>
    );
  }

  return (
    <span className={className}>
      {resolvedName || <span className="text-slate-500">Unassigned</span>}
    </span>
  );
}
