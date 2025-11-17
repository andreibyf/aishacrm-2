import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User as UserIcon, Users } from "lucide-react";
import { Employee } from "@/api/entities";
import { useUser } from '@/components/shared/useUser.js';
import { Label } from "@/components/ui/label";

export default function EmployeeFilter({ value, onChange, className = "" }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useUser();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        if (currentUser?.role === 'admin' || currentUser?.role === 'superadmin' || currentUser?.employee_role === 'manager') {
          const tenantFilter = currentUser.tenant_id ? { tenant_id: currentUser.tenant_id } : {};
          const empList = await Employee.filter(tenantFilter, "first_name");
          setEmployees(empList || []);
        }
      } catch (error) {
        console.error("Failed to load employees:", error);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };
    if (currentUser) loadData();
  }, [currentUser]);

  // Don't show filter for regular employees (they only see their own data)
  if (!currentUser || (currentUser.employee_role === 'employee' && currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-10 w-48 animate-pulse bg-slate-700 rounded-md"></div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <Label className="text-sm text-slate-300 flex items-center gap-2">
        <Users className="w-4 h-4" />
        Filter by Employee
      </Label>
      <Select value={value || "all"} onValueChange={onChange}>
        <SelectTrigger className="w-full sm:w-64 bg-slate-700 border-slate-600 text-slate-200">
          <SelectValue placeholder="All Employees" />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700 text-slate-200" style={{ zIndex: 2147483647 }}>
          <SelectItem value="all" className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>All Employees</span>
            </div>
          </SelectItem>
          {employees
            .filter(emp => emp.email || emp.user_email)
            .map((employee) => (
              <SelectItem 
                key={employee.id} 
                value={employee.email || employee.user_email} 
                className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
              >
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4" />
                  <span>{employee.first_name} {employee.last_name}</span>
                </div>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}