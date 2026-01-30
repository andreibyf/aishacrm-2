import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import { useEmployeeScope } from "./EmployeeScopeContext";

export default function EmployeeScopeFilter({ user, selectedTenantId: _selectedTenantId }) {
  const { 
    selectedEmployeeId, 
    setSelectedEmployeeId, 
    employees, 
    employeesLoading: loading 
  } = useEmployeeScope();

  // Determine if user should see this filter
  const isManager = user?.employee_role === "manager";
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const hasAggregatedScope =
    user?.permissions?.dashboard_scope === "aggregated";

  const shouldShowFilter = isManager || isAdmin || hasAggregatedScope;

  // Filter to only CRM-eligible employees
  const crmEmployees = (employees || []).filter((emp) => {
    const hasEmail = emp.email || emp.user_email;
    return hasEmail;
  });

  // Don't render if user shouldn't see this filter
  if (!shouldShowFilter) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Users className="w-4 h-4" />
        <span>Loading employees...</span>
      </div>
    );
  }

  // Always show the filter for admins - "Unassigned" and "All Records" are always valid categories
  // even if there are no employees with CRM access

  return (
    <div className="flex items-center gap-2">
      <Users className="w-4 h-4 text-slate-400" />
      <Select
        value={selectedEmployeeId || "all"}
        onValueChange={(value) =>
          setSelectedEmployeeId(value === "all" ? null : value)}
      >
        <SelectTrigger className="w-[200px] bg-slate-800 border-slate-700 text-slate-200">
          <SelectValue placeholder="All Employees" />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
          <SelectItem value="all" className="hover:bg-slate-700">
            All Records
          </SelectItem>
          <SelectItem value="unassigned" className="hover:bg-slate-700">
            Unassigned
          </SelectItem>
          {crmEmployees.map((emp) => (
            <SelectItem
              key={emp.id}
              value={emp.id}
              className="hover:bg-slate-700"
            >
              {emp.first_name} {emp.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
