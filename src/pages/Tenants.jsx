import { useEffect, useState } from "react";
import { Tenant, User } from "@/api/entities";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Building2,
  Edit,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const TenantForm = ({ tenant, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: tenant?.name || "",
    domain: tenant?.domain || "",
    logo_url: tenant?.logo_url || "",
    primary_color: tenant?.primary_color || "#3b82f6",
    accent_color: tenant?.accent_color || "#f59e0b",
    industry: tenant?.industry || "other",
    business_model: tenant?.business_model || "b2b",
    geographic_focus: tenant?.geographic_focus || "north_america",
    elevenlabs_agent_id: tenant?.elevenlabs_agent_id || "",
    display_order: tenant?.display_order || 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!tenant} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {tenant?.id ? "Edit Tenant" : "Create New Tenant"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Tenant Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })}
                placeholder="Acme Corp"
                required
              />
            </div>
            <div>
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={formData.domain}
                onChange={(e) =>
                  setFormData({ ...formData, domain: e.target.value })}
                placeholder="acme.com"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="logo_url">Logo URL</Label>
            <Input
              id="logo_url"
              value={formData.logo_url}
              onChange={(e) =>
                setFormData({ ...formData, logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="primary_color">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={formData.primary_color}
                  onChange={(e) =>
                    setFormData({ ...formData, primary_color: e.target.value })}
                  className="w-16 h-10"
                />
                <Input
                  value={formData.primary_color}
                  onChange={(e) =>
                    setFormData({ ...formData, primary_color: e.target.value })}
                  placeholder="#3b82f6"
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="accent_color">Accent Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={formData.accent_color}
                  onChange={(e) =>
                    setFormData({ ...formData, accent_color: e.target.value })}
                  className="w-16 h-10"
                />
                <Input
                  value={formData.accent_color}
                  onChange={(e) =>
                    setFormData({ ...formData, accent_color: e.target.value })}
                  placeholder="#f59e0b"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Select
                value={formData.industry}
                onValueChange={(value) =>
                  setFormData({ ...formData, industry: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="information_technology">
                    Information Technology
                  </SelectItem>
                  <SelectItem value="healthcare_and_life_sciences">
                    Healthcare & Life Sciences
                  </SelectItem>
                  <SelectItem value="banking_and_financial_services">
                    Banking & Financial Services
                  </SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="retail_and_wholesale">
                    Retail & Wholesale
                  </SelectItem>
                  <SelectItem value="professional_services">
                    Professional Services
                  </SelectItem>
                  <SelectItem value="real_estate">Real Estate</SelectItem>
                  <SelectItem value="construction">Construction</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="business_model">Business Model</Label>
              <Select
                value={formData.business_model}
                onValueChange={(value) =>
                  setFormData({ ...formData, business_model: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="b2b">B2B</SelectItem>
                  <SelectItem value="b2c">B2C</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="geographic_focus">Geographic Focus</Label>
              <Select
                value={formData.geographic_focus}
                onValueChange={(value) =>
                  setFormData({ ...formData, geographic_focus: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="north_america">North America</SelectItem>
                  <SelectItem value="europe">Europe</SelectItem>
                  <SelectItem value="asia">Asia</SelectItem>
                  <SelectItem value="south_america">South America</SelectItem>
                  <SelectItem value="africa">Africa</SelectItem>
                  <SelectItem value="oceania">Oceania</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="elevenlabs_agent_id">ElevenLabs Agent ID</Label>
            <Input
              id="elevenlabs_agent_id"
              value={formData.elevenlabs_agent_id}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  elevenlabs_agent_id: e.target.value,
                })}
              placeholder="se8ujo4HwtLbAg1GMvuX"
            />
            <p className="text-xs text-slate-500 mt-1">
              The unique Agent ID from ElevenLabs for this tenant's AI widget
            </p>
          </div>

          <div>
            <Label htmlFor="display_order">Display Order</Label>
            <Input
              id="display_order"
              type="number"
              value={formData.display_order}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  display_order: parseInt(e.target.value) || 0,
                })}
              placeholder="0"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : null}
              {tenant?.id ? "Update" : "Create"} Tenant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingTenant, setEditingTenant] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tenantsData, userData] = await Promise.all([
        Tenant.list("display_order"),
        User.me(),
      ]);
      setTenants(tenantsData);
      setCurrentUser(userData);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error loading tenants:", error);
      }
      toast.error("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTenant = async (formData) => {
    try {
      if (editingTenant?.id) {
        await Tenant.update(editingTenant.id, formData);
        toast.success("Tenant updated successfully!");
      } else {
        await Tenant.create(formData);
        toast.success("Tenant created successfully!");
      }
      setEditingTenant(null);
      setShowCreateForm(false);
      loadData();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving tenant:", error);
      }
      toast.error("Failed to save tenant");
    }
  };

  const handleCancelEdit = () => {
    setEditingTenant(null);
    setShowCreateForm(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin mr-3" />
        <span>Loading tenants...</span>
      </div>
    );
  }

  if (currentUser?.role !== "admin" && currentUser?.role !== "superadmin") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You do not have permission to manage tenants. Only admins and
          superadmins can access this page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-8 h-8 text-blue-600" />
            Tenant Management
          </h1>
          <p className="text-slate-600 mt-1">
            Manage client organizations and their settings
          </p>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Tenant
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Tenants</CardTitle>
          <CardDescription>
            Manage tenant organizations, their branding, and ElevenLabs AI agent
            configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>AI Agent</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {tenant.logo_url
                        ? (
                          <img
                            src={tenant.logo_url}
                            alt={tenant.name}
                            className="w-8 h-8 rounded object-cover"
                          />
                        )
                        : (
                          <div className="w-8 h-8 bg-slate-200 rounded flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-slate-600" />
                          </div>
                        )}
                      <div>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-sm text-slate-500">
                          ID: {tenant.id}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {tenant.domain
                      ? <Badge variant="outline">{tenant.domain}</Badge>
                      : <span className="text-slate-400">No domain</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {tenant.industry
                        ? tenant.industry.replace(/_/g, " ")
                        : "Not set"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {tenant.elevenlabs_agent_id
                      ? (
                        <Badge className="bg-green-100 text-green-800">
                          Configured
                        </Badge>
                      )
                      : <Badge variant="outline">Not set</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">View Users</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingTenant(tenant)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {tenants.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No tenants found. Create your first tenant to get started.
            </div>
          )}
        </CardContent>
      </Card>

      {editingTenant && (
        <TenantForm
          tenant={editingTenant}
          onSave={handleSaveTenant}
          onCancel={handleCancelEdit}
        />
      )}

      {showCreateForm && (
        <TenantForm
          tenant={{}}
          onSave={handleSaveTenant}
          onCancel={handleCancelEdit}
        />
      )}
    </div>
  );
}
