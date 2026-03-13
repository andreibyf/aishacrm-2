import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Briefcase,
  Copy,
  Edit,
  Link2,
  Loader2,
  Mail,
  Shield,
  User,
  Users,
  ExternalLink,
  Check,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';

const BACKEND_URL = getBackendUrl();

/**
 * UserViewPanel - Read-only view of a user's profile
 * Similar to EmployeeDetailPanel but for users
 */
export default function UserViewPanel({
  user,
  open,
  onOpenChange,
  onEdit,
}) {
  const [teamMemberships, setTeamMemberships] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [linkedEmployee, setLinkedEmployee] = useState(null);
  const [loadingEmployee, setLoadingEmployee] = useState(false);

  // Fetch team memberships for this user
  useEffect(() => {
    if (!open || !user?.id) {
      setTeamMemberships([]);
      return;
    }

    let mounted = true;
    const fetchTeams = async () => {
      setLoadingTeams(true);
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/v2/teams/user-memberships?user_id=${user.id}&tenant_id=${user.tenant_id}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          },
        );
        if (res.ok) {
          const json = await res.json();
          if (mounted) setTeamMemberships(json.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch team memberships:', error);
      } finally {
        if (mounted) setLoadingTeams(false);
      }
    };

    fetchTeams();
    return () => {
      mounted = false;
    };
  }, [open, user?.id, user?.tenant_id]);

  // Fetch linked employee for this user
  useEffect(() => {
    if (!open || !user?.id) {
      setLinkedEmployee(null);
      return;
    }

    let mounted = true;
    const fetchLinkedEmployee = async () => {
      setLoadingEmployee(true);
      try {
        // Query employees where metadata.linked_user_id matches this user
        const res = await fetch(
          `${BACKEND_URL}/api/employees?tenant_id=${user.tenant_id}&linked_user_id=${user.id}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          },
        );
        if (res.ok) {
          const data = await res.json();
          // The API returns employees filtered by linked_user_id
          if (mounted && data.length > 0) {
            setLinkedEmployee(data[0]);
          } else if (mounted) {
            setLinkedEmployee(null);
          }
        }
      } catch (error) {
        console.error('Failed to fetch linked employee:', error);
      } finally {
        if (mounted) setLoadingEmployee(false);
      }
    };

    fetchLinkedEmployee();
    return () => {
      mounted = false;
    };
  }, [open, user?.id, user?.tenant_id]);

  if (!user) return null;

  const getRoleBadge = (role) => {
    switch (role) {
      case 'superadmin':
        return <Badge className="bg-red-900/30 text-red-300 border-red-700">Superadmin</Badge>;
      case 'admin':
        return <Badge className="bg-purple-900/30 text-purple-300 border-purple-700">Admin</Badge>;
      case 'leadership':
        return <Badge className="bg-indigo-900/30 text-indigo-300 border-indigo-700">Leadership</Badge>;
      case 'manager':
        return <Badge className="bg-blue-900/30 text-blue-300 border-blue-700">Manager</Badge>;
      case 'employee':
        return <Badge className="bg-slate-700 text-slate-300 border-slate-600">User</Badge>;
      default:
        return <Badge className="bg-slate-700 text-slate-300 border-slate-600">{role || 'User'}</Badge>;
    }
  };

  const getAccessLevelBadge = (level) => {
    switch (level) {
      case 'view_own':
        return <Badge variant="outline" className="text-xs bg-slate-800 text-slate-300 border-slate-600">View Own</Badge>;
      case 'view_team':
        return <Badge variant="outline" className="text-xs bg-blue-900/30 text-blue-300 border-blue-700">View Team</Badge>;
      case 'manage_team':
        return <Badge variant="outline" className="text-xs bg-purple-900/30 text-purple-300 border-purple-700">Manage Team</Badge>;
      default:
        return <Badge variant="outline" className="text-xs bg-slate-800 text-slate-300 border-slate-600">{level}</Badge>;
    }
  };

  const CopyableId = ({ label, value }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-400">{label}:</span>
      <div className="flex items-center gap-2">
        <code className="text-xs text-slate-300 bg-slate-700/50 px-2 py-0.5 rounded font-mono max-w-[220px] truncate">
          {value}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
          }}
          className="text-slate-400 hover:text-slate-200 p-1"
          title={`Copy ${label}`}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const InfoRow = ({ label, value, children }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-400">{label}:</span>
      <span className="text-sm text-slate-200">{children || value || 'N/A'}</span>
    </div>
  );

  const BooleanRow = ({ label, value }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-slate-400">{label}:</span>
      {value ? (
        <Badge className="bg-green-900/30 text-green-300 border-green-700">
          <Check className="w-3 h-3 mr-1" /> Yes
        </Badge>
      ) : (
        <Badge className="bg-slate-700 text-slate-400 border-slate-600">
          <X className="w-3 h-3 mr-1" /> No
        </Badge>
      )}
    </div>
  );

  // Parse nav_permissions
  const navPermissions = user.nav_permissions || user.navigation_permissions || {};
  const enabledModules = Object.entries(navPermissions)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:max-w-[500px] bg-slate-900 border-slate-700 overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-slate-300" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-xl text-slate-100">
                {user.first_name} {user.last_name}
              </SheetTitle>
              <p className="text-sm text-slate-400 flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {user.email}
              </p>
            </div>
          </div>
          {/* Edit button */}
          {onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onEdit(user);
              }}
              className="mt-3 bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit User
            </Button>
          )}
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {/* System Identifiers */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                System Identifiers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <CopyableId label="User ID" value={user.id} />
              {user.metadata?.employee_id && (
                <CopyableId label="Employee ID" value={user.metadata.employee_id} />
              )}
            </CardContent>
          </Card>

          {/* Employee Link */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-cyan-400" />
                Employee Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingEmployee ? (
                <div className="flex items-center gap-2 text-slate-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Checking employee link...</span>
                </div>
              ) : linkedEmployee ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 py-1">
                    <Briefcase className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-slate-200">
                      {linkedEmployee.first_name} {linkedEmployee.last_name}
                    </span>
                    <Badge className="ml-auto bg-green-900/30 text-green-300 border-green-700">
                      <Check className="w-3 h-3 mr-1" /> Linked
                    </Badge>
                  </div>
                  <CopyableId label="Employee ID" value={linkedEmployee.id} />
                </div>
              ) : (
                <div className="flex items-center gap-2 py-2">
                  <X className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-500 italic">Not linked to an employee record</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Identity & Status */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <User className="w-4 h-4 text-green-400" />
                Identity & Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow label="Name" value={`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'N/A'} />
              <InfoRow label="Email" value={user.email} />
              <InfoRow label="CRM Role">
                {getRoleBadge(user.employee_role || user.role)}
              </InfoRow>
              <InfoRow label="Status">
                {user.status === 'active' ? (
                  <Badge className="bg-green-900/30 text-green-300 border-green-700">Active</Badge>
                ) : (
                  <Badge className="bg-red-900/30 text-red-300 border-red-700">Inactive</Badge>
                )}
              </InfoRow>
              {user.tenant_name && (
                <InfoRow label="Client" value={user.tenant_name} />
              )}
            </CardContent>
          </Card>

          {/* Team Memberships */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                Team Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTeams ? (
                <div className="flex items-center gap-2 text-slate-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading teams...</span>
                </div>
              ) : teamMemberships.length > 0 ? (
                <div className="space-y-2">
                  {teamMemberships.map((tm) => (
                    <div
                      key={tm.id || tm.team_id}
                      className="flex items-center justify-between py-1.5 border-b border-slate-700 last:border-0"
                    >
                      <span className="text-sm text-slate-200">{tm.team_name || tm.name}</span>
                      {getAccessLevelBadge(tm.access_level)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic py-2">Not assigned to any teams</p>
              )}
            </CardContent>
          </Card>

          {/* Organization Powers */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                Organization Powers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <BooleanRow label="Add notes anywhere" value={user.perm_notes_anywhere} />
              <BooleanRow label="View all records" value={user.perm_all_records} />
              <BooleanRow label="Reports & analytics" value={user.perm_reports} />
              <BooleanRow label="Manage employees" value={user.perm_employees} />
              <BooleanRow label="System settings" value={user.perm_settings} />
            </CardContent>
          </Card>

          {/* Navigation Modules */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-200 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-cyan-400" />
                Navigation Modules
              </CardTitle>
            </CardHeader>
            <CardContent>
              {enabledModules.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {enabledModules.map((mod) => (
                    <Badge
                      key={mod}
                      variant="outline"
                      className="text-xs bg-slate-700 text-slate-300 border-slate-600"
                    >
                      {mod}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No modules enabled</p>
              )}
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
