/**
 * Workers Page - Contractor/Temp Labor Management
 * Manages construction workers, contractors, and temporary labor pool
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Worker } from "@/api/entities";
import { useTenant } from "@/components/shared/tenantContext";
import { useUser } from "@/components/shared/useUser";
import { useEntityLabel } from "@/components/shared/EntityLabelsContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
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
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  HardHat,
  Phone,
  Mail,
  Award,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirmDialog } from "@/components/shared/ConfirmDialog";

// Status badge colors
const statusColors = {
  Active: "bg-green-100 text-green-800",
  Inactive: "bg-gray-100 text-gray-800",
  Blacklisted: "bg-red-100 text-red-800",
};

const workerTypeColors = {
  Contractor: "bg-blue-100 text-blue-800",
  "Temp Labor": "bg-purple-100 text-purple-800",
  Subcontractor: "bg-orange-100 text-orange-800",
};

export default function WorkersPage() {
  const { plural: workersLabel, singular: workerLabel } = useEntityLabel('workers');
  const { selectedTenantId, currentTenantData } = useTenant();
  const { user } = useUser();
  const { ConfirmDialog: ConfirmDialogPortal, confirm: confirmDialog } = useConfirmDialog();

  const effectiveTenantId = selectedTenantId || user?.tenant_id || currentTenantData?.id;

  // State
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workerTypeFilter, setWorkerTypeFilter] = useState("all");
  const [skillFilter, setSkillFilter] = useState("");

  // Dialog states
  const [showDialog, setShowDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    worker_type: "Contractor",
    status: "Active",
    primary_skill: "",
    skills: [],
    certifications: [],
    default_pay_rate: "",
    default_rate_type: "hourly",
    available_from: "",
    available_until: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    notes: "",
  });

  // Load workers
  const loadWorkers = useCallback(async () => {
    if (!effectiveTenantId) return;
    setLoading(true);
    try {
      const data = await Worker.list({ tenant_id: effectiveTenantId });
      setWorkers(data || []);
    } catch (error) {
      console.error("Failed to load workers:", error);
      toast.error("Failed to load workers");
    } finally {
      setLoading(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  // Filtered workers
  const filteredWorkers = useMemo(() => {
    return workers.filter((worker) => {
      const matchesSearch =
        !searchTerm ||
        worker.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        worker.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        worker.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        worker.phone?.includes(searchTerm) ||
        worker.primary_skill?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || worker.status === statusFilter;

      const matchesType =
        workerTypeFilter === "all" || worker.worker_type === workerTypeFilter;

      const matchesSkill =
        !skillFilter ||
        worker.primary_skill?.toLowerCase().includes(skillFilter.toLowerCase()) ||
        worker.skills?.some((s) =>
          s.toLowerCase().includes(skillFilter.toLowerCase())
        );

      return matchesSearch && matchesStatus && matchesType && matchesSkill;
    });
  }, [workers, searchTerm, statusFilter, workerTypeFilter, skillFilter]);

  // Handle create/edit dialog
  const openDialog = (worker = null) => {
    if (worker) {
      setEditingWorker(worker);
      setForm({
        first_name: worker.first_name || "",
        last_name: worker.last_name || "",
        email: worker.email || "",
        phone: worker.phone || "",
        worker_type: worker.worker_type || "Contractor",
        status: worker.status || "Active",
        primary_skill: worker.primary_skill || "",
        skills: worker.skills || [],
        certifications: worker.certifications || [],
        default_pay_rate: worker.default_pay_rate || "",
        default_rate_type: worker.default_rate_type || "hourly",
        available_from: worker.available_from || "",
        available_until: worker.available_until || "",
        emergency_contact_name: worker.emergency_contact_name || "",
        emergency_contact_phone: worker.emergency_contact_phone || "",
        notes: worker.notes || "",
      });
    } else {
      setEditingWorker(null);
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        worker_type: "Contractor",
        status: "Active",
        primary_skill: "",
        skills: [],
        certifications: [],
        default_pay_rate: "",
        default_rate_type: "hourly",
        available_from: "",
        available_until: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        notes: "",
      });
    }
    setShowDialog(true);
  };

  // Handle save
  const handleSave = async () => {
    if (!form.first_name || !form.last_name) {
      toast.error("First name and last name are required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        tenant_id: effectiveTenantId,
        default_pay_rate: form.default_pay_rate
          ? parseFloat(form.default_pay_rate)
          : null,
      };

      if (editingWorker) {
        await Worker.update(editingWorker.id, payload);
        toast.success(`${workerLabel} updated successfully`);
      } else {
        await Worker.create(payload);
        toast.success(`${workerLabel} created successfully`);
      }

      setShowDialog(false);
      loadWorkers();
    } catch (error) {
      console.error("Failed to save worker:", error);
      toast.error(
        `Failed to ${editingWorker ? "update" : "create"} ${workerLabel.toLowerCase()}`
      );
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async (worker) => {
    const confirmed = await confirmDialog({
      title: `Delete ${workerLabel}`,
      description: `Are you sure you want to delete ${worker.first_name} ${worker.last_name}? This action cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });

    if (!confirmed) return;

    try {
      await Worker.delete(worker.id);
      toast.success(`${workerLabel} deleted successfully`);
      loadWorkers();
    } catch (error) {
      console.error("Failed to delete worker:", error);
      toast.error(`Failed to delete ${workerLabel.toLowerCase()}`);
    }
  };

  // Handle array input (skills, certifications)
  const handleArrayInput = (field, value) => {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    setForm({ ...form, [field]: items });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <HardHat className="h-8 w-8" />
            {workersLabel}
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage contractors, temp labor, and subcontractors
          </p>
        </div>
        <Button onClick={() => openDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Add {workerLabel}
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search workers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Blacklisted">Blacklisted</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={workerTypeFilter}
              onValueChange={setWorkerTypeFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Worker Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Contractor">Contractor</SelectItem>
                <SelectItem value="Temp Labor">Temp Labor</SelectItem>
                <SelectItem value="Subcontractor">Subcontractor</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Filter by skill..."
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Workers Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filteredWorkers.length} {filteredWorkers.length === 1 ? workerLabel : workersLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No {workersLabel.toLowerCase()} found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Primary Skill</TableHead>
                  <TableHead>Pay Rate</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkers.map((worker) => (
                  <TableRow key={worker.id}>
                    <TableCell className="font-medium">
                      {worker.first_name} {worker.last_name}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {worker.email && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {worker.email}
                          </div>
                        )}
                        {worker.phone && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {worker.phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={workerTypeColors[worker.worker_type]}>
                        {worker.worker_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[worker.status]}>
                        {worker.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {worker.primary_skill && (
                        <div className="flex items-center gap-1">
                          <Award className="h-3 w-3 text-muted-foreground" />
                          {worker.primary_skill}
                        </div>
                      )}
                      {worker.skills?.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          +{worker.skills.length} more
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {worker.default_pay_rate && (
                        <div className="flex items-center gap-1 text-sm">
                          <DollarSign className="h-3 w-3" />
                          {worker.default_pay_rate}/{worker.default_rate_type}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDialog(worker)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(worker)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingWorker ? `Edit ${workerLabel}` : `Add ${workerLabel}`}
            </DialogTitle>
            <DialogDescription>
              {editingWorker
                ? `Update ${workerLabel.toLowerCase()} information`
                : `Add a new ${workerLabel.toLowerCase()} to your pool`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="first_name">
                  First Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) =>
                    setForm({ ...form, first_name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="last_name">
                  Last Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) =>
                    setForm({ ...form, last_name: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            {/* Worker Type & Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="worker_type">Worker Type</Label>
                <Select
                  value={form.worker_type}
                  onValueChange={(value) =>
                    setForm({ ...form, worker_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Contractor">Contractor</SelectItem>
                    <SelectItem value="Temp Labor">Temp Labor</SelectItem>
                    <SelectItem value="Subcontractor">Subcontractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm({ ...form, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Blacklisted">Blacklisted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Skills */}
            <div>
              <Label htmlFor="primary_skill">Primary Skill</Label>
              <Input
                id="primary_skill"
                placeholder="e.g., Carpentry, Electrical, Plumbing"
                value={form.primary_skill}
                onChange={(e) =>
                  setForm({ ...form, primary_skill: e.target.value })
                }
              />
            </div>

            <div>
              <Label htmlFor="skills">Additional Skills (comma-separated)</Label>
              <Input
                id="skills"
                placeholder="e.g., Framing, Drywall, Painting"
                value={form.skills.join(", ")}
                onChange={(e) => handleArrayInput("skills", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="certifications">
                Certifications (comma-separated)
              </Label>
              <Input
                id="certifications"
                placeholder="e.g., OSHA 30, Forklift, First Aid"
                value={form.certifications.join(", ")}
                onChange={(e) =>
                  handleArrayInput("certifications", e.target.value)
                }
              />
            </div>

            {/* Pay Rate */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="default_pay_rate">Default Pay Rate</Label>
                <Input
                  id="default_pay_rate"
                  type="number"
                  step="0.01"
                  placeholder="25.00"
                  value={form.default_pay_rate}
                  onChange={(e) =>
                    setForm({ ...form, default_pay_rate: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="default_rate_type">Rate Type</Label>
                <Select
                  value={form.default_rate_type}
                  onValueChange={(value) =>
                    setForm({ ...form, default_rate_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fixed">Fixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Availability */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="available_from">Available From</Label>
                <Input
                  id="available_from"
                  type="date"
                  value={form.available_from}
                  onChange={(e) =>
                    setForm({ ...form, available_from: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="available_until">Available Until</Label>
                <Input
                  id="available_until"
                  type="date"
                  value={form.available_until}
                  onChange={(e) =>
                    setForm({ ...form, available_until: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="emergency_contact_name">
                  Emergency Contact Name
                </Label>
                <Input
                  id="emergency_contact_name"
                  value={form.emergency_contact_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      emergency_contact_name: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="emergency_contact_phone">
                  Emergency Contact Phone
                </Label>
                <Input
                  id="emergency_contact_phone"
                  value={form.emergency_contact_phone}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      emergency_contact_phone: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>{editingWorker ? "Update" : "Create"} {workerLabel}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <ConfirmDialogPortal />
    </div>
  );
}
