import { useState, useEffect, useMemo } from 'react'; // React is used for JSX, so it is required.
import { Employee } from '@/api/entities';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTenant } from './tenantContext';
import { getTenantFilter } from './tenantUtils'; // Updated import to use tenantUtils.js
import { useUser } from '@/components/shared/useUser.js';

export default function LazyEmployeeSelector({
  value,
  onValueChange,
  placeholder = 'Select employee...',
  includeAll = false,
  includeUnassigned = false,
  allowedIds = null,
  className = '',
  ...props
}) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const { selectedTenantId } = useTenant();
  const { user } = useUser();

  useEffect(() => {
    const loadEmployees = async () => {
      if (!user) return;

      setLoading(true);
      try {
        const tenantFilter = getTenantFilter(user, selectedTenantId);
        const employeeData = await Employee.filter(tenantFilter);
        setEmployees(employeeData || []);
      } catch (error) {
        console.error('Failed to load employees:', error);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadEmployees();
    }
  }, [user, selectedTenantId]);

  // Filter employees by allowed IDs if provided (team scoping)
  const filteredEmployees = useMemo(() => {
    if (!allowedIds) return employees;
    const idSet = new Set(allowedIds);
    return employees.filter((emp) => idSet.has(emp.id));
  }, [employees, allowedIds]);

  // Create a map of id -> full name for display
  const employeeMap = useMemo(() => {
    const map = {};
    employees.forEach((emp) => {
      const fullName = `${emp.first_name} ${emp.last_name}`.trim();
      map[emp.id] = fullName;
    });
    return map;
  }, [employees]);

  // Get display value - show name instead of id
  const getDisplayValue = () => {
    if (!value || value === 'all') return includeAll ? 'All Employees' : placeholder;
    if (value === 'unassigned') return 'Unassigned';
    return employeeMap[value] || value; // Show name if found, otherwise fall back to value
  };

  return (
    <Select value={value || 'all'} onValueChange={onValueChange} disabled={loading} {...props}>
      <SelectTrigger className={className}>
        <SelectValue>{getDisplayValue()}</SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700 text-slate-200 max-h-[300px]">
        {includeAll && (
          <SelectItem value="all" className="hover:bg-slate-700">
            All Employees
          </SelectItem>
        )}
        {includeUnassigned && (
          <SelectItem value="unassigned" className="hover:bg-slate-700">
            Unassigned
          </SelectItem>
        )}
        {filteredEmployees.map((employee) => {
          const fullName = `${employee.first_name} ${employee.last_name}`.trim();

          return (
            <SelectItem key={employee.id} value={employee.id} className="hover:bg-slate-700">
              {fullName}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
