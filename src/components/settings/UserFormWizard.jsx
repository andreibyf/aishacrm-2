import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  User,
  Users,
  Shield,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
  Eye,
  Edit3,
  Settings,
  Mail,
  BarChart3,
  UserCog,
  LayoutDashboard,
  Contact,
  Building2,
  Target,
  Briefcase,
  Calendar,
  Activity,
  FileText,
  Workflow,
  Menu,
  Copy,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';

const BACKEND_URL = getBackendUrl();

const EMPLOYEE_ROLE_LABELS = {
  director: 'Director',
  manager: 'Manager',
  employee: 'Employee',
  leadership: 'Leadership', // Legacy support
};

const getEmployeeRoleLabel = (role) =>
  role ? EMPLOYEE_ROLE_LABELS[role] || 'User' : 'User';

const STEPS = [
  { key: 'identity', label: 'Identity', icon: User },
  { key: 'teams', label: 'Teams', icon: Users },
  { key: 'permissions', label: 'Permissions', icon: Shield },
  { key: 'navigation', label: 'Navigation', icon: Menu },
  { key: 'review', label: 'Review', icon: Check },
];

const ACCESS_LEVELS = [
  { key: 'view_own', label: 'View own records', desc: 'Only see records assigned to them' },
  { key: 'view_team', label: 'View team records', desc: 'See all records assigned to this team' },
  { key: 'manage_team', label: 'Manage team', desc: 'Edit team records, assign work to members' },
];

// Navigation modules that can be toggled
// These should match the navItems in Layout.jsx
const NAV_MODULES = [
  // Primary navigation
  { key: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Home dashboard with overview stats' },
  { key: 'Contacts', label: 'Contacts', icon: Contact, description: 'Customer contacts management' },
  { key: 'Accounts', label: 'Accounts', icon: Building2, description: 'Company and organization accounts' },
  { key: 'Leads', label: 'Leads', icon: Target, description: 'Sales leads and prospects' },
  { key: 'Opportunities', label: 'Opportunities', icon: Briefcase, description: 'Sales pipeline and deals' },
  { key: 'Activities', label: 'Activities', icon: Activity, description: 'Calls, meetings, tasks, and notes' },
  { key: 'Communications', label: 'Communications', icon: Mail, description: 'Inbox and email thread management' },
  { key: 'Calendar', label: 'Calendar', icon: Calendar, description: 'Scheduled events and reminders' },
  { key: 'ConstructionProjects', label: 'Project Management', icon: Briefcase, description: 'Project and construction management' },
  { key: 'Workers', label: 'Workers', icon: Users, description: 'Contractors and temp labor management' },
  { key: 'BizDevSources', label: 'Potential Leads', icon: FileText, description: 'Business development lead sources' },
  { key: 'CashFlow', label: 'Cash Flow', icon: BarChart3, description: 'Financial cash flow tracking' },
  { key: 'DocumentProcessing', label: 'Document Processing', icon: FileText, description: 'AI document processing' },
  { key: 'DocumentManagement', label: 'Document Management', icon: FileText, description: 'File storage and management' },
  { key: 'AICampaigns', label: 'AI Campaigns', icon: Target, description: 'AI-powered marketing campaigns' },
  { key: 'AISuggestions', label: 'AI Suggestions', icon: Sparkles, description: 'Review and approve AI-generated email drafts' },
  { key: 'Employees', label: 'Employees', icon: Users, description: 'Employee directory and management' },
  { key: 'Reports', label: 'Reports', icon: BarChart3, description: 'Analytics and reporting dashboards' },
  { key: 'Integrations', label: 'Integrations', icon: Settings, description: 'Third-party integrations' },
  { key: 'Workflows', label: 'Workflows', icon: Workflow, description: 'Automation and workflow builder' },
  { key: 'PaymentPortal', label: 'Payment Portal', icon: BarChart3, description: 'Payment processing portal' },
  { key: 'Utilities', label: 'Utilities', icon: Settings, description: 'System utilities' },
  { key: 'ClientOnboarding', label: 'Client Onboarding', icon: Users, description: 'New client onboarding' },
  // Secondary navigation
  { key: 'Documentation', label: 'Documentation', icon: FileText, description: 'Help and documentation' },
  { key: 'DeveloperAI', label: 'Developer AI', icon: Settings, description: 'Developer tools and AI' },
  { key: 'ClientRequirements', label: 'Client Requirements', icon: FileText, description: 'Client requirement tracking' },
  { key: 'Settings', label: 'Settings', icon: Settings, description: 'System configuration and preferences' },
];

// Default nav permissions - most things enabled by default
// Keys must match the href values in Layout.jsx navItems
const DEFAULT_NAV_PERMISSIONS = {
  // Core CRM modules - on by default
  Dashboard: true,
  Contacts: true,
  Accounts: true,
  Leads: true,
  Opportunities: true,
  Activities: true,
  Communications: true,
  Calendar: true,
  BizDevSources: true,
  // Industry-specific modules - on by default
  ConstructionProjects: true,
  Workers: true,
  CashFlow: true,
  DocumentProcessing: true,
  DocumentManagement: true,
  AICampaigns: true,
  AISuggestions: true,
  PaymentPortal: true,
  // Admin/restricted modules - off by default
  Employees: false, // Off by default - requires perm_employees
  Reports: false, // Off by default - requires perm_reports
  Integrations: false, // Off by default - typically admin only
  Workflows: false, // Off by default - typically admin only
  Utilities: false, // Off by default - typically admin only
  ClientOnboarding: false, // Off by default - typically admin only
  // Secondary nav - off by default
  Documentation: true,
  DeveloperAI: false, // Off by default - developer only
  ClientRequirements: false, // Off by default - admin only
  Settings: false, // Off by default - requires perm_settings
};

/**
 * UserFormWizard - 5-step wizard for creating/editing users
 * 
 * Props:
 *   open: boolean - whether dialog is open
 *   user: object|null - existing user to edit, or null for create mode
 *   mode: 'create'|'edit' - explicit mode (defaults to 'edit' if user.id exists)
 *   tenants: array - available tenants
 *   currentUser: object - the logged-in user
 *   onSave: function(userId, data) - called on save (userId is null for create)
 *   onCancel: function - called on cancel
 *   availableTeams: array - teams to show in step 2
 *   existingTeamMemberships: array - current memberships for edit mode
 */
export default function UserFormWizard({
  open = false,
  user,
  mode,
  tenants = [],
  currentUser,
  onSave,
  onCancel,
  availableTeams = [],
  existingTeamMemberships = [],
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deletingTeams, setDeletingTeams] = useState(false);
  
  // Determine if this is create or edit mode
  const isEdit = mode === 'edit' || (mode === undefined && !!user?.id);
  const isCreate = !isEdit;

  // Form state
  const [form, setForm] = useState({
    // Identity
    full_name: '',
    email: '',
    tenant_id: currentUser?.tenant_id || null,
    employee_role: 'employee',
    is_active: true,
    
    // Teams: { [teamId]: { selected: bool, access_level: string } }
    teams: {},
    
    // Org-wide permissions
    perm_notes_anywhere: true,
    perm_all_records: false,
    perm_reports: false,
    perm_employees: false,
    perm_settings: false,
    
    // Navigation permissions
    nav_permissions: { ...DEFAULT_NAV_PERMISSIONS },
    
    // Password (required for create, optional for edit)
    password: '',
  });

  // Initialize form when dialog opens or user prop changes
  useEffect(() => {
    if (!open) return;
    
    if (isEdit && user) {
      // Edit mode - populate from existing user
      const teamsObj = {};
      existingTeamMemberships.forEach((tm) => {
        teamsObj[tm.team_id] = {
          selected: true,
          access_level: tm.access_level || 'view_own',
        };
      });

      // Merge existing nav_permissions with defaults
      const existingNavPerms = user.nav_permissions || {};
      const mergedNavPerms = { ...DEFAULT_NAV_PERMISSIONS };
      Object.keys(existingNavPerms).forEach((key) => {
        if (key in mergedNavPerms) {
          mergedNavPerms[key] = existingNavPerms[key];
        }
      });

      setForm({
        full_name: user.display_name || user.full_name || '',
        email: user.email || '',
        tenant_id: user.tenant_id || null,
        employee_role: user.employee_role || 'employee',
        is_active: user.is_active !== false,
        teams: teamsObj,
        perm_notes_anywhere: user.perm_notes_anywhere ?? true,
        perm_all_records: user.perm_all_records ?? false,
        perm_reports: user.perm_reports ?? false,
        perm_employees: user.perm_employees ?? false,
        perm_settings: user.perm_settings ?? false,
        nav_permissions: mergedNavPerms,
        password: '',
      });
    } else {
      // Create mode - reset to defaults
      setForm({
        full_name: '',
        email: '',
        tenant_id: currentUser?.tenant_id || null,
        employee_role: 'employee',
        is_active: true,
        teams: {},
        perm_notes_anywhere: true,
        perm_all_records: false,
        perm_reports: false,
        perm_employees: false,
        perm_settings: false,
        nav_permissions: { ...DEFAULT_NAV_PERMISSIONS },
        password: '',
      });
    }
    setStep(0);
  }, [open, user, isEdit, existingTeamMemberships, currentUser?.tenant_id]);

  // Auto-sync nav permissions with org-wide permissions
  useEffect(() => {
    setForm((prev) => {
      const newNavPerms = { ...prev.nav_permissions };
      let changed = false;
      
      // If they have perm_reports, force-enable Reports nav
      if (prev.perm_reports && !newNavPerms.Reports) {
        newNavPerms.Reports = true;
        changed = true;
      }
      // If they have perm_employees, force-enable Employees nav
      if (prev.perm_employees && !newNavPerms.Employees) {
        newNavPerms.Employees = true;
        changed = true;
      }
      // If they have perm_settings, force-enable Settings nav
      if (prev.perm_settings && !newNavPerms.Settings) {
        newNavPerms.Settings = true;
        changed = true;
      }
      
      return changed ? { ...prev, nav_permissions: newNavPerms } : prev;
    });
  }, [form.perm_reports, form.perm_employees, form.perm_settings]);

  // Derived role based on permissions
  const derivedRole = useMemo(() => {
    if (form.perm_settings || form.perm_employees) return 'Admin';
    if (form.perm_all_records || form.perm_reports) return 'Leadership';
    return 'User';
  }, [form.perm_settings, form.perm_employees, form.perm_all_records, form.perm_reports]);

  // Selected teams
  const selectedTeams = useMemo(() => {
    return availableTeams.filter((t) => form.teams[t.id]?.selected);
  }, [availableTeams, form.teams]);

  // Enabled nav modules
  const enabledNavModules = useMemo(() => {
    return NAV_MODULES.filter((m) => form.nav_permissions[m.key]);
  }, [form.nav_permissions]);

  // Validation
  const canProceed = () => {
    if (step === 0) {
      if (!form.full_name.trim()) return false;
      if (isCreate && !form.email.trim()) return false;
      if (isCreate && !form.password.trim()) return false;
      // Basic email validation
      if (isCreate && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return false;
      return true;
    }
    return true;
  };

  // Toggle team selection
  const toggleTeam = (teamId) => {
    setForm((prev) => ({
      ...prev,
      teams: {
        ...prev.teams,
        [teamId]: {
          selected: !prev.teams[teamId]?.selected,
          access_level: prev.teams[teamId]?.access_level || 'view_own',
        },
      },
    }));
  };

  // Set team access level
  const setTeamAccess = (teamId, level) => {
    setForm((prev) => ({
      ...prev,
      teams: {
        ...prev.teams,
        [teamId]: {
          ...prev.teams[teamId],
          access_level: level,
        },
      },
    }));
  };

  // Toggle permission
  const togglePerm = (key) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Toggle nav permission
  const toggleNavPerm = (key) => {
    setForm((prev) => ({
      ...prev,
      nav_permissions: {
        ...prev.nav_permissions,
        [key]: !prev.nav_permissions[key],
      },
    }));
  };

  // Delete selected teams permanently
  const handleDeleteSelectedTeams = async () => {
    const selectedIds = availableTeams
      .filter((t) => form.teams[t.id]?.selected)
      .map((t) => t.id);
    if (selectedIds.length === 0) return;

    const names = availableTeams
      .filter((t) => selectedIds.includes(t.id))
      .map((t) => t.name)
      .join(', ');

    if (!window.confirm(`Permanently delete ${selectedIds.length} team(s)?\n\n${names}\n\nThis cannot be undone.`)) return;

    setDeletingTeams(true);
    let deleted = 0;
    const failed = [];
    const tenantId = form.tenant_id || user?.tenant_id || currentUser?.tenant_id;
    for (const id of selectedIds) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/v2/teams/${id}?hard=true${tenantId ? `&tenant_id=${tenantId}` : ''}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (res.ok) {
          deleted++;
          // Remove from form state
          setForm((prev) => {
            const teams = { ...prev.teams };
            delete teams[id];
            return { ...prev, teams };
          });
        } else {
          let reason = `HTTP ${res.status}`;
          try { const body = await res.json(); reason = body?.error || reason; } catch (_) {}
          failed.push(reason);
        }
      } catch (err) {
        console.error('Delete team error:', err);
        failed.push(err.message || 'Network error');
      }
    }
    setDeletingTeams(false);
    if (deleted > 0) toast.success(`Deleted ${deleted} team(s)`);
    if (failed.length > 0) toast.error(`${failed.length} team(s) could not be deleted: ${failed.join('; ')}`);
    // Refresh available teams via parent — signal via a custom event
    window.dispatchEvent(new CustomEvent('aisha:teams-changed'));
  };

  // Generate plain English summary
  const generateSummary = () => {
    const parts = [];
    
    // Teams
    if (selectedTeams.length === 0) {
      parts.push('has no team assignments');
    } else if (selectedTeams.length === 1) {
      const team = selectedTeams[0];
      const access = form.teams[team.id]?.access_level || 'view_own';
      const accessLabel = ACCESS_LEVELS.find((a) => a.key === access)?.label.toLowerCase() || access;
      parts.push(`is on the ${team.name} team and can ${accessLabel}`);
    } else {
      parts.push(`is on ${selectedTeams.length} teams`);
    }

    // Permissions
    const perms = [];
    if (form.perm_notes_anywhere) perms.push('add notes anywhere');
    if (form.perm_all_records) perms.push('view all records');
    if (form.perm_reports) perms.push('access reports');
    if (form.perm_employees) perms.push('manage employees');
    if (form.perm_settings) perms.push('configure settings');

    if (perms.length > 0) {
      parts.push(`They can ${perms.join(', ')}`);
    }

    // Navigation
    const navCount = enabledNavModules.length;
    parts.push(`They have access to ${navCount} navigation module${navCount !== 1 ? 's' : ''}`);

    return parts;
  };

  // Handle save
  const handleSave = async () => {
    setSaving(true);
    try {
      // Build team memberships array
      const teamMemberships = Object.entries(form.teams)
        .filter(([_, config]) => config.selected)
        .map(([teamId, config]) => ({
          team_id: teamId,
          access_level: config.access_level || 'view_own',
        }));

      if (isCreate) {
        // Create new user via backend
        const createPayload = {
          email: form.email.toLowerCase().trim(),
          full_name: form.full_name.trim(),
          password: form.password,
          tenant_id: form.tenant_id,
          employee_role: form.employee_role,
          is_active: form.is_active,
          perm_notes_anywhere: form.perm_notes_anywhere,
          perm_all_records: form.perm_all_records,
          perm_reports: form.perm_reports,
          perm_employees: form.perm_employees,
          perm_settings: form.perm_settings,
          nav_permissions: form.nav_permissions,
          team_memberships: teamMemberships,
        };

        const res = await fetch(`${BACKEND_URL}/api/users/invite`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Failed to create user');
        }

        const result = await res.json();
        
        // Sync team memberships if we have a user_id
        if (result.user?.id && teamMemberships.length > 0) {
          await fetch(`${BACKEND_URL}/api/v2/teams/sync-user-memberships`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: result.user.id,
              memberships: teamMemberships,
            }),
          });
        }

        toast.success('User created successfully');
        onSave(null, { ...createPayload, id: result.user?.id });
      } else {
        // Edit existing user
        const saveData = {
          full_name: form.full_name,
          tenant_id: form.tenant_id,
          employee_role: form.employee_role,
          is_active: form.is_active,
          perm_notes_anywhere: form.perm_notes_anywhere,
          perm_all_records: form.perm_all_records,
          perm_reports: form.perm_reports,
          perm_employees: form.perm_employees,
          perm_settings: form.perm_settings,
          nav_permissions: form.nav_permissions,
          team_memberships: teamMemberships,
        };

        if (form.password?.trim()) {
          saveData.new_password = form.password;
        }

        await onSave(user.id, saveData);
        toast.success('User updated successfully');
      }
    } catch (error) {
      console.error('Error saving user:', error);
      toast.error(error.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  // Step indicator
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-1 mb-6">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const isActive = i === step;
        const isComplete = i < step;
        // In edit mode all steps are immediately reachable; in create mode only up to current
        const isClickable = isEdit || i <= step;

        return (
          <div key={s.key} className="flex items-center">
            <button
              type="button"
              disabled={!isClickable}
              aria-disabled={!isClickable}
              onClick={() => isClickable && setStep(i)}
              title={isClickable ? `Go to ${s.label}` : `Complete previous steps first`}
              className={`
                flex items-center justify-center w-8 h-8 rounded-full transition-all
                ${isActive ? 'bg-blue-600 text-white' : ''}
                ${isComplete ? 'bg-green-600 text-white hover:bg-green-500' : ''}
                ${!isActive && !isComplete ? 'bg-slate-700 text-slate-400' : ''}
                ${isClickable && !isActive ? 'hover:opacity-80 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800' : ''}
                ${!isClickable ? 'cursor-not-allowed opacity-50' : ''}
                ${isActive ? 'cursor-default' : ''}
              `}
            >
              {isComplete ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-6 h-0.5 mx-0.5 ${i < step ? 'bg-green-600' : 'bg-slate-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto bg-slate-800 border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-100">
            {isEdit ? 'Edit User' : 'Add New User'}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {STEPS[step].label} — Step {step + 1} of {STEPS.length}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        <div className="min-h-[400px]">
          {/* Step 0: Identity */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-1">Basic Information</h3>
                <p className="text-sm text-slate-400">
                  {isCreate ? 'Enter the new user\'s details' : 'Update user identity details'}
                </p>
              </div>

              <div className="space-y-4">
                {/* Email - editable only in create mode */}
                <div>
                  <Label htmlFor="email" className="text-slate-200">
                    Email {isCreate && <span className="text-red-400">*</span>}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    disabled={isEdit}
                    placeholder="user@company.com"
                    className={`bg-slate-900 border-slate-600 ${isEdit ? 'text-slate-400' : 'text-slate-200'}`}
                  />
                  {isEdit && (
                    <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
                  )}
                </div>

                {/* System IDs - edit mode only */}
                {isEdit && user?.id && (
                  <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">System Identifiers</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">User ID:</span>
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-slate-300 bg-slate-800 px-2 py-0.5 rounded font-mono">
                          {user.id}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(user.id);
                            toast.success('User ID copied');
                          }}
                          className="text-slate-400 hover:text-slate-200"
                          title="Copy User ID"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {user.metadata?.employee_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Employee ID:</span>
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-slate-300 bg-slate-800 px-2 py-0.5 rounded font-mono">
                            {user.metadata.employee_id}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(user.metadata.employee_id);
                              toast.success('Employee ID copied');
                            }}
                            className="text-slate-400 hover:text-slate-200"
                            title="Copy Employee ID"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Full Name */}
                <div>
                  <Label htmlFor="full_name" className="text-slate-200">
                    Full Name <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="full_name"
                    value={form.full_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
                    placeholder="John Smith"
                    className="bg-slate-900 border-slate-600 text-slate-200"
                  />
                </div>

                {/* Password - required for create, optional for edit */}
                <div>
                  <Label htmlFor="password" className="text-slate-200">
                    {isCreate ? 'Password' : 'Reset Password (optional)'}
                    {isCreate && <span className="text-red-400"> *</span>}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder={isCreate ? 'Enter password' : 'Leave blank to keep current'}
                    className="bg-slate-900 border-slate-600 text-slate-200"
                  />
                  {isCreate && (
                    <p className="text-xs text-slate-500 mt-1">
                      Minimum 8 characters with uppercase, lowercase, number, and special character
                    </p>
                  )}
                </div>

                {/* Client/Tenant - superadmin only */}
                {currentUser?.role === 'superadmin' && (
                  <div>
                    <Label htmlFor="tenant_id" className="text-slate-200">Client</Label>
                    <Select
                      value={form.tenant_id || 'no-client'}
                      onValueChange={(v) => setForm((prev) => ({ ...prev, tenant_id: v === 'no-client' ? null : v }))}
                    >
                      <SelectTrigger className="bg-slate-900 border-slate-600 text-slate-200">
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                        <SelectItem value="no-client">No Client</SelectItem>
                        {tenants.map((t) => (
                          <SelectItem key={t.id} value={t.tenant_id || t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* CRM Role */}
                <div>
                  <Label htmlFor="employee_role" className="text-slate-200">CRM Role</Label>
                  <Select
                    value={form.employee_role}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, employee_role: v }))}
                  >
                    <SelectTrigger className="bg-slate-900 border-slate-600 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                      <SelectItem value="employee">User</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="director">Director</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-1">
                    Controls default data visibility scope
                  </p>
                </div>

                {/* Account Active */}
                <div className="flex items-center gap-3">
                  <Switch
                    id="is_active"
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm((prev) => ({ ...prev, is_active: v }))}
                  />
                  <Label htmlFor="is_active" className="text-slate-200">Account Active</Label>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Teams */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-1">Team Assignments</h3>
                <p className="text-sm text-slate-400">
                  Select teams and set access level for each
                </p>
              </div>

              {availableTeams.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No teams available</p>
                  <p className="text-sm">Create teams in Team Management first, or skip this step</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Select all / Deselect all + bulk delete */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="wizard-select-all-teams"
                        checked={availableTeams.length > 0 && availableTeams.every((t) => form.teams[t.id]?.selected)}
                        onCheckedChange={(checked) => {
                          setForm((prev) => {
                            const updated = { ...prev.teams };
                            availableTeams.forEach((t) => {
                              updated[t.id] = {
                                selected: !!checked,
                                access_level: prev.teams[t.id]?.access_level || 'view_own',
                              };
                            });
                            return { ...prev, teams: updated };
                          });
                        }}
                        className="border-slate-500"
                      />
                      <label htmlFor="wizard-select-all-teams" className="text-xs text-slate-400 cursor-pointer select-none">
                        {availableTeams.every((t) => form.teams[t.id]?.selected) && availableTeams.length > 0
                          ? `All ${availableTeams.length} selected`
                          : `Select all`}
                      </label>
                    </div>
                    {availableTeams.some((t) => form.teams[t.id]?.selected) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleDeleteSelectedTeams}
                        disabled={deletingTeams}
                        className="h-7 px-2 text-xs bg-red-700 hover:bg-red-600"
                      >
                        {deletingTeams ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="w-3 h-3 mr-1" />
                        )}
                        Delete {availableTeams.filter((t) => form.teams[t.id]?.selected).length} team(s)
                      </Button>
                    )}
                  </div>

                  {availableTeams.map((team) => {
                    const isSelected = form.teams[team.id]?.selected;
                    const accessLevel = form.teams[team.id]?.access_level || 'view_own';

                    return (
                      <div
                        key={team.id}
                        className={`
                          rounded-lg border transition-all
                          ${isSelected ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-900'}
                        `}
                      >
                        {/* Team header - clickable to toggle */}
                        <div
                          onClick={() => toggleTeam(team.id)}
                          className="flex items-center gap-3 p-4 cursor-pointer"
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleTeam(team.id)}
                            className="border-slate-500"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-slate-200">{team.name}</div>
                            {team.description && (
                              <div className="text-sm text-slate-400">{team.description}</div>
                            )}
                          </div>
                        </div>

                        {/* Access level options - shown when selected */}
                        {isSelected && (
                          <div className="px-4 pb-4 pt-2 border-t border-slate-700/50">
                            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                              Access Level
                            </div>
                            <div className="space-y-2">
                              {ACCESS_LEVELS.map((level) => (
                                <div
                                  key={level.key}
                                  onClick={() => setTeamAccess(team.id, level.key)}
                                  className={`
                                    flex items-center gap-3 p-3 rounded-md cursor-pointer transition-all
                                    ${accessLevel === level.key 
                                      ? 'bg-blue-600/20 border border-blue-500' 
                                      : 'bg-slate-800 border border-slate-700 hover:border-slate-600'}
                                  `}
                                >
                                  <div
                                    className={`
                                      w-4 h-4 rounded-full border-2 flex items-center justify-center
                                      ${accessLevel === level.key ? 'border-blue-500 bg-blue-500' : 'border-slate-500'}
                                    `}
                                  >
                                    {accessLevel === level.key && (
                                      <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-slate-200">{level.label}</div>
                                    <div className="text-xs text-slate-400">{level.desc}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Permissions */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-1">Organization-wide Powers</h3>
                <p className="text-sm text-slate-400">
                  These permissions apply beyond their team assignments
                </p>
              </div>

              <div className="space-y-3">
                <PermissionCard
                  icon={<Edit3 className="w-5 h-5" />}
                  title="Add notes anywhere"
                  description="Can add notes to any record they can view"
                  checked={form.perm_notes_anywhere}
                  onChange={() => togglePerm('perm_notes_anywhere')}
                />
                <PermissionCard
                  icon={<Eye className="w-5 h-5" />}
                  title="View all records"
                  description="Can see records from all teams, not just their assigned teams"
                  checked={form.perm_all_records}
                  onChange={() => togglePerm('perm_all_records')}
                />
                <PermissionCard
                  icon={<BarChart3 className="w-5 h-5" />}
                  title="Access reports & analytics"
                  description="Can view dashboards, run reports, and export data"
                  checked={form.perm_reports}
                  onChange={() => togglePerm('perm_reports')}
                />
                <PermissionCard
                  icon={<UserCog className="w-5 h-5" />}
                  title="Manage employees"
                  description="Can add/edit employee records, manage team assignments"
                  checked={form.perm_employees}
                  onChange={() => togglePerm('perm_employees')}
                />
                <PermissionCard
                  icon={<Settings className="w-5 h-5" />}
                  title="System settings"
                  description="Can configure tenant settings, integrations, and workflows"
                  checked={form.perm_settings}
                  onChange={() => togglePerm('perm_settings')}
                />
              </div>
            </div>
          )}

          {/* Step 3: Navigation */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-1">Navigation Access</h3>
                <p className="text-sm text-slate-400">
                  Choose which modules appear in the user's sidebar navigation
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {NAV_MODULES.map((module) => {
                  const Icon = module.icon;
                  const isEnabled = form.nav_permissions[module.key];
                  
                  // "Auto" just means this was force-enabled by an org-wide permission —
                  // user can still manually toggle it off if they choose
                  const autoForced = (
                    (module.key === 'Reports' && form.perm_reports) ||
                    (module.key === 'Employees' && form.perm_employees) ||
                    (module.key === 'Settings' && form.perm_settings)
                  );

                  return (
                    <div
                      key={module.key}
                      onClick={() => toggleNavPerm(module.key)}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer
                        ${isEnabled 
                          ? 'bg-blue-500/10 border-blue-500' 
                          : 'bg-slate-900 border-slate-700 hover:border-slate-600'}
                      `}
                    >
                      <div className={`p-2 rounded-md ${isEnabled ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${isEnabled ? 'text-slate-200' : 'text-slate-400'}`}>
                            {module.label}
                          </span>
                          {autoForced && (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">
                              Auto
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{module.description}</p>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleNavPerm(module.key)}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span>
                    Modules marked <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30 mx-1">Auto</Badge> 
                    were enabled based on organization-wide permissions. You can still toggle them off.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-1">Review and Confirm</h3>
                <p className="text-sm text-slate-400">
                  Make sure everything looks right before saving
                </p>
              </div>

              {/* Plain English Summary */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">
                    In Plain English
                  </span>
                </div>
                <p className="text-slate-200 leading-relaxed">
                  <strong>{form.full_name || 'This user'}</strong> {generateSummary().join('. ')}.
                </p>
              </div>

              {/* Structured Summary */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-5 space-y-4">
                <SummarySection title="Identity">
                  <SummaryItem label="Name" value={form.full_name} />
                  <SummaryItem label="Email" value={form.email} />
                  <SummaryItem
                    label="CRM Role"
                    value={getEmployeeRoleLabel(form.employee_role)}
                  />
                  <SummaryItem label="Status" value={form.is_active ? 'Active' : 'Inactive'} />
                </SummarySection>

                <SummarySection title="Team Access">
                  {selectedTeams.length === 0 ? (
                    <p className="text-sm text-slate-500 italic">No teams assigned</p>
                  ) : (
                    selectedTeams.map((team) => (
                      <SummaryItem
                        key={team.id}
                        label={team.name}
                        value={ACCESS_LEVELS.find((a) => a.key === form.teams[team.id]?.access_level)?.label || 'View own'}
                      />
                    ))
                  )}
                </SummarySection>

                <SummarySection title="Organization Powers">
                  {!form.perm_notes_anywhere && !form.perm_all_records && !form.perm_reports && !form.perm_employees && !form.perm_settings ? (
                    <p className="text-sm text-slate-500 italic">None — standard user access</p>
                  ) : (
                    <>
                      {form.perm_notes_anywhere && <SummaryItem label="Add notes anywhere" value="Yes" />}
                      {form.perm_all_records && <SummaryItem label="View all records" value="Yes" />}
                      {form.perm_reports && <SummaryItem label="Reports & analytics" value="Yes" />}
                      {form.perm_employees && <SummaryItem label="Manage employees" value="Yes" />}
                      {form.perm_settings && <SummaryItem label="System settings" value="Yes" />}
                    </>
                  )}
                </SummarySection>

                <SummarySection title="Navigation Modules">
                  <div className="flex flex-wrap gap-2">
                    {enabledNavModules.map((m) => (
                      <Badge key={m.key} variant="outline" className="text-xs bg-slate-800 text-slate-300 border-slate-600">
                        {m.label}
                      </Badge>
                    ))}
                    {enabledNavModules.length === 0 && (
                      <p className="text-sm text-slate-500 italic">No modules enabled</p>
                    )}
                  </div>
                </SummarySection>


              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t border-slate-700">
          <Button
            variant="outline"
            onClick={() => step === 0 ? onCancel() : setStep((s) => s - 1)}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isCreate ? 'Creating...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  {isCreate ? 'Create User' : 'Save Changes'}
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper components
function PermissionCard({ icon, title, description, checked, onChange }) {
  return (
    <div
      onClick={onChange}
      className={`
        flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-all
        ${checked 
          ? 'bg-blue-500/10 border-blue-500' 
          : 'bg-slate-900 border-slate-700 hover:border-slate-600'}
      `}
    >
      <div className="flex items-center gap-3">
        <div className={checked ? 'text-blue-400' : 'text-slate-500'}>
          {icon}
        </div>
        <div>
          <div className="font-medium text-slate-200">{title}</div>
          <div className="text-sm text-slate-400">{description}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SummarySection({ title, children }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}
