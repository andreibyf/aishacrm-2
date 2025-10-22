import React, { useState, useEffect, useMemo } from "react";
import { Employee } from "@/api/entities";
import { User } from "@/api/entities";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenant, getTenantFilter } from "./tenantContext";

export default function LazyEmployeeSelector({ 
  value, 
  onValueChange, 
  placeholder = "Select employee...",
  includeAll = false,
  includeUnassigned = false,
  className = "",
  ...props 
}) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const { selectedTenantId } = useTenant();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await User.me();
        setUser(currentUser);
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    const loadEmployees = async () => {
      if (!user) return;
      
      setLoading(true);
      try {
        const tenantFilter = getTenantFilter(user, selectedTenantId);
        const employeeData = await Employee.filter(tenantFilter);
        setEmployees(employeeData || []);
      } catch (error) {
        console.error("Failed to load employees:", error);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadEmployees();
    }
  }, [user, selectedTenantId]);

  // Create a map of email -> full name for display
  const employeeMap = useMemo(() => {
    const map = {};
    employees.forEach(emp => {
      if (emp.email || emp.user_email) {
        const email = emp.email || emp.user_email;
        const fullName = `${emp.first_name} ${emp.last_name}`.trim();
        map[email] = fullName;
      }
    });
    return map;
  }, [employees]);

  // Get display value - show name instead of email
  const getDisplayValue = () => {
    if (!value || value === 'all') return includeAll ? 'All Employees' : placeholder;
    if (value === 'unassigned') return 'Unassigned';
    return employeeMap[value] || value; // Show name if found, otherwise fall back to value
  };

  return (
    <Select value={value || 'all'} onValueChange={onValueChange} disabled={loading} {...props}>
      <SelectTrigger className={className}>
        <SelectValue>
          {getDisplayValue()}
        </SelectValue>
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
        {employees.map((employee) => {
          const email = employee.email || employee.user_email;
          const fullName = `${employee.first_name} ${employee.last_name}`.trim();
          
          if (!email) return null;
          
          return (
            <SelectItem 
              key={employee.id} 
              value={email}
              className="hover:bg-slate-700"
            >
              {fullName}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}