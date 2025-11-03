
import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, ShieldCheck, Edit, Search, RefreshCw, Plus, X, Copy } from "lucide-react";
// Reserved for future use: Users, AlertTriangle
import { User as _UserEntity } from "@/api/entities";
import { User } from "@/api/entities";
import { Tenant } from "@/api/entities";
import { Employee } from "@/api/entities";
import { toast } from "sonner";
import { Badge } from '@/components/ui/badge';
// import UserPermissions from './UserPermissions'; // Reserved for future use
// import { Alert, AlertDescription } from "@/components/ui/alert"; // Reserved for future use
import InviteUserDialog from './InviteUserDialog';
import { Switch } from "@/components/ui/switch";
import { format } from 'date-fns';
import { updateEmployeeSecure } from "@/api/functions";
import { deleteUser } from "@/functions/users/deleteUser";
import { canDeleteUser } from "@/utils/permissions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const UserFormModal = ({ user, tenants, currentUser, onSave, onCancel }) => {
    const navigationPages = [
        { key: 'Dashboard', label: 'Dashboard' },
        { key: 'Contacts', label: 'Contacts' },
        { key: 'Accounts', label: 'Accounts' },
        { key: 'Leads', label: 'Leads' },
        { key: 'Opportunities', label: 'Opportunities' },
        { key: 'Activities', label: 'Activities' },
        { key: 'Calendar', label: 'Calendar' },
        { key: 'BizDevSources', label: 'BizDev Sources' },
        { key: 'CashFlow', label: 'Cash Flow' },
        { key: 'DocumentProcessing', label: 'Document Processing' },
        { key: 'DocumentManagement', label: 'Document Management' },
        { key: 'AICampaigns', label: 'AI Campaigns' },
        { key: 'Employees', label: 'Employees' },
        { key: 'Reports', label: 'Reports' },
        { key: 'Integrations', label: 'Integrations' },
        { key: 'Documentation', label: 'Documentation' },
        { key: 'Settings', label: 'Settings' },
        { key: 'Agent', label: 'AI Agent (Avatar)' },
        { key: 'PaymentPortal', label: 'Payment Portal' },
        { key: 'Utilities', label: 'Utilities' },
        { key: 'ClientOnboarding', label: 'Client Onboarding' },
        { key: 'WorkflowGuide', label: 'Workflow Guide' },
        { key: 'ClientRequirements', label: 'Client Requirements' },
        { key: 'Workflows', label: 'Workflows (Experimental)' },
    ];

    const initNavPerms = () => {
        const existing = user?.navigation_permissions || {};
        const obj = {};
        // The following logic will set a default 'true' for core pages if not explicitly defined,
        // and 'false' for others (including Utilities) if not defined.
        navigationPages.forEach(p => { obj[p.key] = existing[p.key] !== undefined ? existing[p.key] : (p.key === 'Dashboard' || p.key === 'Contacts' || p.key === 'Accounts' || p.key === 'Leads' || p.key === 'Opportunities' || p.key === 'Activities'); });
        return obj;
    };

    const [formData, setFormData] = useState({
        full_name: user?.display_name || user?.full_name || '',
        tenant_id: user?.tenant_id || 'no-client',
        employee_role: user?.employee_role || 'employee', // SIMPLIFIED: Only manager or employee
        is_active: user?.is_active !== false,
        tags: user?.tags || [],
        can_use_softphone: user?.permissions?.can_use_softphone || false,
        crm_access: user?.permissions?.crm_access !== false,
        access_level: user?.permissions?.access_level || 'read_write',
        dashboard_scope: user?.permissions?.dashboard_scope || 'own',
        navigation_permissions: initNavPerms(),
        manager_employee_id: null,
        new_password: '' // For password reset
    });
    const [saving, setSaving] = useState(false);
    const [tagInput, setTagInput] = useState('');

    const [employeesInTenant, setEmployeesInTenant] = useState([]);
    const [myEmployeeRecord, setMyEmployeeRecord] = useState(null);

    // Reset form data when user changes (dialog opens/closes)
    useEffect(() => {
        setFormData({
            full_name: user?.display_name || user?.full_name || '',
            tenant_id: user?.tenant_id || 'no-client',
            employee_role: user?.employee_role || 'employee',
            is_active: user?.is_active !== false,
            tags: user?.tags || [],
            can_use_softphone: user?.permissions?.can_use_softphone || false,
            crm_access: user?.permissions?.crm_access !== false,
            access_level: user?.permissions?.access_level || 'read_write',
            dashboard_scope: user?.permissions?.dashboard_scope || 'own',
            navigation_permissions: initNavPerms(),
            manager_employee_id: null,
            new_password: '' // Reset password field when opening dialog
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]); // initNavPerms is stable (depends only on user which is already in deps)

    useEffect(() => {
        (async () => {
            const tenantId = user?.tenant_id || null;
            if (!tenantId) {
                setEmployeesInTenant([]);
                setMyEmployeeRecord(null);
                setFormData((prev) => ({ ...prev, manager_employee_id: null }));
                return;
            }
            try {
                const list = await Employee.filter({ tenant_id: tenantId });
                setEmployeesInTenant(Array.isArray(list) ? list : []);
                const mine = await Employee.filter({ tenant_id: tenantId, user_email: user?.email || "" });
                const myEmp = Array.isArray(mine) && mine.length > 0 ? mine[0] : null;
                setMyEmployeeRecord(myEmp);
                if (myEmp?.manager_employee_id) {
                    setFormData((prev) => ({ ...prev, manager_employee_id: myEmp.manager_employee_id }));
                } else {
                    setFormData((prev) => ({ ...prev, manager_employee_id: null }));
                }
            } catch (error) {
                console.error("Failed to load employee data for user form:", error);
                toast.error("Failed to load employee data.");
            }
        })();
    }, [user?.tenant_id, user?.email]);

    const managerOptions = useMemo(() => {
        const idToExclude = myEmployeeRecord?.id || null;
        return employeesInTenant.filter((e) => e.id !== idToExclude);
    }, [employeesInTenant, myEmployeeRecord]);

    // Admins and SuperAdmins can edit permissions (case-insensitive check)
    const canEditPermissions = ['admin', 'superadmin'].includes(currentUser?.role?.toLowerCase());

    const handleAddTag = () => {
        if (tagInput && !formData.tags.includes(tagInput.trim())) {
            setFormData(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
            setTagInput('');
        }
    };

    const handleRemoveTag = (indexToRemove) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter((_, index) => index !== indexToRemove)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            // 1) Persist employee manager relationship
            if (myEmployeeRecord?.id) {
                const desiredManagerId = formData.manager_employee_id || null;
                if (desiredManagerId !== (myEmployeeRecord.manager_employee_id || null)) {
                    await updateEmployeeSecure({
                        employee_id: myEmployeeRecord.id,
                        update: { manager_employee_id: desiredManagerId || null }
                    });
                }
            }

            // Build the navigation_permissions object - ensure ALL keys are included
            const navPerms = {};
            navigationPages.forEach(p => {
                navPerms[p.key] = !!formData.navigation_permissions?.[p.key];
            });

            console.log('[EnhancedUserManagement] Navigation permissions being saved:', navPerms);

            const updateData = {
                tenant_id: formData.tenant_id === 'no-client' ? null : formData.tenant_id,
                employee_role: formData.employee_role || 'employee', // Always set employee_role
                is_active: formData.is_active,
                tags: formData.tags,
                permissions: { // New nested permissions object for CRM capabilities
                    can_use_softphone: formData.can_use_softphone,
                    crm_access: !!formData.crm_access,
                    access_level: formData.access_level,
                    dashboard_scope: formData.dashboard_scope
                },
                navigation_permissions: navPerms
            };

            if (formData.full_name) {
                updateData.full_name = formData.full_name;
            }

            console.log('[EnhancedUserManagement] Saving user with payload:', updateData);

            await onSave(user.id, updateData);
        } catch (error) {
            console.error('Error saving user:', error);
            toast.error('Failed to save user changes');
        } finally {
            setSaving(false);
        }
    };

    const toggleNav = (key, value) => {
        console.log('[EnhancedUserManagement] Toggling nav permission:', key, '=', value);
        setFormData(prev => ({
            ...prev,
            navigation_permissions: { ...(prev.navigation_permissions || {}), [key]: !!value }
        }));
    };

    return (
        <Dialog open={!!user} onOpenChange={onCancel}>
            <DialogContent className="max-w-4xl w-[95vw] sm:w-full max-h-[85vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-slate-100">Edit User</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Update user information, CRM access, permissions, and navigation visibility
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Display Name */}
                    <div>
                        <Label htmlFor="full_name" className="text-slate-200">Display Name</Label>
                        <Input
                            id="full_name"
                            value={formData.full_name}
                            onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                            placeholder="Enter display name"
                            required
                            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            This will update how the user&apos;s name appears in the app
                        </p>
                    </div>

                    {/* Reset Password */}
                    <div>
                        <Label htmlFor="new_password" className="text-slate-200">Reset Password (Optional)</Label>
                        <Input
                            id="new_password"
                            type="password"
                            value={formData.new_password || ''}
                            onChange={(e) => setFormData(prev => ({ ...prev, new_password: e.target.value }))}
                            placeholder="Leave blank to keep current password"
                            className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Enter a new password to reset. Minimum 8 characters with uppercase, lowercase, number, and special character.
                        </p>
                    </div>

                    {/* Client */}
                    <div>
                        <Label htmlFor="tenant_id" className="text-slate-200">Client</Label>
                        <Select
                            value={formData.tenant_id}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, tenant_id: value }))}
                        >
                            <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                                <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                                {tenants.map(tenant => (
                                    <SelectItem key={tenant.id} value={tenant.tenant_id}>
                                        {tenant.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* SIMPLIFIED: Only Employee Role - No confusing "Role/Status" field */}
                    {/* Hide CRM Role for Admins/SuperAdmins - they have full access automatically */}
                    {user?.role?.toLowerCase() !== 'admin' && user?.role?.toLowerCase() !== 'superadmin' && (
                        <div>
                            <Label htmlFor="employee_role" className="text-slate-200">CRM Role</Label>
                            <Select
                                value={formData.employee_role || 'employee'}
                                onValueChange={(value) => setFormData(prev => ({
                                    ...prev,
                                    employee_role: value
                                }))}
                            >
                                <SelectTrigger id="employee_role" className="bg-slate-700 border-slate-600 text-slate-200">
                                    <SelectValue placeholder="Select CRM role" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                                    <SelectItem value="employee">
                                        <div className="flex flex-col">
                                            <span className="font-semibold">Employee</span>
                                            <span className="text-xs text-slate-400">Can only see their own records</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="manager">
                                        <div className="flex flex-col">
                                            <span className="font-semibold">Manager</span>
                                            <span className="text-xs text-slate-400">Can see all records in their tenant</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                Note: Base44 role is always &quot;user&quot; for Employees/Managers. This controls CRM data visibility.
                            </p>
                        </div>
                    )}

                    {/* Show System Role Badge for Admins/SuperAdmins */}
                    {(user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'superadmin') && (
                        <div className="p-4 bg-purple-900/20 border border-purple-700/50 rounded-lg">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-purple-400" />
                                <div>
                                    <p className="font-semibold text-purple-300">
                                        {user?.role?.toLowerCase() === 'superadmin' ? 'Super Administrator' : 'Tenant Administrator'}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        {user?.role?.toLowerCase() === 'superadmin' 
                                            ? 'Global system access - can manage all tenants and users'
                                            : 'Tenant admin - can manage users and settings for this tenant only'
                                        }
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Active Status */}
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="is_active"
                            checked={formData.is_active}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                        />
                        <Label htmlFor="is_active" className="text-slate-200">Account Active</Label>
                        <p className="text-xs text-slate-500 mt-1">
                            Deactivating will prevent login.
                        </p>
                    </div>

                    <div>
                        <Label htmlFor="tags" className="text-slate-200">Tags</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="tag-input"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                placeholder="e.g., Sales, Manager"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddTag();
                                    }
                                }}
                                className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
                            />
                            <Button type="button" variant="outline" onClick={handleAddTag} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                                Add
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {formData.tags.map((tag, index) => (
                                <Badge key={index} variant="secondary" className="flex items-center gap-1 bg-slate-700 text-slate-200 border-slate-600">
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTag(index)}
                                        className="rounded-full hover:bg-black/10 p-0.5"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="can_use_softphone"
                            checked={formData.can_use_softphone}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, can_use_softphone: checked }))}
                        />
                        <Label htmlFor="can_use_softphone" className="text-slate-200">Can use Softphone</Label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="crm_access"
                                checked={formData.crm_access}
                                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, crm_access: checked }))}
                            />
                            <Label htmlFor="crm_access" className="text-slate-200">CRM Access</Label>
                        </div>
                        <div>
                            <Label htmlFor="access_level" className="text-slate-200">Access Level</Label>
                            <Select
                                value={formData.access_level}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, access_level: value }))}
                            >
                                <SelectTrigger id="access_level" className="bg-slate-700 border-slate-600 text-slate-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                                    <SelectItem value="read">Read</SelectItem>
                                    <SelectItem value="read_write">Read/Write</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {/* Dashboard Data Scope */}
                        <div>
                            <Label htmlFor="dashboard_scope" className="text-slate-200">Dashboard Data Scope</Label>
                            <Select
                                value={formData.dashboard_scope}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, dashboard_scope: value }))}
                            >
                                <SelectTrigger id="dashboard_scope" className="bg-slate-700 border-slate-600 text-slate-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                                    <SelectItem value="own">Own</SelectItem>
                                    <SelectItem value="aggregated">Aggregated (tenant)</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                Default to individual, or aggregated for broader views.
                            </p>
                        </div>
                        {/* Manager selection (organizational relationship) */}
                        <div>
                            <Label htmlFor="manager_employee_id" className="text-slate-200">Manager</Label>
                            <Select
                                value={formData.manager_employee_id || "none"}
                                onValueChange={(val) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        manager_employee_id: val === "none" ? null : val
                                    }))
                                }
                                disabled={!user?.tenant_id}
                            >
                                <SelectTrigger id="manager_employee_id" className="bg-slate-700 border-slate-600 text-slate-200">
                                    <SelectValue placeholder="Select a manager (optional)" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                                    <SelectItem value="none">No Manager</SelectItem>
                                    {managerOptions.map((e) => (
                                        <SelectItem key={e.id} value={e.id}>
                                            {(e.first_name || "") + " " + (e.last_name || "") || e.user_email || e.employee_number}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                A manager will be able to filter reports to view this employee’s data (and their direct team).
                            </p>
                        </div>
                    </div>
                    <div className="mt-2">
                        <Label className="mb-2 block text-slate-200">Navigation Permissions</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto rounded-md border border-slate-600 p-2 bg-slate-800/40">
                            {navigationPages.map((p) => (
                                <div key={p.key} className="flex items-center justify-between px-2 py-1 rounded-md bg-slate-700/40 border border-slate-600">
                                    <span className="text-sm text-slate-200">{p.label}</span>
                                    <Switch
                                        checked={!!formData.navigation_permissions?.[p.key]}
                                        onCheckedChange={(v) => toggleNav(p.key, v)}
                                        disabled={!canEditPermissions}
                                    />
                                </div>
                            ))}
                        </div>
                        {!canEditPermissions && (
                            <p className="text-xs text-slate-500 mt-1">
                                Only Admin can change these.
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default function EnhancedUserManagement() {
    const [users, setUsers] = useState([]);
    const [allTenants, setAllTenants] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [isInviteModalOpen, setInviteModalOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [usersData, tenantsData, userData] = await Promise.all([
                User.list({ tenant_id: null }), // Pass null to get ALL users across all tenants
                Tenant.list(),
                User.me()
            ]);
            setUsers(usersData);
            setAllTenants(tenantsData);
            setCurrentUser(userData);
        } catch (error) {
            console.error("Failed to load data:", error);
            toast.error("Failed to load user and tenant data.");
        } finally {
            setLoading(false);
        }
    };

    const refreshUsers = () => {
        loadData();
    };

    const copyToClipboard = (text, label) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copied to clipboard`);
    };

    const handleSaveUser = async (userId, data) => {
        try {
            const userBeingEdited = users.find(u => u.id === userId);
            if (!userBeingEdited) {
                throw new Error("User not found for update.");
            }

            const cleanedData = { ...data };
            // Normalize tenant sentinel from form to persist correctly
            if (cleanedData.tenant_id === 'no-client') {
                cleanedData.tenant_id = null;
            }
            
            // Parse full_name into first_name/last_name for proper database storage
            if (cleanedData.full_name) {
                const parts = cleanedData.full_name.trim().split(/\s+/);
                cleanedData.first_name = parts[0] || '';
                cleanedData.last_name = parts.slice(1).join(' ') || '';
                cleanedData.display_name = cleanedData.full_name;
                delete cleanedData.full_name;
            }

            // Build permissions object
            const permissionsToSave = {
                ...userBeingEdited.permissions,
                ...cleanedData.permissions,
            };

            // Set intended_role based on actual Base44 role
            if (userBeingEdited.role === 'admin' || userBeingEdited.role === 'superadmin') {
                permissionsToSave.intended_role = userBeingEdited.role;
            } else {
                permissionsToSave.intended_role = 'user';
            }

            const finalUpdateData = {
                tenant_id: cleanedData.tenant_id,
                first_name: cleanedData.first_name,
                last_name: cleanedData.last_name,
                display_name: cleanedData.display_name,
                is_active: cleanedData.is_active,
                tags: cleanedData.tags,
                employee_role: cleanedData.employee_role,
                permissions: permissionsToSave,
                navigation_permissions: cleanedData.navigation_permissions, // Top-level is the source of truth
            };

            console.log('[EnhancedUserManagement] Final update payload for User.update:', JSON.stringify(finalUpdateData, null, 2));

            await User.update(userId, finalUpdateData);
            
            toast.success("User updated successfully!");
            setEditingUser(null);
            
            await loadData();
            
            setTimeout(() => {
                window.location.reload();
            }, 1000);
            
        } catch (error) {
            console.error("Error updating user:", error);
            toast.error(`Failed to update user: ${error.message || 'An unknown error occurred.'}`);
        }
    };

    const handleInviteSuccess = () => {
        loadData();
    };

    const handleDeleteUser = (user) => {
        // Check permissions
        if (!canDeleteUser(currentUser, user)) {
            toast.error("You do not have permission to delete this user");
            return;
        }

        // Open confirmation dialog
        setUserToDelete(user);
        setDeleteConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!userToDelete) return;

        try {
            const response = await deleteUser(userToDelete.id, userToDelete.tenant_id, currentUser);
            
            if (response.status === 200) {
                toast.success(`User ${userToDelete.email} has been deleted`);
                setDeleteConfirmOpen(false);
                setUserToDelete(null);
                await loadData(); // Refresh user list
            } else {
                toast.error(`Failed to delete user: ${response.data?.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error("Error deleting user:", error);
            toast.error(`Failed to delete user: ${error.message}`);
        }
    };

    // Simplified role display
    const getRoleDisplay = (user) => {
        const role = user.role?.toLowerCase();
        if (role === 'superadmin') return 'Super Admin';
        if (role === 'admin') return 'Tenant Admin';
        if (user.employee_role === 'manager') return 'Manager';
        return 'Employee';
    };

    // Simplified role badge class
    const getRoleBadgeClass = (user) => {
        const role = user.role?.toLowerCase();
        if (user.status === 'inactive') return 'bg-red-100 text-red-800';
        if (role === 'admin' || role === 'superadmin') return 'bg-purple-100 text-purple-800';
        if (user.employee_role === 'manager') return 'bg-blue-100 text-blue-800';
        return 'bg-gray-100 text-gray-800';
    };

    const filteredUsers = users.filter(user => {
        // Only show global users (from users table), not employees
        if (user.user_type !== 'global') {
            return false;
        }

        const matchesSearch = searchTerm === '' ||
            user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase());

        let matchesRoleFilter = true;
        if (roleFilter !== 'all') {
            const userRole = user.role?.toLowerCase();
            if (roleFilter === 'superadmin') {
                matchesRoleFilter = userRole === 'superadmin';
            } else if (roleFilter === 'admin') {
                matchesRoleFilter = userRole === 'admin';
            } else if (roleFilter === 'power-user') {
                // Map 'power-user' filter to 'manager' employee_role for non-admins
                matchesRoleFilter = user.employee_role === 'manager' && userRole !== 'admin' && userRole !== 'superadmin';
            } else if (roleFilter === 'user') {
                // Map 'user' filter to 'employee' employee_role for non-admins
                matchesRoleFilter = user.employee_role === 'employee' && userRole !== 'admin' && userRole !== 'superadmin';
            }
        }
        return matchesSearch && matchesRoleFilter;
    });

    if (loading) {
        return (
            <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-slate-100">User Management</CardTitle>
                            <CardDescription className="text-slate-400">Manage user accounts, roles, and permissions</CardDescription>
                        </div>
                        <Button onClick={() => setInviteModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Add User
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-3">
                <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                        <p className="font-medium text-blue-200">Role Hierarchy</p>
                        <p className="text-blue-300">Admin (App Owner) → Manager (CRM Tenant Visibility) → Employee (CRM Own Records)</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Input
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 w-full sm:w-64 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                        />
                    </div>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="w-full sm:w-40 bg-slate-700 border-slate-600 text-slate-200">
                            <SelectValue placeholder="Filter by role" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="all" className="text-slate-200 hover:bg-slate-700">All Roles</SelectItem>
                            <SelectItem value="superadmin" className="text-slate-200 hover:bg-slate-700">Super Admin</SelectItem>
                            <SelectItem value="admin" className="text-slate-200 hover:bg-slate-700">Admin</SelectItem>
                            <SelectItem value="power-user" className="text-slate-200 hover:bg-slate-700">Manager</SelectItem>
                            <SelectItem value="user" className="text-slate-200 hover:bg-slate-700">Employee</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={refreshUsers} className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </div>

            <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-700 hover:bg-slate-700/50">
                                    <TableHead className="text-slate-300">Name</TableHead>
                                    <TableHead className="text-slate-300">Role</TableHead>
                                    <TableHead className="text-slate-300">Client</TableHead>
                                    <TableHead className="text-slate-300">Tenant ID</TableHead>
                                    <TableHead className="text-slate-300">Account Status</TableHead>
                                    <TableHead className="hidden md:table-cell text-slate-300">Live Status</TableHead>
                                    <TableHead className="hidden lg:table-cell text-slate-300">Last Login</TableHead>
                                    <TableHead className="text-right text-slate-300">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                                            No users found matching your criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredUsers.map((user) => {
                                        const tenant = allTenants.find(t => t.tenant_id === user.tenant_id);
                                        const isCreator = currentUser && user.id === currentUser.id && user.role === 'superadmin';
                                        
                                        // managerCanEdit now only checks for admin role to edit specific permissions
                                        const managerCanEdit = (currentUser?.role === 'admin' || currentUser?.role === 'superadmin');

                                        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                                        const lastActivity = user.last_seen || user.last_login;
                                        let statusColor, statusText;

                                        if (!lastActivity && user.is_active) {
                                            statusColor = 'bg-amber-500';
                                            statusText = 'Invited';
                                        } else if (user.is_active && lastActivity && new Date(lastActivity) > oneHourAgo) {
                                            statusColor = 'bg-green-500';
                                            statusText = 'Online';
                                        } else if (!user.is_active) {
                                            statusColor = 'bg-red-400';
                                            statusText = 'Inactive';
                                        } else {
                                            statusColor = 'bg-slate-400';
                                            statusText = 'Offline';
                                        }

                                        return (
                                            <TableRow key={user.id} className="border-slate-700 hover:bg-slate-700/50">
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center">
                                                                <span className="text-base font-medium text-slate-200">
                                                                    {(user.display_name || user.full_name)?.charAt(0)?.toUpperCase() || 'U'}
                                                                </span>
                                                            </div>
                                                            <span className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ${statusColor} ring-2 ring-slate-800`} />
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-slate-100">
                                                                {user.display_name || user.full_name || 'Unknown User'}
                                                            </div>
                                                            <div className="text-sm text-slate-400">{user.email}</div>
                                                            <div className="text-xs text-slate-500 font-mono mt-0.5">{user.id}</div>
                                                        </div>
                                                    </div>
                                                    {isCreator && (
                                                        <Badge variant="outline" className="bg-amber-900/30 border-amber-700/50 text-amber-300 text-xs mt-1">
                                                            <ShieldCheck className="w-3 h-3 mr-1" />
                                                            Creator
                                                        </Badge>
                                                    )}
                                                    {user.tags && user.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {user.tags.map((tag, tagIndex) => (
                                                                <Badge key={tagIndex} variant="outline" className="text-xs px-1.5 py-0.5 bg-slate-700 border-slate-600 text-slate-300">
                                                                    {tag}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={getRoleBadgeClass(user)}>
                                                        {getRoleDisplay(user)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {user.tenant_id ? (
                                                        <Badge variant="outline" className="bg-slate-700 border-slate-600 text-slate-300">
                                                            {tenant?.name || 'Unknown Client'}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="bg-slate-600 text-slate-300">No Client</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {user.tenant_id ? (
                                                        <div className="flex items-center gap-1">
                                                            <code className="text-xs text-cyan-400 bg-slate-900/50 px-2 py-1 rounded font-mono">
                                                                {user.tenant_id.substring(0, 8)}...
                                                            </code>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6"
                                                                onClick={() => copyToClipboard(user.tenant_id, 'Tenant ID')}
                                                            >
                                                                <Copy className="h-3 w-3 text-slate-400 hover:text-slate-200" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-500">N/A</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={user.is_active ? "default" : "secondary"} className={user.is_active ? "bg-green-600 text-white" : "bg-slate-600 text-slate-300"}>
                                                        {user.is_active ? "Active" : "Inactive"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                                                        <span className="text-sm text-slate-300">{statusText}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell text-slate-300">
                                                    {lastActivity ?
                                                        format(new Date(lastActivity), "PPpp") :
                                                        'Never'
                                                    }
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex gap-2 justify-end">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setEditingUser(user)}
                                                            disabled={!managerCanEdit}
                                                            className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600 disabled:opacity-60"
                                                        >
                                                            <Edit className="w-4 h-4 mr-1" />
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleDeleteUser(user)}
                                                            disabled={!canDeleteUser(currentUser, user)}
                                                            className="bg-red-700 border-red-600 text-red-100 hover:bg-red-600 disabled:opacity-60"
                                                        >
                                                            <Trash2 className="w-4 h-4 mr-1" />
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {editingUser && (
                <UserFormModal
                    user={editingUser}
                    tenants={allTenants}
                    currentUser={currentUser}
                    onSave={handleSaveUser}
                    onCancel={() => setEditingUser(null)}
                />
            )}

            <InviteUserDialog
                open={isInviteModalOpen}
                onOpenChange={setInviteModalOpen}
                onSuccess={handleInviteSuccess}
                tenants={allTenants}
                currentUser={currentUser}
            />

            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent className="bg-slate-800 border-slate-700">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-400 flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            Delete User
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-300">
                            Are you sure you want to permanently delete this user?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {userToDelete && (
                        <div className="space-y-3 px-6">
                            <div className="p-3 bg-slate-900 rounded border border-slate-700 text-sm">
                                <div className="text-slate-300"><strong className="text-slate-200">Name:</strong> {userToDelete.full_name || userToDelete.display_name || 'N/A'}</div>
                                <div className="text-slate-300"><strong className="text-slate-200">Email:</strong> {userToDelete.email}</div>
                                <div className="text-slate-300"><strong className="text-slate-200">Role:</strong> {getRoleDisplay(userToDelete)}</div>
                                <div className="text-slate-300"><strong className="text-slate-200">Tenant:</strong> {userToDelete.tenant_id || 'No Tenant'}</div>
                            </div>
                            <div className="text-yellow-400 font-semibold text-sm">⚠️ This action cannot be undone.</div>
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={confirmDelete} 
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            Delete User
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
