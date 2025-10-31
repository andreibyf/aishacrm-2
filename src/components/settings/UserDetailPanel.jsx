import React from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { User } from "@/api/entities";
import { updateEmployeeUserAccess } from "@/api/functions";
import { Loader2, UserCog } from "lucide-react";

const NAV_ORDER = [
  "Dashboard","Contacts","Accounts","Leads","Opportunities","Activities","Calendar",
  "CashFlow","DocumentProcessing","DocumentManagement","AICampaigns","Employees",
  "Reports","Integrations","Documentation","Settings","Agent","PaymentPortal"
];

const toLabel = (key) => {
  const map = {
    CashFlow: "Cash Flow",
    DocumentProcessing: "Document Processing",
    DocumentManagement: "Document Management",
    AICampaigns: "AI Campaigns",
    PaymentPortal: "Payment Portal"
  };
  return map[key] || key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
};

export default function UserDetailPanel({ open, onClose, targetUser, editorUser, onSaved }) {
  const [saving, setSaving] = React.useState(false);

  // Initialize from user data, ensure all keys exist (including Calendar)
  const initialNav = React.useMemo(() => {
    const fromRoot = targetUser?.navigation_permissions || {};
    const fromPerms = targetUser?.permissions?.navigation_permissions || {};
    const merged = { ...fromRoot, ...fromPerms };
    const filled = {};
    NAV_ORDER.forEach((k) => { filled[k] = !!merged[k]; });
    return filled;
  }, [targetUser]);

  const [crmAccess, setCrmAccess] = React.useState(targetUser?.crm_access !== false);
  const [accessLevel, setAccessLevel] = React.useState(targetUser?.access_level || "read_write");
  const [nav, setNav] = React.useState(initialNav);

  React.useEffect(() => {
    setCrmAccess(targetUser?.crm_access !== false);
    setAccessLevel(targetUser?.access_level || "read_write");
    setNav(initialNav);
  }, [targetUser, initialNav]);

  const canEdit = React.useMemo(() => {
    const role = editorUser?.role;
    // Superadmins and Admins can edit anyone
    if (role === "superadmin" || role === "admin") return true;
    // Managers can edit employees only
    if (role === "manager") {
      const targetRole = targetUser?.role || "employee";
      return targetRole === "employee";
    }
    // Regular employees cannot edit user permissions
    return false;
  }, [editorUser, targetUser]);

  const handleToggle = (k, v) => setNav((prev) => ({ ...prev, [k]: !!v }));

  const handleSave = async () => {
    if (!targetUser?.id) return;
    setSaving(true);
    try {
      // Persist access level and navigation permissions
      await updateEmployeeUserAccess({
        user_id: targetUser.id,
        access_level: accessLevel,
        crm_access: !!crmAccess,
        navigation_permissions: { ...nav }
      });

      // Build permissions with nav mirrored in both places to keep compatibility
      const permissions = {
        ...(targetUser?.permissions || {}),
        navigation_permissions: { ...nav }
      };

      const updatePayload = {
        crm_access: !!crmAccess,
        navigation_permissions: { ...nav }, // root-level for UI components that read here
        permissions,                        // also inside permissions for legacy reads
      };

      await User.update(targetUser.id, updatePayload);
      if (typeof onSaved === "function") onSaved();
      onClose?.();
    } catch (e) {
      alert("Failed to save user access settings: " + (e?.message || "Unknown error"));
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="max-w-3xl w-[95vw] bg-slate-800 border border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <UserCog className="w-5 h-5 text-blue-400" />
            User Access Settings — {targetUser?.email || targetUser?.full_name || ""}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure user permissions, CRM access, and navigation visibility.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-800/60 border border-slate-700 rounded-lg p-3">
            <div className="flex flex-col justify-end">
              <Label className="text-slate-300">CRM Access</Label>
              <div className="flex items-center gap-2 mt-1">
                <Switch checked={crmAccess} onCheckedChange={setCrmAccess} disabled={!canEdit} />
                <span className="text-sm text-slate-300">{crmAccess ? "Enabled" : "Disabled"}</span>
              </div>
            </div>

            <div>
              <Label className="text-slate-300">Access Level</Label>
              <Select value={accessLevel} onValueChange={setAccessLevel} disabled={!canEdit}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="read_write">Read/Write</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-slate-200 text-base">Navigation Permissions</Label>
              <Badge className="bg-slate-700 text-slate-200 border-slate-600">
                {Object.values(nav).filter(Boolean).length} enabled
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {NAV_ORDER.map((k) => (
                <div key={k} className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-700/40 border border-slate-600">
                  <span className="text-slate-200">{toLabel(k)}</span>
                  <Switch checked={!!nav[k]} onCheckedChange={(v) => handleToggle(k, v)} disabled={!canEdit} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onClose?.()}
            className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            disabled={saving}
          >
            Close
          </Button>
          <Button onClick={handleSave} disabled={saving || !canEdit} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}