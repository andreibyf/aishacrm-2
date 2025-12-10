import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import { Employee } from "@/api/entities";
import { useEmployeeScope } from "./EmployeeScopeContext";

export default function EmployeeScopeFilter({ user, selectedTenantId }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const { selectedEmployeeEmail, setSelectedEmployeeEmail } =
    useEmployeeScope();

  // Determine if user should see this filter
  const isManager = user?.employee_role === "manager";
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const hasAggregatedScope =
    user?.permissions?.dashboard_scope === "aggregated";

  const shouldShowFilter = isManager || isAdmin || hasAggregatedScope;

  useEffect(() => {
    const loadEmployees = async () => {
      // Early exit conditions to reduce log noise & unnecessary fetches
      if (!shouldShowFilter) {
        setLoading(false);
        return; // User doesn't have scope privileges
      }
      if (!user) {
        setLoading(false);
        return; // Wait until user context is available
      }
      // Admin viewing all tenants but no tenant selected yet — avoid global employee scan
      if (isAdmin && !selectedTenantId && !user.tenant_id) {
        setLoading(false);
        return; // Prevent broad unfiltered Employee.list() query
      }

      try {
        setLoading(true);
        const effectiveTenantId = (isAdmin && selectedTenantId)
          ? selectedTenantId
          : user.tenant_id || null;

        if (!effectiveTenantId) {
          // Still no tenant to scope employees — abort silently
          setEmployees([]);
          setLoading(false);
          return;
        }

        const employeeList = await Employee.list({ tenant_id: effectiveTenantId });
        const crmEmployees = (employeeList || []).filter((emp) => {
          const isActive = emp.is_active !== false && emp.status !== "inactive";
          const hasEmail = emp.email || emp.user_email;
          return isActive && emp.has_crm_access === true && hasEmail;
        });
        setEmployees(crmEmployees);
      } catch (error) {
        console.error("[EmployeeScopeFilter] Failed to load employees:", error);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };
    loadEmployees();
  }, [user, selectedTenantId, shouldShowFilter, isAdmin]);

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
        value={selectedEmployeeEmail || "all"}
        onValueChange={(value) =>
          setSelectedEmployeeEmail(value === "all" ? null : value)}
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
          {employees.map((emp) => (
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
