import React, { useState, useEffect, useMemo } from 'react';
import { Employee } from '@/api/entities';
import { User } from '@/api/entities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';

export default function EmployeeSelector({
  value,
  onValueChange,
  placeholder = "Select employee...",
  className = "",
  disabled = false,
  includeUnassigned = true,
  ...props
}) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const currentUser = await User.me();

        // Build filter based on user's tenant
        let filter = {};
        if (currentUser.tenant_id) {
          filter.tenant_id = currentUser.tenant_id;
        }

        // Load active employees
        filter.is_active = true;

        const employeesData = await Employee.filter(filter);
        setEmployees(employeesData || []);
      } catch (error) {
        console.error('Failed to load employees:', error);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Sort employees by name
  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => {
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [employees]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 p-2 bg-slate-700 border border-slate-600 rounded-md ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
        <span className="text-sm text-slate-400">Loading employees...</span>
      </div>
    );
  }

  return (
    <Select value={value || ''} onValueChange={onValueChange} disabled={disabled} {...props}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700 z-[2147483010]">
        {includeUnassigned && (
          <SelectItem value={null} className="text-slate-200 hover:bg-slate-700">
            Unassigned
          </SelectItem>
        )}
        {sortedEmployees.map((employee) => (
          <SelectItem 
            key={employee.id} 
            value={employee.email || employee.user_email} 
            className="text-slate-200 hover:bg-slate-700"
          >
            {employee.first_name} {employee.last_name}
            {employee.job_title && <span className="text-slate-400 text-xs ml-2">({employee.job_title})</span>}
          </SelectItem>
        ))}
        {sortedEmployees.length === 0 && (
          <SelectItem value="__no_employees__" disabled className="text-slate-500">
            No employees found
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}