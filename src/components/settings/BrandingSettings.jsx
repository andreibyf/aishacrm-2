
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea"; // NEW
import { Loader2, Palette, Image as ImageIcon, Save, Lock, Upload } from "lucide-react"; // NEW: Upload
import { User } from "@/api/entities";
import { Tenant } from "@/api/entities";
import { SystemBranding } from "@/api/entities"; // NEW
import { UploadFile } from "@/api/integrations";
import { useTenant } from "../shared/tenantContext";

export default function BrandingSettings() {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null); // NEW: active tenant being edited (if admin)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const { selectedTenantId } = useTenant(); // NEW: from header switcher

  const [brandingData, setBrandingData] = useState({
    companyName: "Ai-SHA CRM",
    logoUrl: "",
    primaryColor: "#06b6d4",
    accentColor: "#6366f1",
    footerLogoUrl: ""
  });

  // NEW: State for SystemBranding (global footer)
  const [me, setMe] = React.useState(null);
  const [loadingFooter, setLoadingFooter] = React.useState(true);
  const [savingFooter, setSavingFooter] = React.useState(false);
  const [brandingId, setBrandingId] = React.useState(null);
  const [footerLogoUrl, setFooterLogoUrl] = React.useState(""); // Global footer logo
  const [footerLegalHtml, setFooterLegalHtml] = React.useState("");

  const canEdit = !!me && (me.role === "admin" || me.role === "superadmin");

  // NEW: Fetch current user for permissions
  React.useEffect(() => {
    (async () => {
      try {
        const u = await User.me();
        setMe(u);
      } catch (e) {
        console.error("Failed to fetch current user for permissions:", e);
      }
    })();
  }, []);

  // NEW: Fetch global footer branding data
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await SystemBranding.list();
        const active = rows.find(r => r.is_active) || rows[0] || null;
        if (!mounted) return;
        if (active) {
          setBrandingId(active.id);
          setFooterLogoUrl(active.footer_logo_url || "");
          setFooterLegalHtml(active.footer_legal_html || "");
        }
      } catch (e) {
        console.error("Failed to load SystemBranding:", e);
      } finally {
        if (mounted) setLoadingFooter(false);
      }
    })();
    return () => { mounted = false; };
  }, []);


  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = await User.me();
        if (!mounted) return;
        setUser(u);

        const isAdmin = u?.role === "admin" || u?.role === "superadmin";
        // Determine which tenant to load for admins; regular users will only view their own if any
        const targetTenantId =
          (isAdmin && selectedTenantId) ? selectedTenantId :
          (isAdmin && u?.tenant_id) ? u.tenant_id :
          null;

        if (isAdmin && (targetTenantId || u?.tenant_id)) {
          // Admin editing tenant branding
          const t = await Tenant.get(targetTenantId || u.tenant_id);
          if (!mounted) return;
          setTenant(t);
          const bs = t?.branding_settings || {};
          setBrandingData({
            companyName: t?.name || "Ai-SHA CRM",
            logoUrl: t?.logo_url || "",
            primaryColor: t?.primary_color || "#06b6d4",
            accentColor: t?.accent_color || "#6366f1",
            footerLogoUrl: bs.footerLogoUrl || ""
          });
          setMessage(`Editing tenant branding: ${t?.name || "Tenant"}`);
        } else if (u?.tenant_id && !isAdmin) {
          // Non-admin users: view personal overrides only (user-level)
          const bs = u?.branding_settings || {};
          setBrandingData({
            companyName: bs.companyName || "Ai-SHA CRM",
            logoUrl: bs.logoUrl || "",
            primaryColor: bs.primaryColor || "#06b6d4",
            accentColor: bs.accentColor || "#6366f1",
            footerLogoUrl: bs.footerLogoUrl || ""
          });
          setMessage("Personal branding (does not override tenant theme)");
        } else {
          // No tenant context; fall back to user-level
          const bs = u?.branding_settings || {};
          setBrandingData({
            companyName: bs.companyName || "Ai-SHA CRM",
            logoUrl: bs.logoUrl || "",
            primaryColor: bs.primaryColor || "#06b6d4",
            accentColor: bs.accentColor || "#6366f1",
            footerLogoUrl: bs.footerLogoUrl || ""
          });
          setMessage("No tenant selected; editing personal branding");
        }
      } catch (e) {
        setMessage(e?.message || "Failed to load branding settings");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedTenantId]);

  const onChange = (key, val) => {
    setBrandingData((prev) => ({ ...prev, [key]: val }));
  };

  const handleUpload = async (e, key) => { // This is for tenant/user branding logos
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setMessage("File size must be less than 3MB");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    setUploading(true);
    try {
      const result = await UploadFile({ file });
      
      // Check if upload was successful
      if (result?.file_url) {
        setBrandingData((prev) => ({ ...prev, [key]: result.file_url }));
        setMessage("Image uploaded successfully.");
      } else if (result?.success === false) {
        // Local dev mode - show helpful message
        setMessage("File upload not available in local dev mode. Please paste an image URL instead.");
      } else {
        setMessage("Upload failed: Unexpected response format");
      }
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setMessage(e?.message || "Upload failed");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setUploading(false);
    }
  };

  // NEW: handleUpload for global footer logo
  const handleGlobalFooterUpload = async (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setMessage("File size must be less than 3MB");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    setUploading(true);
    try {
      const result = await UploadFile({ file });
      
      // Check if upload was successful
      if (result?.file_url) {
        setFooterLogoUrl(result.file_url);
        setMessage("Footer logo uploaded successfully.");
      } else if (result?.success === false) {
        // Local dev mode - show helpful message
        setMessage("File upload not available in local dev mode. Please paste an image URL instead.");
      } else {
        setMessage("Upload failed: Unexpected response format");
      }
      setTimeout(() => setMessage(""), 3000);
    } catch (e) {
      setMessage(e?.message || "Global footer logo upload failed");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => { // This is for tenant/user branding
    setSaving(true);
    try {
      const isAdmin = user?.role === "admin" || user?.role === "superadmin";
      // If admin and we have a tenant context, update Tenant branding directly
      if (isAdmin && (tenant?.id || user?.tenant_id)) {
        const tenantIdToUpdate = tenant?.id || user?.tenant_id;
        const nextBrandingSettings = {
          ...(tenant?.branding_settings || {}),
          footerLogoUrl: brandingData.footerLogoUrl || ""
        };
        await Tenant.update(tenantIdToUpdate, {
          // name is editable here only if they changed it; otherwise keep existing
          name: brandingData.companyName || tenant?.name,
          logo_url: brandingData.logoUrl || null,
          primary_color: brandingData.primaryColor,
          accent_color: brandingData.accentColor,
          branding_settings: nextBrandingSettings
        });
        setMessage("Tenant branding saved. Refreshing to apply...");
        // Simple and reliable: reload to rebind CSS variables across app
        setTimeout(() => window.location.reload(), 600);
      } else {
        // Regular users save personal preferences (does not override tenant theme)
        await User.updateMyUserData({
          branding_settings: { ...brandingData }
        });
        setMessage("Your personal branding preferences were saved.");
        setTimeout(() => setMessage(""), 2500);
      }
    } catch (e) {
      setMessage(e?.message || "Failed to save");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSaving(false);
    }
  };

  // NEW: handleSave for global footer branding
  const handleGlobalFooterSave = async () => {
    setSavingFooter(true);
    try {
      const payload = {
        footer_logo_url: footerLogoUrl || null,
        footer_legal_html: footerLegalHtml || null,
        is_active: true
      };
      if (brandingId) {
        await SystemBranding.update(brandingId, payload);
      } else {
        const created = await SystemBranding.create(payload);
        setBrandingId(created.id);
      }
      setMessage("Global footer branding saved. Refreshing to apply...");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setMessage(e?.message || "Failed to save global footer branding");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setSavingFooter(false);
    }
  };

  if (loading || loadingFooter) {
    return (
      <div className="flex items-center justify-center p-8 bg-slate-900 text-slate-200">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        <span className="ml-2">Loading branding settings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <Alert className="bg-slate-800 border-slate-700 text-slate-200">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="border-b border-slate-700">
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Palette className="w-5 h-5 text-pink-400" />
            Branding Settings
          </CardTitle>
          <CardDescription className="text-slate-400">
            {tenant
              ? `Editing branding for tenant: ${tenant?.name || "Tenant"}`
              : "Customize your personal branding"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 grid gap-6">
          <div className="grid gap-2">
            <Label className="text-slate-200">Company Name</Label>
            <Input
              value={brandingData.companyName || ""}
              onChange={(e) => onChange("companyName", e.target.value)}
              className="bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400"
              placeholder="Company name"
            />
            {!tenant && (
              <p className="text-xs text-slate-400">
                Personal preference only; tenant theme colors are controlled by your admin.
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div className="grid gap-2">
              <Label className="text-slate-200">Primary Color</Label>
              <Input
                type="color"
                value={brandingData.primaryColor || "#06b6d4"}
                onChange={(e) => onChange("primaryColor", e.target.value)}
                className="h-10 bg-slate-700 border-slate-600"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-200">Accent Color</Label>
              <Input
                type="color"
                value={brandingData.accentColor || "#6366f1"}
                onChange={(e) => onChange("accentColor", e.target.value)}
                className="h-10 bg-slate-700 border-slate-600"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div className="grid gap-3">
              <Label className="text-slate-200">Header/Company Logo</Label>
              <div className="flex items-center gap-3">
                {brandingData.logoUrl ? (
                  <img
                    src={brandingData.logoUrl}
                    alt="Logo"
                    className="w-20 h-16 object-contain border border-slate-600 rounded bg-white"
                  />
                ) : (
                  <div className="w-20 h-16 border border-dashed border-slate-600 rounded flex items-center justify-center text-slate-500">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e, "logoUrl")}
                  disabled={uploading}
                  className="bg-slate-700 border-slate-600 text-slate-200 file:bg-slate-600 file:text-slate-200 file:border-slate-500"
                />
              </div>
              <Input
                placeholder="Or paste a direct image URL…"
                value={brandingData.logoUrl || ""}
                onChange={(e) => onChange("logoUrl", e.target.value)}
                className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
              />
            </div>

            <div className="grid gap-3">
              <Label className="text-slate-200">Footer Logo (tenant/user specific)</Label>
              <div className="flex items-center gap-3">
                {brandingData.footerLogoUrl ? (
                  <img
                    src={brandingData.footerLogoUrl}
                    alt="Footer Logo"
                    className="w-20 h-16 object-contain border border-slate-600 rounded bg-white"
                  />
                ) : (
                  <div className="w-20 h-16 border border-dashed border-slate-600 rounded flex items-center justify-center text-slate-500">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUpload(e, "footerLogoUrl")}
                  disabled={uploading}
                  className="bg-slate-700 border-slate-600 text-slate-200 file:bg-slate-600 file:text-slate-200 file:border-slate-500"
                />
              </div>
              <Input
                placeholder="Or paste a direct image URL…"
                value={brandingData.footerLogoUrl || ""}
                onChange={(e) => onChange("footerLogoUrl", e.target.value)}
                className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
              />
              {tenant && (
                <p className="text-xs text-slate-400 mt-1">
                  Saved into tenant branding_settings.footerLogoUrl
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* NEW: Ai-SHA Global Footer (Logo & Legal) */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="border-b border-slate-700">
          <CardTitle className="flex items-center gap-2 text-slate-100">
            {canEdit ? <Upload className="w-5 h-5 text-emerald-400" /> : <Lock className="w-5 h-5 text-slate-400" />}
            Ai‑SHA Global Footer (Logo & Legal)
          </CardTitle>
          <CardDescription className="text-slate-400">
            This controls the footer for ALL tenants and users. Only admins can edit.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {loadingFooter ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading footer settings…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-slate-200">Footer Logo</Label>
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-44 border border-slate-700 rounded bg-white flex items-center justify-center overflow-hidden">
                      {footerLogoUrl ? (
                        <img src={footerLogoUrl} alt="Global Footer Logo" className="max-h-16 max-w-44 object-contain" />
                      ) : (
                        <span className="text-slate-500 text-xs">No logo set</span>
                      )}
                    </div>
                    {canEdit && (
                      <div>
                        <Input
                          id="footer-logo-file"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleGlobalFooterUpload(e.target.files?.[0])}
                          disabled={uploading}
                        />
                        <Button asChild variant="outline" className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600" disabled={uploading}>
                          <label htmlFor="footer-logo-file" className="cursor-pointer">Upload</label>
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Recommended: transparent PNG or SVG, height ~64px.</p>
                  {canEdit && (
                  <Input
                    placeholder="Or paste a direct image URL…"
                    value={footerLogoUrl || ""}
                    onChange={(e) => setFooterLogoUrl(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400"
                  />
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-200">Legal Text (HTML allowed)</Label>
                  <Textarea
                    value={footerLegalHtml || ""}
                    onChange={(e) => setFooterLegalHtml(e.target.value)}
                    className="min-h-[120px] bg-slate-700 border-slate-600 text-slate-100"
                    placeholder={`<div>Ai‑SHA® is a registered trademark of 4V Data Consulting LLC.</div>\n<div>© ${new Date().getFullYear()} 4V Data Consulting LLC. All rights reserved.</div>`}
                    readOnly={!canEdit}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="border-t border-slate-700 flex justify-end">
          {canEdit ? (
            <Button onClick={handleGlobalFooterSave} disabled={savingFooter || uploading} className="bg-blue-600 hover:bg-blue-700">
              {savingFooter || uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Footer
            </Button>
          ) : (
            <div className="text-xs text-slate-500">Read-only for your role.</div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
