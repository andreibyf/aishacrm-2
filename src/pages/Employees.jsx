import { User, Employee } from "@/api/entities";
import { useTenant } from "../components/shared/tenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Upload, Download, Loader2, Eye, Shield } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import CsvImportDialog from "../components/shared/CsvImportDialog";
import Pagination from "../components/shared/Pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EmployeeForm from "../components/employees/EmployeeForm";
import EmployeeDetailPanel from "../components/employees/EmployeeDetailPanel";
import EmployeePermissionsDialog from "../components/employees/EmployeePermissionsDialog";
import EmployeeInviteDialog from "../components/employees/EmployeeInviteDialog";
import { toast } from "sonner";
import { useState, useEffect, useCallback } from "react";

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [permissionsEmployee, setPermissionsEmployee] = useState(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmployee, setInviteEmployee] = useState(null);

  const { selectedTenantId } = useTenant();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await User.me();
        console.log('[Employees] Current user loaded:', user);
        setCurrentUser(user);
      } catch (error) {
        console.error("Failed to load current user:", error);
      }
    };
    fetchUser();
  }, []);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      if (!currentUser) {
        console.warn("Current user not available, cannot load employees.");
        setEmployees([]);
        setTotalItems(0);
        setLoading(false);
        return;
      }

      const effectiveTenantId = selectedTenantId || currentUser.tenant_id;
      
      let filter = { tenant_id: effectiveTenantId };
      if (!filter.tenant_id) {
          console.warn("No tenant ID available, cannot load employees.");
          setEmployees([]);
          setTotalItems(0);
          setLoading(false);
          return;
      }
      
      const canSeeAll = currentUser.role === 'admin' || 
                       currentUser.role === 'superadmin' || 
                       currentUser.tier === 'Tier3' || 
                       currentUser.tier === 'Tier4';
      
      console.log('[Employees] Effective tenant ID:', effectiveTenantId);
      console.log('[Employees] Loading with filter:', filter);
      console.log('[Employees] canSeeAll:', canSeeAll);
      
      let allEmployees;
      if (canSeeAll) {
        allEmployees = await Employee.filter(filter, "-created_date");
      } else {
        allEmployees = await Employee.filter({
          ...filter,
          $or: [
            { created_by: currentUser.email },
            { user_email: currentUser.email }
          ]
        }, "-created_date");
      }
      
      console.log('[Employees] Loaded employees:', allEmployees?.length || 0);
      console.log('[Employees] Sample employee tenant IDs:', allEmployees?.slice(0, 3).map(e => e.tenant_id));
      
      const filtered = allEmployees.filter(emp => 
        (emp.first_name + ' ' + emp.last_name).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      setTotalItems(filtered.length);

      const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
      setEmployees(paginated);
    } catch (error) {
      console.error("Error loading employees:", error);
      toast.error("Failed to load employees.");
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId, searchTerm, currentPage, pageSize, currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadEmployees();
    }
  }, [loadEmployees, currentUser]);

  const handleSave = async () => {
    setIsFormOpen(false);
    setEditingEmployee(null);
    console.log('[Employees] Reloading after save...');
    await loadEmployees();
    toast.success('Employee list refreshed');
  };

  const handleEditFromPanel = (employee) => {
    setIsDetailPanelOpen(false);
    setSelectedEmployee(null);
    setEditingEmployee(employee);
    setIsFormOpen(true);
  };

  const handleDeleteFromPanel = async (id) => {
    if (confirm("Are you sure you want to delete this employee?")) {
      try {
        await Employee.delete(id);
        toast.success("Employee deleted successfully.");
        if (selectedEmployee && selectedEmployee.id === id) {
          setIsDetailPanelOpen(false);
          setSelectedEmployee(null);
        }
        await loadEmployees();
      } catch (error) {
        if (import.meta.env.DEV) {
          console.log('[DELETE DEBUG] Error object:', error);
          console.log('[DELETE DEBUG] Error type:', typeof error);
          console.log('[DELETE DEBUG] Error is null?', error === null);
          console.log('[DELETE DEBUG] Error is undefined?', error === undefined);
          console.log('[DELETE DEBUG] Error.response:', error?.response);
          console.log('[DELETE DEBUG] Error.message:', error?.message);
        }
        
        let errorMessage = "Failed to delete employee";
        
        if (!error) {
          errorMessage = "Unknown error occurred";
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (error.response?.data?.error) {
          errorMessage = error.response.data.error;
        }
        
        console.error("Final error message:", errorMessage);
        toast.error(errorMessage);
      }
    }
  };

  const exportCsv = () => {
    toast.info("CSV export feature is not fully implemented yet.");
  };
  
  const getFormTenantId = () => {
      // Guard: Don't process if user isn't loaded yet
      if (!currentUser) {
          return null;
      }
      
      if (currentUser?.role === 'superadmin' && selectedTenantId) {
          console.log('[Employees] Using selected tenant for form:', selectedTenantId);
          return selectedTenantId;
      }
      
      // Try to get tenant_id from current user
      const tenantId = currentUser?.tenant_id || currentUser?.tenantId;
      
      if (!tenantId) {
          console.warn('[Employees] No tenant_id found on current user:', currentUser);
          toast.error('Unable to determine tenant. Please refresh the page.');
          return null;
      }
      
      console.log('[Employees] Using user tenant for form:', tenantId);
      return tenantId;
  };

  const canManagePermissions = (employee) => {
    if (!currentUser) return false;
    
    if (currentUser.role === 'superadmin' || currentUser.role === 'admin') return true;
    
    if (!employee.user_email) return false;
    
    if (currentUser.tier === 'Tier4') return true;
    
    if (currentUser.tier === 'Tier3') {
      return true;
    }
    
    return false;
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-900 min-h-screen text-slate-100">
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl bg-slate-800 border-slate-700 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-100">{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
          </DialogHeader>
          <EmployeeForm
            employee={editingEmployee}
            onSave={handleSave}
            onCancel={() => setIsFormOpen(false)}
            tenantId={getFormTenantId()}
          />
        </DialogContent>
      </Dialog>
      
      <CsvImportDialog
        entity={Employee}
        schema={{
          name: "Employee",
          type: "object",
          properties: {
            first_name: { type: "string", description: "Employee's first name" },
            last_name: { type: "string", description: "Employee's last name" },
            email: { type: "string", format: "email", description: "Employee's work email" },
            phone: { type: "string", description: "Primary phone number" },
            mobile: { type: "string", description: "Mobile phone number" },
            department: { type: "string", enum: ["sales", "marketing", "operations", "field_services", "construction", "maintenance", "administration", "management", "technical", "customer_service", "other"] },
            job_title: { type: "string", description: "Job title or position" },
            employment_status: { type: "string", enum: ["active", "inactive", "terminated", "on_leave"], default: "active" },
            employment_type: { type: "string", enum: ["full_time", "part_time", "contractor", "seasonal"], default: "full_time" },
            hire_date: { type: "string", format: "date", description: "Date of hire" },
            hourly_rate: { type: "number", description: "Hourly compensation rate" }
          },
          required: ["first_name", "last_name", "department", "job_title"]
        }}
        onSuccess={() => { loadEmployees(); setIsImportDialogOpen(false); }}
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
        tenantId={getFormTenantId()}
      />

      <EmployeeDetailPanel
        employee={selectedEmployee}
        open={isDetailPanelOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDetailPanelOpen(false);
            setSelectedEmployee(null);
          }
        }}
        onEdit={handleEditFromPanel}
        onDelete={handleDeleteFromPanel}
        user={currentUser}
      />

      <EmployeePermissionsDialog
        open={isPermissionsOpen}
        onOpenChange={setIsPermissionsOpen}
        employee={permissionsEmployee}
        editorUser={currentUser}
        onSuccess={async () => {
          await loadEmployees();
          setPermissionsEmployee(null);
        }}
      />

      <EmployeeInviteDialog
        open={isInviteOpen}
        onOpenChange={setIsInviteOpen}
        employee={inviteEmployee}
        currentUser={currentUser}
        onDone={async (res) => {
          if (res?.mode === 'direct_invite' && inviteEmployee?.id && inviteEmployee?.email) {
            try {
              await Employee.update(inviteEmployee.id, { user_email: inviteEmployee.email });
              await loadEmployees();
            } catch (e) {
              console.warn('Could not link user_email after inviting:', e?.message);
              toast.error("Failed to link employee to user account after invite.");
            }
          }
          setIsInviteOpen(false);
          setInviteEmployee(null);
        }}
      />
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Employees</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-700 text-slate-200"
            />
          </div>
          <Button 
            onClick={() => { setEditingEmployee(null); setIsFormOpen(true); }} 
            className="bg-blue-600 hover:bg-blue-700"
            disabled={!currentUser}
          >
            <Plus className="mr-2 h-4 w-4" /> Add Employee
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="bg-slate-800 border-slate-700 hover:bg-slate-700">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200">
              <DropdownMenuItem onClick={() => setIsImportDialogOpen(true)} className="hover:bg-slate-700 focus:bg-slate-700">
                <Upload className="mr-2 h-4 w-4" /> Import from CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportCsv} className="hover:bg-slate-700 focus:bg-slate-700">
                <Download className="mr-2 h-4 w-4" /> Export to CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700 hover:bg-slate-700/50">
                  <TableHead className="text-slate-300">Name</TableHead>
                  <TableHead className="hidden md:table-cell text-slate-300">Email</TableHead>
                  <TableHead className="hidden lg:table-cell text-slate-300">Phone</TableHead>
                  <TableHead className="text-slate-300">Department</TableHead>
                  <TableHead className="hidden xl:table-cell text-slate-300">Job Title</TableHead>
                  <TableHead className="text-slate-300">Access</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                    </TableCell>
                  </TableRow>
                ) : employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-slate-400">
                      No employees found.
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((employee) => (
                    <TableRow key={employee.id} className="hover:bg-slate-700/50 border-b border-slate-800">
                      <TableCell className="font-medium text-slate-200 cursor-pointer" onClick={() => { setSelectedEmployee(employee); setIsDetailPanelOpen(true); }}>
                        <div className="font-semibold">{employee.first_name} {employee.last_name}</div>
                        {employee.employee_number && <div className="text-xs text-slate-400">#{employee.employee_number}</div>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-slate-300 cursor-pointer" onClick={() => { setSelectedEmployee(employee); setIsDetailPanelOpen(true); }}>
                        {employee.email || '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-slate-300 cursor-pointer" onClick={() => { setSelectedEmployee(employee); setIsDetailPanelOpen(true); }}>
                        {employee.phone || '—'}
                      </TableCell>
                      <TableCell className="cursor-pointer" onClick={() => { setSelectedEmployee(employee); setIsDetailPanelOpen(true); }}>
                        <Badge variant="outline" className="capitalize border-slate-600 text-slate-300">
                          {employee.department?.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-slate-300 cursor-pointer" onClick={() => { setSelectedEmployee(employee); setIsDetailPanelOpen(true); }}>
                        {employee.job_title}
                      </TableCell>
                      <TableCell className="cursor-pointer" onClick={() => { setSelectedEmployee(employee); setIsDetailPanelOpen(true); }}>
                        <Badge variant="outline" className={employee.has_crm_access ? 'bg-green-900/30 text-green-400 border-green-700' : 'bg-slate-700 text-slate-400 border-slate-600'}>
                          {employee.has_crm_access ? 'Active' : 'No Access'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingEmployee(employee); setIsFormOpen(true); }}
                            className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setSelectedEmployee(employee); setIsDetailPanelOpen(true); }}
                            className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200">
                              {canManagePermissions(employee) && employee.has_crm_access && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => { setPermissionsEmployee(employee); setIsPermissionsOpen(true); }}
                                    className="hover:bg-slate-700 focus:bg-slate-700"
                                  >
                                    <Shield className="w-4 h-4 mr-2" />
                                    Manage Permissions
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-slate-700" />
                                </>
                              )}
                              <DropdownMenuItem
                                onSelect={async (e) => {
                                  e.preventDefault();
                                  if (!confirm('Are you sure you want to delete this employee?')) {
                                    return;
                                  }
                                  
                                      try {
                                        await Employee.delete(employee.id);
                                    toast.success('Employee deleted');
                                    
                                    if (selectedEmployee?.id === employee.id) {
                                      setIsDetailPanelOpen(false);
                                      setSelectedEmployee(null);
                                    }
                                    
                                    loadEmployees();
                                  } catch (err) {
                                    if (import.meta.env.DEV) {
                                      console.log('[DROPDOWN DELETE DEBUG] Error object:', err);
                                      console.log('[DROPDOWN DELETE DEBUG] Error type:', typeof err);
                                      console.log('[DROPDOWN DELETE DEBUG] Error.response:', err?.response);
                                      console.log('[DROPDOWN DELETE DEBUG] Error.message:', err?.message);
                                      console.log('[DROPDOWN DELETE DEBUG] Error keys:', err ? Object.keys(err) : 'null/undefined');
                                    }
                                    
                                    let msg = "Failed to delete employee";
                                    
                                    if (!err) {
                                      msg = "Unknown error occurred";
                                    } else if (typeof err === 'string') {
                                      msg = err;
                                    } else if (err.message) {
                                      msg = err.message;
                                    } else if (err.response?.data?.error) {
                                      msg = err.response.data.error;
                                    }
                                    
                                    console.error("Final dropdown delete error:", msg);
                                    toast.error(msg);
                                  }
                                    }}
                                className="text-red-400 hover:bg-slate-700 focus:bg-slate-700 focus:text-red-400"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <div className="mt-6">
        <Pagination
          currentPage={currentPage}
          totalPages={Math.ceil(totalItems / pageSize)}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          totalItems={totalItems}
        />
      </div>
    </div>
  );
}
