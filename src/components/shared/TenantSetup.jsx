import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bot,
  Building2,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useUser } from '@/components/shared/useUser.js';
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { Tenant } from "@/api/entities";
import { createTenantWithR2Bucket } from "@/api/functions";
import { deleteTenantWithData } from "@/api/functions";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

const industries = [
  { value: "aerospace_and_defense", label: "Aerospace & Defense" },
  { value: "agriculture", label: "Agriculture" },
  { value: "automotive", label: "Automotive" },
  {
    value: "banking_and_financial_services",
    label: "Banking & Financial Services",
  },
  { value: "construction", label: "Construction" },
  { value: "consumer_goods", label: "Consumer Goods" },
  { value: "education", label: "Education" },
  { value: "energy_and_utilities", label: "Energy & Utilities" },
  { value: "entertainment_and_media", label: "Entertainment & Media" },
  {
    value: "government_and_public_sector",
    label: "Government & Public Sector",
  },
  { value: "green_energy_and_solar", label: "Green Energy & Solar" },
  {
    value: "healthcare_and_life_sciences",
    label: "Healthcare & Life Sciences",
  },
  { value: "hospitality_and_travel", label: "Hospitality & Travel" },
  { value: "information_technology", label: "Information Technology" },
  { value: "insurance", label: "Insurance" },
  { value: "legal_services", label: "Legal Services" },
  {
    value: "logistics_and_transportation",
    label: "Logistics & Transportation",
  },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "marketing_advertising_pr", label: "Marketing, Advertising & PR" },
  { value: "media_and_publishing", label: "Media & Publishing" },
  { value: "mining_and_metals", label: "Mining & Metals" },
  { value: "nonprofit_and_ngos", label: "Nonprofit & NGOs" },
  {
    value: "pharmaceuticals_and_biotechnology",
    label: "Pharmaceuticals & Biotechnology",
  },
  { value: "professional_services", label: "Professional Services" },
  { value: "real_estate", label: "Real Estate" },
  { value: "retail_and_wholesale", label: "Retail & Wholesale" },
  { value: "telecommunications", label: "Telecommunications" },
  { value: "textiles_and_apparel", label: "Textiles & Apparel" },
  { value: "other", label: "Other" },
];

const TenantFormModal = ({ tenant, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    industry: "information_technology", // Set default for new tenant
    business_model: "b2b",
    geographic_focus: "north_america",
    logo_url: "",
    primary_color: "#3b82f6", // Default primary color (blue-500)
    accent_color: "#f59e0b", // Default accent color (amber-500)
    call_agent_url: "", // Add new field
    ai_calling_providers: { // New field for provider-agnostic AI calling
      callfluent: {
        webhook_url: "",
        api_key: "",
        is_active: false,
      },
      thoughtly: {
        api_key: "",
        agent_id: "",
        is_active: false,
      },
    },
  });
  const [saving, setSaving] = useState(false);
  const [uploading] = useState(false);

  useEffect(() => {
    if (tenant && tenant !== "new") {
      // Editing an existing tenant
      setFormData({
        name: tenant.name || "",
        domain: tenant.domain || "",
        industry: tenant.industry || "information_technology", // Provide default if existing is null/empty
        business_model: tenant.business_model || "b2b",
        geographic_focus: tenant.geographic_focus || "north_america",
        logo_url: tenant.logo_url || "",
        primary_color: tenant.primary_color || "#3b82f6",
        accent_color: tenant.accent_color || "#f59e0b",
        call_agent_url: tenant.call_agent_url || "",
        ai_calling_providers: {
          callfluent: {
            webhook_url: tenant.ai_calling_providers?.callfluent?.webhook_url ||
              "",
            api_key: tenant.ai_calling_providers?.callfluent?.api_key || "",
            is_active: tenant.ai_calling_providers?.callfluent?.is_active ||
              false,
          },
          thoughtly: {
            api_key: tenant.ai_calling_providers?.thoughtly?.api_key || "",
            agent_id: tenant.ai_calling_providers?.thoughtly?.agent_id || "",
            is_active: tenant.ai_calling_providers?.thoughtly?.is_active ||
              false,
          },
        },
      });
    } else {
      // Reset to defaults for a new tenant or when closing the modal
      setFormData({
        name: "",
        domain: "",
        industry: "information_technology", // Default for new tenant
        business_model: "b2b",
        geographic_focus: "north_america",
        logo_url: "",
        primary_color: "#3b82f6",
        accent_color: "#f59e0b",
        call_agent_url: "",
        ai_calling_providers: {
          callfluent: {
            webhook_url: "",
            api_key: "",
            is_active: false,
          },
          thoughtly: {
            api_key: "",
            agent_id: "",
            is_active: false,
          },
        },
      });
    }
  }, [tenant]);

  // File upload is temporarily disabled; use the Logo URL field instead.

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Keep existing logic where parent (TenantSetup) handles the actual save (create/update)
      await onSave(formData);
      // onCancel() is called by the parent component after successful save
    } catch (error) {
      console.error("Error saving tenant:", error);
      toast.error("Failed to save tenant. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={!!tenant || tenant === "new"}
      onOpenChange={() => onCancel()}
    >
      <DialogContent className="max-w-2xl bg-slate-800 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">
            {tenant && tenant !== "new" ? "Edit Tenant" : "Create New Tenant"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Apply grid changes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name" className="text-slate-200">
                Tenant Name *
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
                className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
            <div>
              <Label htmlFor="domain" className="text-slate-200">Domain</Label>
              <Input
                id="domain"
                value={formData.domain}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, domain: e.target.value }))}
                placeholder="example.com"
                className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo-url" className="text-slate-200">
              Company Logo URL
            </Label>
            <Input
              id="logo-url"
              type="url"
              value={formData.logo_url}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, logo_url: e.target.value }))}
              placeholder="https://example.com/logo.png or /assets/logo.png"
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
            />
            <p className="text-sm text-slate-400">
              Paste an image URL (e.g., https://your-site.com/logo.png or
              /assets/your-logo.png)
            </p>
            {formData.logo_url && (
              <div className="flex items-center gap-2 mt-2">
                <img
                  src={formData.logo_url}
                  alt="Logo Preview"
                  className="w-16 h-16 object-contain border rounded bg-white"
                  onError={(e) => {
                    console.warn("Logo failed to load:", formData.logo_url);
                    e.target.style.display = "none";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, logo_url: "" }))}
                  className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {
            /* File upload temporarily disabled - use URL input above
          <div className="space-y-2">
            <Label htmlFor="logo-upload" className="text-slate-200">Company Logo</Label>
            <div className="flex items-center gap-4">
              {formData.logo_url && (
                <div className="flex items-center gap-2">
                  <img
                    src={formData.logo_url}
                    alt="Tenant Logo"
                    className="w-16 h-16 object-contain border rounded"
                    onError={(e) => {
                      console.warn("Logo failed to load:", formData.logo_url);
                      e.target.style.display = 'none';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))}
                    className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                  >
                    Remove
                  </Button>
                </div>
              )}
              <div>
                <Input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploading}
                  className="mb-2 bg-slate-700 border-slate-600 text-slate-200"
                />
                <p className="text-sm text-slate-400">
                  Upload a logo (JPG, PNG, GIF - Max 2MB)
                </p>
              </div>
            </div>
          </div>
          */
          }

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color" className="text-slate-200">
                Primary Color
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="primary-color"
                  type="color"
                  value={formData.primary_color}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      primary_color: e.target.value,
                    }))}
                  className="w-16 h-10"
                />
                <Input
                  value={formData.primary_color}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      primary_color: e.target.value,
                    }))}
                  placeholder="#3b82f6"
                  className="flex-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accent-color" className="text-slate-200">
                Accent Color
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="accent-color"
                  type="color"
                  value={formData.accent_color}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      accent_color: e.target.value,
                    }))}
                  className="w-16 h-10"
                />
                <Input
                  value={formData.accent_color}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      accent_color: e.target.value,
                    }))}
                  placeholder="#f59e0b"
                  className="flex-1 bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                />
              </div>
            </div>
          </div>

          {/* Apply grid changes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="industry" className="text-slate-200">
                Industry *
              </Label>
              <Select
                value={formData.industry}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, industry: value }))}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {industries.map((industry) => (
                    <SelectItem
                      key={industry.value}
                      value={industry.value}
                      className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                    >
                      {industry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="business_model" className="text-slate-200">
                Business Model
              </Label>
              <Select
                value={formData.business_model}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, business_model: value }))}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem
                    value="b2b"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    B2B
                  </SelectItem>
                  <SelectItem
                    value="b2c"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    B2C
                  </SelectItem>
                  <SelectItem
                    value="hybrid"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    Hybrid
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="geographic_focus" className="text-slate-200">
                Geographic Focus
              </Label>
              <Select
                value={formData.geographic_focus}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, geographic_focus: value }))}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem
                    value="north_america"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    North America
                  </SelectItem>
                  <SelectItem
                    value="europe"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    Europe
                  </SelectItem>
                  <SelectItem
                    value="asia"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    Asia
                  </SelectItem>
                  <SelectItem
                    value="south_america"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    South America
                  </SelectItem>
                  <SelectItem
                    value="africa"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    Africa
                  </SelectItem>
                  <SelectItem
                    value="oceania"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    Oceania
                  </SelectItem>
                  <SelectItem
                    value="global"
                    className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                  >
                    Global
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Legacy AI Call Agent URL field */}
          <div>
            <Label
              htmlFor="call_agent_url"
              className="flex items-center gap-2 text-slate-200"
            >
              <Phone className="w-4 h-4" />
              Legacy AI Call Agent URL (CallFluent)
            </Label>
            <Input
              id="call_agent_url"
              value={formData.call_agent_url}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  call_agent_url: e.target.value,
                }))}
              placeholder="https://your-callfluent-webhook.com/endpoint"
              type="url"
              className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Legacy field for backward compatibility. Use AI Calling Providers
              section for new configurations.
            </p>
          </div>

          {/* New AI Calling Providers Configuration */}
          <Card className="border-2 border-dashed border-blue-200 bg-slate-700/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
                <Bot className="w-5 h-5 text-blue-400" />
                AI Calling Providers
              </CardTitle>
              <CardDescription className="text-slate-400">
                Configure multiple AI calling platforms for this tenant.
                Campaigns can choose which provider to use.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* CallFluent Configuration */}
              <div className="border rounded-lg p-4 space-y-3 bg-slate-600/30 border-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <h4 className="font-semibold text-slate-200">CallFluent</h4>
                  <Badge
                    variant={formData.ai_calling_providers?.callfluent
                        ?.is_active
                      ? "default"
                      : "outline"}
                  >
                    {formData.ai_calling_providers?.callfluent?.is_active
                      ? "Active"
                      : "Inactive"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-300">
                      Webhook URL
                    </Label>
                    <Input
                      placeholder="https://callfluent-webhook.com"
                      value={formData.ai_calling_providers?.callfluent
                        ?.webhook_url || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ai_calling_providers: {
                            ...prev.ai_calling_providers,
                            callfluent: {
                              ...prev.ai_calling_providers?.callfluent,
                              webhook_url: e.target.value,
                            },
                          },
                        }))}
                      className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-300">API Key</Label>
                    <Input
                      type="password"
                      placeholder="cf_api_key_..."
                      value={formData.ai_calling_providers?.callfluent
                        ?.api_key || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ai_calling_providers: {
                            ...prev.ai_calling_providers,
                            callfluent: {
                              ...prev.ai_calling_providers?.callfluent,
                              api_key: e.target.value,
                            },
                          },
                        }))}
                      className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.ai_calling_providers?.callfluent
                      ?.is_active || false}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        ai_calling_providers: {
                          ...prev.ai_calling_providers,
                          callfluent: {
                            ...prev.ai_calling_providers?.callfluent,
                            is_active: checked,
                          },
                        },
                      }))}
                  />
                  <Label className="text-sm text-slate-300">
                    Enable CallFluent for this tenant
                  </Label>
                </div>
              </div>

              {/* Thoughtly Configuration */}
              <div className="border rounded-lg p-4 space-y-3 bg-slate-600/30 border-slate-500">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <h4 className="font-semibold text-slate-200">Thoughtly</h4>
                  <Badge
                    variant={formData.ai_calling_providers?.thoughtly?.is_active
                      ? "default"
                      : "outline"}
                  >
                    {formData.ai_calling_providers?.thoughtly?.is_active
                      ? "Active"
                      : "Inactive"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-300">API Key</Label>
                    <Input
                      type="password"
                      placeholder="thoughtly_api_key_..."
                      value={formData.ai_calling_providers?.thoughtly
                        ?.api_key || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ai_calling_providers: {
                            ...prev.ai_calling_providers,
                            thoughtly: {
                              ...prev.ai_calling_providers?.thoughtly,
                              api_key: e.target.value,
                            },
                          },
                        }))}
                      className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-300">Agent ID</Label>
                    <Input
                      placeholder="agent_123abc..."
                      value={formData.ai_calling_providers?.thoughtly
                        ?.agent_id || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          ai_calling_providers: {
                            ...prev.ai_calling_providers,
                            thoughtly: {
                              ...prev.ai_calling_providers?.thoughtly,
                              agent_id: e.target.value,
                            },
                          },
                        }))}
                      className="bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.ai_calling_providers?.thoughtly
                      ?.is_active || false}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({
                        ...prev,
                        ai_calling_providers: {
                          ...prev.ai_calling_providers,
                          thoughtly: {
                            ...prev.ai_calling_providers?.thoughtly,
                            is_active: checked,
                          },
                        },
                      }))}
                  />
                  <Label className="text-sm text-slate-300">
                    Enable Thoughtly for this tenant
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="p-4 bg-slate-700/50 rounded-lg">
            <h3 className="font-semibold text-slate-200 mb-2">Color Preview</h3>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded border"
                  style={{ backgroundColor: formData.primary_color }}
                >
                </div>
                <span className="text-sm text-slate-300">
                  Primary: {formData.primary_color}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded border"
                  style={{ backgroundColor: formData.accent_color }}
                >
                </div>
                <span className="text-sm text-slate-300">
                  Accent: {formData.accent_color}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving || uploading}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || uploading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving
                ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {tenant && tenant !== "new" ? "Updating..." : "Creating..."}
                  </>
                )
                : uploading
                ? (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Uploading...
                  </>
                )
                : (
                  <>
                    <Building2 className="mr-2 h-4 w-4" />
                    {tenant && tenant !== "new"
                      ? "Update Tenant"
                      : "Create Tenant"}
                  </>
                )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function TenantSetup() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTenant, setEditingTenant] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);
  
  // Use global user context instead of local User.me()
  const { user: currentUser } = useUser();

  useEffect(() => {
    if (!currentUser) return;
    loadUserAndTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const loadUserAndTenants = async () => {
    if (!currentUser) return;
    setLoading(true);
    setDebugInfo(null); // Clear debug info on new load attempt
    try {
      console.log("Current user:", currentUser);
      setDebugInfo(
        `User role: ${currentUser.role}, Client ID: ${currentUser.tenant_id || "N/A"}`,
      );

      // Try to load tenants
      console.log("Attempting to load tenants...");
      const tenantsData = await Tenant.list("display_order");
      console.log("Loaded tenants:", tenantsData);
      setTenants(tenantsData);

      if (tenantsData.length === 0) {
        setDebugInfo((prev) => prev + " | No tenants returned from database");
      }
    } catch (error) {
      console.error("Error loading tenants:", error);
      setDebugInfo((prev) => prev + ` | Error: ${error.message}`);

      // Try alternative loading method for debugging
      try {
        console.log("Trying alternative tenant loading...");
        const altTenants = await Tenant.filter({});
        console.log("Alternative method result:", altTenants);
        setTenants(altTenants);
        if (altTenants.length === 0) {
          setDebugInfo((prev) =>
            prev + " | Alt method also returned no tenants"
          );
        } else {
          setDebugInfo((prev) => prev + " | Alt method loaded tenants");
        }
      } catch (altError) {
        console.error("Alternative loading also failed:", altError);
        setDebugInfo((prev) => prev + ` | Alt error: ${altError.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadTenants = loadUserAndTenants; // For compatibility

  const handleSaveTenant = async (tenantData) => {
    if (!currentUser) {
      toast.error(
        "User not loaded. Cannot save tenant. Please refresh the page.",
      );
      console.error("currentUser is null, cannot save tenant.");
      return;
    }

    try {
      if (editingTenant && editingTenant !== "new") {
        await Tenant.update(editingTenant.id, tenantData);
        toast.success("Tenant updated successfully!");
      } else {
        // Assign a high display_order and the current user's email
        const newTenantData = {
          ...tenantData,
          display_order: tenants.length,
          created_by: currentUser.email, // Explicitly set created_by
        };
        await createTenantWithR2Bucket(newTenantData);
        toast.success("Tenant created successfully!");
      }
      loadTenants();
      setEditingTenant(null); // Close modal
    } catch (error) {
      console.error("Error saving tenant:", error);
      toast.error("Failed to save tenant. Please try again.");
    }
  };

  const handleDeleteTenant = async (tenantId) => {
    if (
      confirm(
        "Are you sure you want to delete this tenant? This will permanently delete all associated data including contacts, accounts, leads, opportunities, and activities.",
      )
    ) {
      try {
        await deleteTenantWithData({ tenantId });
        toast.success("Tenant deleted successfully!");
        loadTenants();
      } catch (error) {
        console.error("Error deleting tenant:", error);
        toast.error("Failed to delete tenant");
      }
    }
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(tenants);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Update display_order for all affected items in local state
    const updates = items.map((item, index) => ({
      ...item,
      display_order: index,
    }));

    setTenants(updates); // Optimistic UI update

    // Save the new order to database
    try {
      // Create an array of promises for parallel updates
      const updatePromises = updates.map((tenant) =>
        Tenant.update(tenant.id, { display_order: tenant.display_order })
      );
      await Promise.all(updatePromises);
      toast.success("Tenant order saved successfully!");
    } catch (error) {
      console.error("Failed to save tenant order:", error);
      toast.error("Failed to save new order. Reverting.");
      loadTenants(); // Revert on failure by reloading original data
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Loading tenant data...</p>
          {debugInfo && (
            <p className="text-sm text-gray-500 mt-2">{debugInfo}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Debug Information Card */}
      {debugInfo && (
        <Card className="border-yellow-200 bg-yellow-900/20 border-yellow-700/50">
          <CardContent className="p-4">
            <h4 className="font-semibold text-yellow-200 mb-2">
              Debug Information:
            </h4>
            <p className="text-sm text-yellow-300">{debugInfo}</p>
            {currentUser && (
              <div className="mt-2 text-xs text-yellow-400">
                <p>User Email: {currentUser.email}</p>
                <p>User Role: {currentUser.role}</p>
                <p>Client ID: {currentUser.tenant_id || "None"}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Existing tenant management card */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <Building2 className="w-5 h-5" />
                Tenant Management
              </CardTitle>
              <CardDescription className="text-slate-400">
                Create and manage tenant organizations{" "}
                {tenants.length > 0 && `(${tenants.length} total)`}
              </CardDescription>
            </div>
            <Button
              onClick={() => setEditingTenant("new")}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Tenant
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tenants.length === 0
            ? (
              <div className="text-center py-8">
                <Building2 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-400 mb-2">
                  No tenants found. Create your first tenant to get started.
                </p>
                {debugInfo && (
                  <Button
                    variant="outline"
                    onClick={loadTenants}
                    className="mt-4 bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Retry Loading
                  </Button>
                )}
              </div>
            )
            : (
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="tenants">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef}>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-700">
                              <TableHead className="w-12 text-slate-300">
                              </TableHead>
                              <TableHead className="text-slate-300">
                                Logo
                              </TableHead>
                              <TableHead className="text-slate-300">
                                Name
                              </TableHead>
                              <TableHead className="text-slate-300">
                                Domain
                              </TableHead>
                              <TableHead className="text-slate-300">
                                Agent URL
                              </TableHead>
                              <TableHead className="text-slate-300">
                                Industry
                              </TableHead>
                              <TableHead className="text-right text-slate-300">
                                Actions
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tenants.map((tenant, index) => (
                              <Draggable
                                key={tenant.id}
                                draggableId={tenant.id}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <TableRow
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className={`${
                                      snapshot.isDragging ? "shadow-lg" : ""
                                    } border-slate-700`}
                                  >
                                    <TableCell {...provided.dragHandleProps}>
                                      <GripVertical className="w-4 h-4 text-slate-500 cursor-grab" />
                                    </TableCell>
                                    <TableCell>
                                      {tenant.logo_url
                                        ? (
                                          <img
                                            src={tenant.logo_url}
                                            alt={tenant.name}
                                            className="w-8 h-8 rounded object-contain"
                                          />
                                        )
                                        : (
                                          <div className="w-8 h-8 bg-slate-600 rounded flex items-center justify-center">
                                            <span className="text-xs font-medium text-slate-300">
                                              {tenant.name?.charAt(0)
                                                ?.toUpperCase() || "?"}
                                            </span>
                                          </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-medium text-slate-200">
                                      {tenant.name}
                                    </TableCell>
                                    <TableCell className="text-slate-300">
                                      {tenant.domain || "—"}
                                    </TableCell>
                                    <TableCell>
                                      {tenant.call_agent_url
                                        ? (
                                          <Badge
                                            variant="secondary"
                                            className="bg-slate-600 text-slate-300"
                                          >
                                            Legacy Configured
                                          </Badge>
                                        )
                                        : tenant.ai_calling_providers
                                            ?.callfluent?.is_active ||
                                            tenant.ai_calling_providers
                                              ?.thoughtly?.is_active
                                        ? (
                                          <Badge
                                            variant="default"
                                            className="bg-blue-600 text-white"
                                          >
                                            AI Providers Active
                                          </Badge>
                                        )
                                        : (
                                          <Badge
                                            variant="outline"
                                            className="border-slate-600 text-slate-400"
                                          >
                                            Not Set
                                          </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className="capitalize border-slate-600 text-slate-400"
                                      >
                                        {industries.find((i) =>
                                          i.value === tenant.industry
                                        )?.label || "Not set"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                                          >
                                            <MoreHorizontal className="w-4 h-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                          align="end"
                                          className="bg-slate-800 border-slate-700"
                                        >
                                          <DropdownMenuItem
                                            onClick={() =>
                                              setEditingTenant(tenant)}
                                            className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
                                          >
                                            <Pencil className="w-4 h-4 mr-2" />
                                            Edit
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator className="bg-slate-600" />
                                          <DropdownMenuItem
                                            onClick={() =>
                                              handleDeleteTenant(tenant.id)}
                                            className="text-red-400 focus:text-red-300 hover:bg-slate-700 focus:bg-slate-700"
                                          >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </Draggable>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
        </CardContent>
      </Card>

      {/* Tenant Form Modal */}
      {editingTenant && (
        <TenantFormModal
          tenant={editingTenant}
          onSave={handleSaveTenant}
          onCancel={() => setEditingTenant(null)}
        />
      )}
    </div>
  );
}
