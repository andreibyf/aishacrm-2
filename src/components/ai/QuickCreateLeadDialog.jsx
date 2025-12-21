
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { Lead, Account } from "@/api/entities";
import { useUser } from "@/components/shared/useUser.js";
import { toast } from "sonner";

function splitName(full = "") {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "Unknown" };
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts.slice(-1)[0] };
}

export default function QuickCreateLeadDialog({ open, onOpenChange, initialData }) {
  const [saving, setSaving] = React.useState(false);
  const { user } = useUser();

  // UPDATED: prefer explicit first_name/last_name/company from initialData, with fallback to splitName
  const defaults = React.useMemo(() => {
    const providedFirst = (initialData?.first_name || "").trim();
    const providedLast = (initialData?.last_name || "").trim();

    // Fallback to split name if explicit parts are missing
    const { first_name: splitFirst, last_name: splitLast } =
      providedFirst || providedLast
        ? { first_name: providedFirst, last_name: providedLast || "Unknown" }
        : splitName(initialData?.name || initialData?.title || "");

    return {
      first_name: providedFirst || splitFirst || "",
      last_name: providedLast || splitLast || "",
      email: (initialData?.email || "").trim(),
      phone: (initialData?.phone || "").trim(),
      job_title: (initialData?.job_title || initialData?.position || initialData?.title || "").trim(),
      company: (initialData?.company || initialData?.organization || (initialData?.domain ? initialData.domain.replace(/^https?:\/\/(www\.)?/, "") : "") || "").trim(),
      website: (initialData?.website || (initialData?.domain ? `https://${initialData.domain}` : "") || "").trim(),
      notes: (initialData?.notes || initialData?.summary || "").trim(),
    };
  }, [initialData]);

  const [form, setForm] = React.useState(defaults);

  React.useEffect(() => {
    setForm(defaults);
  }, [defaults]);

  // User is provided by global UserContext via useUser

  const handleChange = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) {
      (toast?.error ? toast.error("First and last name are required") : alert("First and last name are required"));
      return;
    }
    setSaving(true);
    try {
      const tenantId = user?.tenant_id || null;
      const assigned_to = user?.email || null;

      // Create or link Account by name if provided
      let account_id = undefined;
      if (form.company) {
        let existing = [];
        try {
          existing = await Account.filter(
            tenantId ? { name: form.company, tenant_id: tenantId } : { name: form.company }
          );
        } catch {
          existing = [];
        }
        if (existing && existing.length > 0) {
          account_id = existing[0].id;
        } else {
          const newAcc = await Account.create({
            name: form.company,
            tenant_id: tenantId || undefined,
            website: form.website || undefined,
            tags: ["from_web_search"]
          });
          account_id = newAcc.id;
        }
      }

      // Create Lead
      await Lead.create({
        tenant_id: tenantId || undefined,
        assigned_to: assigned_to || undefined,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        company: form.company || undefined,
        account_id: account_id || undefined,
        job_title: form.job_title || undefined,
        source: "website",
        status: "new",
        notes: form.notes || undefined,
      });

      (toast?.success ? toast.success("Lead created successfully") : alert("Lead created successfully"));
      onOpenChange(false);
    } catch (e) {
      const msg = e?.message || "Failed to create lead";
      (toast?.error ? toast.error(msg) : alert(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Quick Create Lead</DialogTitle>
          <DialogDescription className="text-slate-400">
            Review and edit details before saving to your CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">First name</Label>
              <Input className="bg-slate-700 border-slate-600 text-slate-100"
                     value={form.first_name}
                     onChange={(e) => handleChange("first_name", e.target.value)} />
            </div>
            <div>
              <Label className="text-slate-300">Last name</Label>
              <Input className="bg-slate-700 border-slate-600 text-slate-100"
                     value={form.last_name}
                     onChange={(e) => handleChange("last_name", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Email</Label>
              <Input className="bg-slate-700 border-slate-600 text-slate-100"
                     value={form.email}
                     onChange={(e) => handleChange("email", e.target.value)} />
            </div>
            <div>
              <Label className="text-slate-300">Phone</Label>
              <Input className="bg-slate-700 border-slate-600 text-slate-100"
                     value={form.phone}
                     onChange={(e) => handleChange("phone", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Company / Account</Label>
              <Input className="bg-slate-700 border-slate-600 text-slate-100"
                     value={form.company}
                     onChange={(e) => handleChange("company", e.target.value)} />
            </div>
            <div>
              <Label className="text-slate-300">Position / Title</Label>
              <Input className="bg-slate-700 border-slate-600 text-slate-100"
                     value={form.job_title}
                     onChange={(e) => handleChange("job_title", e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-slate-300">Website</Label>
            <Input className="bg-slate-700 border-slate-600 text-slate-100"
                   value={form.website}
                   onChange={(e) => handleChange("website", e.target.value)} />
          </div>

          <div>
            <Label className="text-slate-300">Notes</Label>
            <Textarea className="bg-slate-700 border-slate-600 text-slate-100"
                      rows={3}
                      value={form.notes}
                      onChange={(e) => handleChange("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
