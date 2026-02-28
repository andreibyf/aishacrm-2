/**
 * TeamManagement — Admin UI for managing teams, members, and visibility mode.
 *
 * Sections:
 *  1. Visibility mode toggle (shared vs hierarchical)
 *  2. Teams list with CRUD
 *  3. Per-team member management (inline expandable)
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  UserPlus,
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Check,
  X,
  Tags,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useTenant } from '@/components/shared/tenantContext';
import { getBackendUrl } from '@/api/backendUrl';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const BACKEND_URL = getBackendUrl();

// ─── API helpers ─────────────────────────────────────────────────────────────

async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (isSupabaseConfigured()) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch {
      /* continue without token */
    }
  }
  return headers;
}

async function apiFetch(path, options = {}) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

// ─── Role badge colors ──────────────────────────────────────────────────────

const ROLE_COLORS = {
  director: 'bg-purple-600/20 text-purple-300 border-purple-600/30',
  manager: 'bg-blue-600/20 text-blue-300 border-blue-600/30',
  member: 'bg-slate-600/20 text-slate-300 border-slate-600/30',
};

const DEFAULT_ROLE_LABELS = { member: 'Member', manager: 'Manager', director: 'Director' };
const DEFAULT_TIER_LABELS = { top: 'Division', mid: 'Department', leaf: 'Team' };

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TeamManagement() {
  const { selectedTenantId } = useTenant();

  // State
  const [loading, setLoading] = useState(true);
  const [visibilityMode, setVisibilityMode] = useState('hierarchical');
  const [savingMode, setSavingMode] = useState(false);
  const [roleLabels, setRoleLabels] = useState({ ...DEFAULT_ROLE_LABELS });
  const [tierLabels, setTierLabels] = useState({ ...DEFAULT_TIER_LABELS });
  const [editingLabels, setEditingLabels] = useState(false);
  const [draftRoleLabels, setDraftRoleLabels] = useState({ ...DEFAULT_ROLE_LABELS });
  const [draftTierLabels, setDraftTierLabels] = useState({ ...DEFAULT_TIER_LABELS });
  const [savingLabels, setSavingLabels] = useState(false);
  const [teams, setTeams] = useState([]);
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [members, setMembers] = useState({}); // { teamId: [...members] }
  const [loadingMembers, setLoadingMembers] = useState({});
  const [employees, setEmployees] = useState([]);

  // Create team form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [newTeamParent, setNewTeamParent] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Edit team inline
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editParent, setEditParent] = useState('');

  // Add member form
  const [addingMemberTeamId, setAddingMemberTeamId] = useState(null);
  const [newMemberEmployeeId, setNewMemberEmployeeId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');

  const tenantId = selectedTenantId;

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadVisibilityMode = useCallback(async () => {
    if (!tenantId) return;
    try {
      const json = await apiFetch(`/api/v2/teams/visibility-mode?tenant_id=${tenantId}`);
      setVisibilityMode(json.data.visibility_mode);
      const rl = { ...DEFAULT_ROLE_LABELS, ...(json.data.role_labels || {}) };
      const tl = { ...DEFAULT_TIER_LABELS, ...(json.data.tier_labels || {}) };
      setRoleLabels(rl);
      setTierLabels(tl);
      setDraftRoleLabels(rl);
      setDraftTierLabels(tl);
    } catch (err) {
      console.warn('Failed to load visibility mode:', err);
    }
  }, [tenantId]);

  const loadTeams = useCallback(async () => {
    if (!tenantId) return;
    try {
      const json = await apiFetch(`/api/v2/teams?tenant_id=${tenantId}&include_inactive=true`);
      setTeams(json.data.teams || []);
    } catch (err) {
      console.error('Failed to load teams:', err);
      toast.error('Failed to load teams');
    }
  }, [tenantId]);

  const loadEmployees = useCallback(async () => {
    if (!tenantId) return;
    try {
      await apiFetch(`/api/v2/teams/scope`);
      // Also load employee list for the selector
      const empRes = await apiFetch(`/api/employees?tenant_id=${tenantId}&limit=200`);
      const empList = empRes.data?.employees || empRes.employees || [];
      setEmployees(empList.filter((e) => e.is_active !== false));
    } catch (err) {
      console.warn('Failed to load employees:', err);
    }
  }, [tenantId]);

  const loadMembers = useCallback(
    async (teamId) => {
      setLoadingMembers((prev) => ({ ...prev, [teamId]: true }));
      try {
        const json = await apiFetch(`/api/v2/teams/${teamId}/members?tenant_id=${tenantId}`);
        setMembers((prev) => ({ ...prev, [teamId]: json.data.members || [] }));
      } catch (err) {
        console.error('Failed to load members:', err);
        toast.error('Failed to load team members');
      } finally {
        setLoadingMembers((prev) => ({ ...prev, [teamId]: false }));
      }
    },
    [tenantId],
  );

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([loadVisibilityMode(), loadTeams(), loadEmployees()]).finally(() =>
      setLoading(false),
    );
  }, [tenantId, loadVisibilityMode, loadTeams, loadEmployees]);

  // ─── Visibility mode ────────────────────────────────────────────────────

  const handleVisibilityToggle = async () => {
    const newMode = visibilityMode === 'shared' ? 'hierarchical' : 'shared';
    setSavingMode(true);
    try {
      await apiFetch('/api/v2/teams/visibility-mode', {
        method: 'PUT',
        body: JSON.stringify({ tenant_id: tenantId, visibility_mode: newMode }),
      });
      setVisibilityMode(newMode);
      toast.success(`Visibility mode set to ${newMode}`);
    } catch (err) {
      toast.error(`Failed to update visibility mode: ${err.message}`);
    } finally {
      setSavingMode(false);
    }
  };

  const handleSaveLabels = async () => {
    setSavingLabels(true);
    try {
      const json = await apiFetch('/api/v2/teams/visibility-mode', {
        method: 'PUT',
        body: JSON.stringify({
          tenant_id: tenantId,
          role_labels: draftRoleLabels,
          tier_labels: draftTierLabels,
        }),
      });
      const rl = json.data.role_labels || draftRoleLabels;
      const tl = json.data.tier_labels || draftTierLabels;
      setRoleLabels(rl);
      setTierLabels(tl);
      setDraftRoleLabels(rl);
      setDraftTierLabels(tl);
      setEditingLabels(false);
      toast.success('Labels saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingLabels(false);
    }
  };

  // Build role options dynamically from labels
  const ROLE_OPTIONS = [
    { value: 'member', label: roleLabels.member },
    { value: 'manager', label: roleLabels.manager },
    { value: 'director', label: roleLabels.director },
  ];

  // ─── Team CRUD ───────────────────────────────────────────────────────────

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreatingTeam(true);
    try {
      await apiFetch('/api/v2/teams', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          name: newTeamName.trim(),
          description: newTeamDesc.trim() || null,
          parent_team_id: newTeamParent && newTeamParent !== 'none' ? newTeamParent : null,
        }),
      });
      toast.success(`Team "${newTeamName.trim()}" created`);
      setNewTeamName('');
      setNewTeamDesc('');
      setNewTeamParent('');
      setShowCreateForm(false);
      await loadTeams();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleUpdateTeam = async (teamId) => {
    try {
      const updatePayload = {
        tenant_id: tenantId,
        name: editName.trim(),
        parent_team_id: editParent && editParent !== 'none' ? editParent : null,
      };
      // Only send description if it was explicitly changed (no edit UI yet, preserve existing)
      if (editDesc.trim()) {
        updatePayload.description = editDesc.trim();
      }
      await apiFetch(`/api/v2/teams/${teamId}`, {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      toast.success('Team updated');
      setEditingTeamId(null);
      await loadTeams();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleTeamActive = async (team) => {
    try {
      if (team.is_active) {
        await apiFetch(`/api/v2/teams/${team.id}?tenant_id=${tenantId}`, { method: 'DELETE' });
        toast.success(`Team "${team.name}" deactivated`);
      } else {
        await apiFetch(`/api/v2/teams/${team.id}`, {
          method: 'PUT',
          body: JSON.stringify({ tenant_id: tenantId, is_active: true }),
        });
        toast.success(`Team "${team.name}" reactivated`);
      }
      await loadTeams();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ─── Member management ──────────────────────────────────────────────────

  const handleExpandTeam = async (teamId) => {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null);
      return;
    }
    setExpandedTeamId(teamId);
    if (!members[teamId]) {
      await loadMembers(teamId);
    }
  };

  const handleAddMember = async (teamId) => {
    if (!newMemberEmployeeId) return;
    try {
      await apiFetch(`/api/v2/teams/${teamId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: tenantId,
          employee_id: newMemberEmployeeId,
          role: newMemberRole,
        }),
      });
      toast.success('Member added');
      setAddingMemberTeamId(null);
      setNewMemberEmployeeId('');
      setNewMemberRole('member');
      await loadMembers(teamId);
      await loadTeams(); // refresh member counts
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleUpdateMemberRole = async (teamId, memberId, newRole) => {
    try {
      await apiFetch(`/api/v2/teams/${teamId}/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify({ tenant_id: tenantId, role: newRole }),
      });
      toast.success('Role updated');
      await loadMembers(teamId);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRemoveMember = async (teamId, memberId, empName) => {
    try {
      await apiFetch(`/api/v2/teams/${teamId}/members/${memberId}?tenant_id=${tenantId}`, {
        method: 'DELETE',
      });
      toast.success(`${empName || 'Member'} removed from team`);
      await loadMembers(teamId);
      await loadTeams(); // refresh member counts
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const activeTeams = teams.filter((t) => t.is_active);
  const getTeamName = (id) => teams.find((t) => t.id === id)?.name || '';

  // Employees not already in a specific team
  const getAvailableEmployees = (teamId) => {
    const teamMembers = members[teamId] || [];
    const memberEmpIds = new Set(teamMembers.map((m) => m.employee_id));
    return employees.filter((e) => !memberEmpIds.has(e.id));
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-muted-foreground">Loading team settings...</span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <Alert className="bg-blue-900/20 border-blue-700/50">
        <AlertCircle className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          Select a client from the tenant switcher to manage teams.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Visibility Mode Toggle ──────────────────────────────────────── */}
      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-400" />
            Data Visibility Mode
          </CardTitle>
          <CardDescription>
            Controls how team members see records assigned to other team members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg bg-slate-700/30 border border-slate-600">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-200">
                  {visibilityMode === 'shared' ? 'Shared' : 'Hierarchical'}
                </span>
                <Badge
                  variant="outline"
                  className={
                    visibilityMode === 'shared'
                      ? 'border-green-600/50 text-green-400 bg-green-900/20'
                      : 'border-blue-600/50 text-blue-400 bg-blue-900/20'
                  }
                >
                  {visibilityMode === 'shared' ? 'Team sees all' : 'Role-based'}
                </Badge>
              </div>
              <p className="text-sm text-slate-400">
                {visibilityMode === 'shared'
                  ? 'All team members can see records assigned to anyone on their team, plus unassigned records.'
                  : 'Members see only their own records. Managers see their team. Directors see teams below them.'}
              </p>
            </div>
            <Switch
              checked={visibilityMode === 'shared'}
              onCheckedChange={handleVisibilityToggle}
              disabled={savingMode}
              className="data-[state=checked]:bg-green-600"
            />
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Admins and superadmins always see all records regardless of this setting.
          </p>
        </CardContent>
      </Card>

      {/* ── Terminology / Labels ──────────────────────────────────────────── */}
      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Tags className="w-4 h-4 text-orange-400" />
                Terminology
              </CardTitle>
              <CardDescription>
                Customize how roles and organizational tiers are labeled.
              </CardDescription>
            </div>
            {!editingLabels ? (
              <Button
                size="sm"
                variant="outline"
                className="border-slate-600 text-slate-300"
                onClick={() => {
                  setDraftRoleLabels({ ...roleLabels });
                  setDraftTierLabels({ ...tierLabels });
                  setEditingLabels(true);
                }}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Customize
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditingLabels(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleSaveLabels}
                  disabled={savingLabels}
                >
                  {savingLabels ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Check className="w-4 h-4 mr-1" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editingLabels ? (
            <div className="space-y-4">
              <div>
                <Label className="text-slate-300 text-sm font-medium">Role Labels</Label>
                <p className="text-xs text-slate-500 mb-2">
                  What each visibility level is called in your organization.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {['director', 'manager', 'member'].map((key) => (
                    <div key={key}>
                      <Label className="text-xs text-slate-400 capitalize">{key}</Label>
                      <Input
                        value={draftRoleLabels[key] || ''}
                        onChange={(e) =>
                          setDraftRoleLabels((p) => ({ ...p, [key]: e.target.value }))
                        }
                        placeholder={DEFAULT_ROLE_LABELS[key]}
                        className="mt-1 h-8 bg-slate-700 border-slate-600 text-slate-200 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-slate-300 text-sm font-medium">
                  Organizational Tier Labels
                </Label>
                <p className="text-xs text-slate-500 mb-2">
                  How groups are labeled at each level of the hierarchy.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'top', hint: 'Top level' },
                    { key: 'mid', hint: 'Middle level' },
                    { key: 'leaf', hint: 'Lowest level' },
                  ].map(({ key, hint }) => (
                    <div key={key}>
                      <Label className="text-xs text-slate-400">{hint}</Label>
                      <Input
                        value={draftTierLabels[key] || ''}
                        onChange={(e) =>
                          setDraftTierLabels((p) => ({ ...p, [key]: e.target.value }))
                        }
                        placeholder={DEFAULT_TIER_LABELS[key]}
                        className="mt-1 h-8 bg-slate-700 border-slate-600 text-slate-200 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-slate-500 font-medium">Roles</span>
                <div className="flex gap-2 mt-1">
                  {['director', 'manager', 'member'].map((key) => (
                    <Badge key={key} variant="outline" className={ROLE_COLORS[key] + ' text-xs'}>
                      {roleLabels[key]}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-medium">Tiers</span>
                <div className="flex gap-2 mt-1">
                  {['top', 'mid', 'leaf'].map((key) => (
                    <Badge
                      key={key}
                      variant="outline"
                      className="border-slate-600 text-slate-300 text-xs"
                    >
                      {tierLabels[key]}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Teams List ──────────────────────────────────────────────────── */}
      <Card className="border-slate-700 bg-slate-800/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-green-400" />
                Teams
              </CardTitle>
              <CardDescription>
                {teams.length === 0
                  ? 'No teams configured yet. Create your first team to start.'
                  : `${activeTeams.length} active team${activeTeams.length !== 1 ? 's' : ''}`}
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Team
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Create form */}
          {showCreateForm && (
            <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-slate-300 text-sm">Team Name *</Label>
                  <Input
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="e.g. Sales Team"
                    className="mt-1 bg-slate-700 border-slate-600 text-slate-200"
                  />
                </div>
                <div>
                  <Label className="text-slate-300 text-sm">Parent Team</Label>
                  <Select value={newTeamParent} onValueChange={setNewTeamParent}>
                    <SelectTrigger className="mt-1 bg-slate-700 border-slate-600 text-slate-200">
                      <SelectValue placeholder="None (top-level)" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="none" className="text-slate-300">
                        None (top-level)
                      </SelectItem>
                      {activeTeams.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-slate-200">
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-slate-300 text-sm">Description</Label>
                <Input
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="Optional description"
                  className="mt-1 bg-slate-700 border-slate-600 text-slate-200"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateTeam}
                  disabled={creatingTeam || !newTeamName.trim()}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {creatingTeam ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Plus className="w-4 h-4 mr-1" />
                  )}
                  Create
                </Button>
              </div>
            </div>
          )}

          {/* Team rows */}
          {teams.length === 0 && !showCreateForm && (
            <div className="text-center py-8 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No teams yet. Click "New Team" to get started.</p>
            </div>
          )}

          {teams.map((team) => (
            <div
              key={team.id}
              className={`rounded-lg border ${team.is_active ? 'border-slate-600 bg-slate-700/30' : 'border-slate-700/50 bg-slate-800/30 opacity-60'}`}
            >
              {/* Team row header */}
              <div
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => handleExpandTeam(team.id)}
              >
                <div className="text-slate-400">
                  {expandedTeamId === team.id ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>

                {editingTeamId === team.id ? (
                  /* Inline edit */
                  <div
                    className="flex-1 flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 bg-slate-700 border-slate-600 text-slate-200 text-sm"
                    />
                    <Select value={editParent} onValueChange={setEditParent}>
                      <SelectTrigger className="h-8 w-40 bg-slate-700 border-slate-600 text-slate-200 text-sm">
                        <SelectValue placeholder="Parent" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="none" className="text-slate-300">
                          None
                        </SelectItem>
                        {activeTeams
                          .filter((t) => t.id !== team.id)
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id} className="text-slate-200">
                              {t.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-green-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateTeam(team.id);
                      }}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-slate-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTeamId(null);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  /* Display mode */
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200 truncate">{team.name}</span>
                        {!team.is_active && (
                          <Badge
                            variant="outline"
                            className="text-xs border-red-600/50 text-red-400 bg-red-900/20"
                          >
                            Inactive
                          </Badge>
                        )}
                        {team.parent_team_id && (
                          <span className="text-xs text-slate-500">
                            ↳ {getTeamName(team.parent_team_id)}
                          </span>
                        )}
                      </div>
                      {team.description && (
                        <p className="text-xs text-slate-400 truncate">{team.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="border-slate-600 text-slate-400">
                      {team.member_count} {team.member_count === 1 ? 'member' : 'members'}
                    </Badge>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400"
                        title="Edit team"
                        onClick={() => {
                          setEditingTeamId(team.id);
                          setEditName(team.name);
                          setEditDesc(team.description || '');
                          setEditParent(team.parent_team_id || 'none');
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`h-7 w-7 p-0 ${team.is_active ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-green-400'}`}
                        title={team.is_active ? 'Deactivate team' : 'Reactivate team'}
                        onClick={() => handleToggleTeamActive(team)}
                      >
                        {team.is_active ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* Expanded: member list */}
              {expandedTeamId === team.id && (
                <div className="border-t border-slate-600/50 p-3 space-y-2">
                  {loadingMembers[team.id] ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading members...
                    </div>
                  ) : (
                    <>
                      {(members[team.id] || []).length === 0 && (
                        <p className="text-sm text-slate-500 py-2">No members yet.</p>
                      )}

                      {(members[team.id] || []).map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-slate-700/30"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-slate-200">
                              {m.employee_name || 'Unknown'}
                            </span>
                            {m.employee_email && (
                              <span className="text-xs text-slate-500 ml-2">
                                {m.employee_email}
                              </span>
                            )}
                          </div>
                          <Select
                            value={m.role}
                            onValueChange={(val) => handleUpdateMemberRole(team.id, m.id, val)}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs bg-transparent border-slate-600">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              {ROLE_OPTIONS.map((r) => (
                                <SelectItem
                                  key={r.value}
                                  value={r.value}
                                  className="text-slate-200 text-xs"
                                >
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-400"
                            title="Remove member"
                            onClick={() => handleRemoveMember(team.id, m.id, m.employee_name)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}

                      {/* Add member form */}
                      {addingMemberTeamId === team.id ? (
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-600/30">
                          <Select
                            value={newMemberEmployeeId}
                            onValueChange={setNewMemberEmployeeId}
                          >
                            <SelectTrigger className="h-8 flex-1 bg-slate-700 border-slate-600 text-slate-200 text-sm">
                              <SelectValue placeholder="Select employee..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700 max-h-48">
                              {getAvailableEmployees(team.id).map((e) => (
                                <SelectItem
                                  key={e.id}
                                  value={e.id}
                                  className="text-slate-200 text-sm"
                                >
                                  {`${e.first_name || ''} ${e.last_name || ''}`.trim() || e.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                            <SelectTrigger className="h-8 w-28 bg-slate-700 border-slate-600 text-slate-200 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                              {ROLE_OPTIONS.map((r) => (
                                <SelectItem
                                  key={r.value}
                                  value={r.value}
                                  className="text-slate-200 text-sm"
                                >
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="h-8 bg-green-600 hover:bg-green-700"
                            onClick={() => handleAddMember(team.id)}
                            disabled={!newMemberEmployeeId}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={() => {
                              setAddingMemberTeamId(null);
                              setNewMemberEmployeeId('');
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-1 text-blue-400 hover:text-blue-300"
                          onClick={() => setAddingMemberTeamId(team.id)}
                          disabled={!team.is_active}
                        >
                          <UserPlus className="w-4 h-4 mr-1" />
                          Add Member
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Info note ──────────────────────────────────────────────────── */}
      <div className="text-xs text-slate-500 space-y-1 px-1">
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          <strong>{roleLabels.director}:</strong> Sees own {tierLabels.top.toLowerCase()}s + child{' '}
          {tierLabels.mid.toLowerCase()}s + unassigned records.
        </p>
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          <strong>{roleLabels.manager}:</strong> Sees their {tierLabels.leaf.toLowerCase()}'s
          records + unassigned records.
        </p>
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          <strong>{roleLabels.member}:</strong> Sees only own assigned + unassigned records
          (hierarchical) or all {tierLabels.leaf.toLowerCase()} records (shared).
        </p>
      </div>
    </div>
  );
}
