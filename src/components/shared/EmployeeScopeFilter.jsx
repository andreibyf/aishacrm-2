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
      if (!user || !shouldShowFilter) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Build filter based on tenant
        const filter = {};

        // For admins managing a specific tenant
        if (isAdmin && selectedTenantId) {
          filter.tenant_id = selectedTenantId;
        } // For managers and power users, use their own tenant
        else if (user.tenant_id) {
          filter.tenant_id = user.tenant_id;
        }

        console.log(
          "[EmployeeScopeFilter] Loading employees with filter:",
          filter,
        );

        // Load all active employees for this tenant using list() with tenant_id
        const employeeList = await Employee.list({
          tenant_id: filter.tenant_id,
          // Note: is_active filtering may need to be done client-side if not supported by backend
        });

        console.log(
          "[EmployeeScopeFilter] Loaded employees:",
          employeeList?.length || 0,
        );

        // Filter to only employees with CRM access and active status
        const crmEmployees = (employeeList || []).filter((emp) => {
          // Only show employees who have CRM access and are active
          const isActive = emp.is_active !== false && emp.status !== "inactive";
          return isActive && emp.has_crm_access === true && emp.user_email;
        });

        console.log(
          "[EmployeeScopeFilter] CRM-enabled employees:",
          crmEmployees.length,
        );

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

  // If no employees found, show a message
  if (employees.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Users className="w-4 h-4" />
        <span>No employees with CRM access</span>
      </div>
    );
  }

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
              value={emp.user_email}
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
