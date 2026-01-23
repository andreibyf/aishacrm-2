/**
 * Project Management Page
 * Manages projects and team assignments across the organization
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { ConstructionProject, ConstructionAssignment, Account, Contact, Lead, Worker } from "@/api/entities";
import { useTenant } from "@/components/shared/tenantContext";
import { useUser } from "@/components/shared/useUser";
import { useAuthCookiesReady } from "@/components/shared/useAuthCookiesReady";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Plus,
  Search,
  Calendar,
  DollarSign,
  Users,
  MapPin,
  Edit,
  Trash2,
  Eye,
  UserPlus,
  RefreshCw,
  Loader2,
  ArrowLeft,
  CheckCircle,
  Clock,
  XCircle,
  Pause,
  Milestone,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Status badge colors
const statusColors = {
  Planned: "bg-blue-100 text-blue-800",
  Active: "bg-green-100 text-green-800",
  Completed: "bg-gray-100 text-gray-800",
  Cancelled: "bg-red-100 text-red-800",
  "On Hold": "bg-yellow-100 text-yellow-800",
  Pending: "bg-orange-100 text-orange-800",
};

const statusIcons = {
  Planned: Clock,
  Active: CheckCircle,
  Completed: CheckCircle,
  Cancelled: XCircle,
  "On Hold": Pause,
  Pending: Clock,
};

// Format currency
const formatCurrency = (value) => {
  if (!value) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
};

export default function ConstructionProjects() {
  const { selectedTenantId, currentTenantData } = useTenant();
  const { user } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();

  const effectiveTenantId = selectedTenantId || user?.tenant_id || currentTenantData?.id;

  // State
  const [projects, setProjects] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialog states
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [showDetailView, setShowDetailView] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);

  // Form state for project
  const [projectForm, setProjectForm] = useState({
    project_name: "",
    account_id: "",
    lead_id: "",
    site_name: "",
    site_address: "",
    project_manager_contact_id: "",
    supervisor_contact_id: "",
    start_date: "",
    end_date: "",
    project_value: "",
    status: "Planned",
    description: "",
    notes: "",
  });

  // Form state for assignment
  const [assignmentForm, setAssignmentForm] = useState({
    worker_id: "",
    role: "",
    start_date: "",
    end_date: "",
    pay_rate: "",
    bill_rate: "",
    rate_type: "hourly",
    status: "Active",
    notes: "",
  });

  // Milestone states
  const [milestones, setMilestones] = useState([]);
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [milestoneForm, setMilestoneForm] = useState({
    title: "",
    description: "",
    due_date: "",
    status: "pending",
  });

  // Load data
  const loadData = useCallback(async () => {
    if (!effectiveTenantId || !authCookiesReady) return;

    setLoading(true);
    try {
      const [projectsData, accountsData, contactsData, leadsData, workersData] = await Promise.all([
        ConstructionProject.list({ tenant_id: effectiveTenantId }),
        Account.list({ tenant_id: effectiveTenantId }),
        Contact.list({ tenant_id: effectiveTenantId }),
        Lead.list({ tenant_id: effectiveTenantId }),
        Worker.list({ tenant_id: effectiveTenantId }),
      ]);

      setProjects(Array.isArray(projectsData) ? projectsData : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : accountsData?.data || []);
      setContacts(Array.isArray(contactsData) ? contactsData : contactsData?.data || []);
      setLeads(Array.isArray(leadsData) ? leadsData : leadsData?.data || []);
      setWorkers(Array.isArray(workersData) ? workersData : workersData?.data || []);
    } catch (err) {
      console.error("[ConstructionProjects] Load error:", err);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [effectiveTenantId, authCookiesReady]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        !searchTerm ||
        project.project_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.site_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.account?.name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || project.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [projects, searchTerm, statusFilter]);

  // Handlers
  const handleCreateProject = () => {
    setEditingProject(null);
    setProjectForm({
      project_name: "",
      account_id: "__none__",
      lead_id: "__none__",
      site_name: "",
      site_address: "",
      project_manager_contact_id: "__none__",
      supervisor_contact_id: "__none__",
      start_date: "",
      end_date: "",
      project_value: "",
      status: "Planned",
      description: "",
      notes: "",
    });
    setShowProjectDialog(true);
  };

  const handleEditProject = (project) => {
    setEditingProject(project);
    setProjectForm({
      project_name: project.project_name || "",
      account_id: project.account_id || "__none__",
      lead_id: project.lead_id || "__none__",
      site_name: project.site_name || "",
      site_address: project.site_address || "",
      project_manager_contact_id: project.project_manager_contact_id || "__none__",
      supervisor_contact_id: project.supervisor_contact_id || "__none__",
      start_date: project.start_date || "",
      end_date: project.end_date || "",
      project_value: project.project_value || "",
      status: project.status || "Planned",
      description: project.description || "",
      notes: project.notes || "",
    });
    setShowProjectDialog(true);
  };

  const handleSaveProject = async () => {
    if (!projectForm.project_name?.trim()) {
      toast.error("Project name is required");
      return;
    }

    // Helper to convert __none__ sentinel value to null
    const toNullable = (v) => (!v || v === "__none__" ? null : v);

    try {
      const payload = {
        ...projectForm,
        tenant_id: effectiveTenantId,
        project_value: projectForm.project_value ? parseFloat(projectForm.project_value) : null,
        account_id: toNullable(projectForm.account_id),
        lead_id: toNullable(projectForm.lead_id),
        project_manager_contact_id: toNullable(projectForm.project_manager_contact_id),
        supervisor_contact_id: toNullable(projectForm.supervisor_contact_id),
      };

      if (editingProject) {
        await ConstructionProject.update(editingProject.id, payload);
        toast.success("Project updated");
      } else {
        await ConstructionProject.create(payload);
        toast.success("Project created");
      }

      setShowProjectDialog(false);
      loadData();
    } catch (err) {
      console.error("[ConstructionProjects] Save error:", err);
      toast.error(err.message || "Failed to save project");
    }
  };

  const handleDeleteProject = async (project) => {
    if (!confirm(`Delete project "${project.project_name}"? This will also delete all assignments.`)) {
      return;
    }

    try {
      await ConstructionProject.delete(project.id);
      toast.success("Project deleted");
      loadData();
    } catch (err) {
      console.error("[ConstructionProjects] Delete error:", err);
      toast.error(err.message || "Failed to delete project");
    }
  };

  const handleViewProject = async (project) => {
    try {
      const fullProject = await ConstructionProject.get(project.id);
      setSelectedProject(fullProject);
      setShowDetailView(true);
      // Load milestones for this project
      loadMilestones(project.id);
    } catch (err) {
      console.error("[ConstructionProjects] View error:", err);
      toast.error("Failed to load project details");
    }
  };

  // Assignment handlers
  const handleAddAssignment = () => {
    setEditingAssignment(null);
    setAssignmentForm({
      worker_id: "",
      role: "",
      start_date: "",
      end_date: "",
      pay_rate: "",
      bill_rate: "",
      rate_type: "hourly",
      status: "Active",
      notes: "",
    });
    setShowAssignmentDialog(true);
  };

  const handleEditAssignment = (assignment) => {
    setEditingAssignment(assignment);
    setAssignmentForm({
      worker_id: assignment.worker_id || "",
      role: assignment.role || "",
      start_date: assignment.start_date || "",
      end_date: assignment.end_date || "",
      pay_rate: assignment.pay_rate || "",
      bill_rate: assignment.bill_rate || "",
      rate_type: assignment.rate_type || "hourly",
      status: assignment.status || "Active",
      notes: assignment.notes || "",
    });
    setShowAssignmentDialog(true);
  };

  const handleSaveAssignment = async () => {
    if (!assignmentForm.worker_id) {
      toast.error("Please select a worker");
      return;
    }
    if (!assignmentForm.role?.trim()) {
      toast.error("Role is required");
      return;
    }

    try {
      const payload = {
        ...assignmentForm,
        tenant_id: effectiveTenantId,
        project_id: selectedProject.id,
        pay_rate: assignmentForm.pay_rate ? parseFloat(assignmentForm.pay_rate) : null,
        bill_rate: assignmentForm.bill_rate ? parseFloat(assignmentForm.bill_rate) : null,
      };

      if (editingAssignment) {
        await ConstructionAssignment.update(editingAssignment.id, payload);
        toast.success("Assignment updated");
      } else {
        await ConstructionAssignment.create(payload);
        toast.success("Worker assigned");
      }

      setShowAssignmentDialog(false);
      // Refresh project detail
      const refreshed = await ConstructionProject.get(selectedProject.id);
      setSelectedProject(refreshed);
    } catch (err) {
      console.error("[ConstructionProjects] Assignment save error:", err);
      toast.error(err.message || "Failed to save assignment");
    }
  };

  const handleDeleteAssignment = async (assignment) => {
    const workerName = assignment.worker
      ? `${assignment.worker.first_name} ${assignment.worker.last_name}`
      : "this worker";
    if (!confirm(`Remove ${workerName} from this project?`)) {
      return;
    }

    try {
      await ConstructionAssignment.delete(assignment.id);
      toast.success("Assignment removed");
      // Refresh project detail
      const refreshed = await ConstructionProject.get(selectedProject.id);
      setSelectedProject(refreshed);
    } catch (err) {
      console.error("[ConstructionProjects] Assignment delete error:", err);
      toast.error(err.message || "Failed to remove assignment");
    }
  };

  // Milestone handlers
  const loadMilestones = async (projectId) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:4001"}/api/construction/projects/${projectId}/milestones`,
        { credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to load milestones");
      const data = await response.json();
      setMilestones(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[ConstructionProjects] Milestones load error:", err);
      setMilestones([]);
    }
  };

  const handleAddMilestone = () => {
    setEditingMilestone(null);
    setMilestoneForm({
      title: "",
      description: "",
      due_date: "",
      status: "pending",
    });
    setShowMilestoneDialog(true);
  };

  const handleEditMilestone = (milestone) => {
    setEditingMilestone(milestone);
    setMilestoneForm({
      title: milestone.title || "",
      description: milestone.description || "",
      due_date: milestone.due_date || "",
      status: milestone.status || "pending",
    });
    setShowMilestoneDialog(true);
  };

  const handleSaveMilestone = async () => {
    if (!milestoneForm.title?.trim()) {
      toast.error("Milestone title is required");
      return;
    }

    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:4001";
      const payload = { ...milestoneForm };

      if (editingMilestone) {
        const response = await fetch(
          `${baseUrl}/api/construction/projects/${selectedProject.id}/milestones/${editingMilestone.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          }
        );
        if (!response.ok) throw new Error("Failed to update milestone");
        toast.success("Milestone updated");
      } else {
        const response = await fetch(
          `${baseUrl}/api/construction/projects/${selectedProject.id}/milestones`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          }
        );
        if (!response.ok) throw new Error("Failed to create milestone");
        toast.success("Milestone created");
      }

      setShowMilestoneDialog(false);
      loadMilestones(selectedProject.id);
    } catch (err) {
      console.error("[ConstructionProjects] Milestone save error:", err);
      toast.error(err.message || "Failed to save milestone");
    }
  };

  const handleDeleteMilestone = async (milestone) => {
    if (!confirm(`Delete milestone "${milestone.title}"?`)) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:4001"}/api/construction/projects/${selectedProject.id}/milestones/${milestone.id}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!response.ok) throw new Error("Failed to delete milestone");
      toast.success("Milestone deleted");
      loadMilestones(selectedProject.id);
    } catch (err) {
      console.error("[ConstructionProjects] Milestone delete error:", err);
      toast.error(err.message || "Failed to delete milestone");
    }
  };

  const handleToggleMilestoneStatus = async (milestone) => {
    const newStatus = milestone.status === "completed" ? "pending" : "completed";
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL || "http://localhost:4001"}/api/construction/projects/${selectedProject.id}/milestones/${milestone.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (!response.ok) throw new Error("Failed to update milestone");
      loadMilestones(selectedProject.id);
    } catch (err) {
      console.error("[ConstructionProjects] Milestone toggle error:", err);
      toast.error("Failed to update milestone");
    }
  };

  // Get contact name helper
  const getContactName = (contact) => {
    if (!contact) return "—";
    return `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email || "—";
  };

  // Common team roles for autocomplete
  const commonRoles = [
    "Team Member",
    "Developer",
    "Designer",
    "Analyst",
    "Consultant",
    "Specialist",
    "Coordinator",
    "Lead",
    "Manager",
    "Director",
    "Project Manager",
    "Supervisor",
    "Contractor",
    "Technician",
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail View
  if (showDetailView && selectedProject) {
    const StatusIcon = statusIcons[selectedProject.status] || Clock;

    return (
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowDetailView(false);
              setSelectedProject(null);
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{selectedProject.project_name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={statusColors[selectedProject.status]}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {selectedProject.status}
              </Badge>
              {selectedProject.account?.name && (
                <Badge variant="outline">
                  <Building2 className="h-3 w-3 mr-1" />
                  {selectedProject.account.name}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={() => handleEditProject(selectedProject)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Project
          </Button>
        </div>

        {/* Project Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Site</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{selectedProject.site_name || "—"}</p>
                  <p className="text-sm text-muted-foreground">{selectedProject.site_address || ""}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Dates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    {formatDate(selectedProject.start_date)} — {formatDate(selectedProject.end_date)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Project Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2">
                <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <p className="font-medium text-lg">{formatCurrency(selectedProject.project_value)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Key Contacts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Project Manager</Label>
                <p className="font-medium">{getContactName(selectedProject.project_manager)}</p>
                {selectedProject.project_manager?.email && (
                  <p className="text-sm text-muted-foreground">{selectedProject.project_manager.email}</p>
                )}
              </div>
              <div>
                <Label className="text-muted-foreground">Supervisor</Label>
                <p className="font-medium">{getContactName(selectedProject.supervisor)}</p>
                {selectedProject.supervisor?.email && (
                  <p className="text-sm text-muted-foreground">{selectedProject.supervisor.email}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Description & Notes */}
        {(selectedProject.description || selectedProject.notes) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedProject.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="mt-1 whitespace-pre-wrap">{selectedProject.description}</p>
                </div>
              )}
              {selectedProject.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="mt-1 whitespace-pre-wrap">{selectedProject.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Milestones */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Milestone className="h-5 w-5" />
                Milestones
              </CardTitle>
              <CardDescription>
                {milestones.length} milestone{milestones.length !== 1 ? "s" : ""} • {milestones.filter(m => m.status === "completed").length} completed
              </CardDescription>
            </div>
            <Button onClick={handleAddMilestone}>
              <Plus className="h-4 w-4 mr-2" />
              Add Milestone
            </Button>
          </CardHeader>
          <CardContent>
            {milestones.length > 0 ? (
              <div className="space-y-2">
                {milestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      milestone.status === "completed" ? "bg-green-50 border-green-200" : "bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleMilestoneStatus(milestone)}
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          milestone.status === "completed"
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-gray-300 hover:border-green-400"
                        }`}
                      >
                        {milestone.status === "completed" && <CheckCircle className="h-3 w-3" />}
                      </button>
                      <div>
                        <p className={`font-medium ${milestone.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                          {milestone.title}
                        </p>
                        {milestone.description && (
                          <p className="text-sm text-muted-foreground">{milestone.description}</p>
                        )}
                        {milestone.due_date && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <Calendar className="h-3 w-3" />
                            Due: {formatDate(milestone.due_date)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        milestone.status === "completed" ? "bg-green-100 text-green-800" :
                        milestone.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                        milestone.status === "cancelled" ? "bg-red-100 text-red-800" :
                        "bg-gray-100 text-gray-800"
                      }`}>
                        {milestone.status === "in_progress" ? "In Progress" : milestone.status?.charAt(0).toUpperCase() + milestone.status?.slice(1)}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => handleEditMilestone(milestone)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteMilestone(milestone)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Milestone className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No milestones yet</p>
                <p className="text-sm">Add milestones to track project progress</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Worker Assignments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Worker Assignments</CardTitle>
              <CardDescription>
                {selectedProject.assignments?.length || 0} workers assigned to this project
              </CardDescription>
            </div>
            <Button onClick={handleAddAssignment}>
              <UserPlus className="h-4 w-4 mr-2" />
              Assign Worker
            </Button>
          </CardHeader>
          <CardContent>
            {selectedProject.assignments?.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Worker</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Pay Rate</TableHead>
                    <TableHead>Bill Rate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedProject.assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{getContactName(assignment.worker)}</p>
                          {assignment.worker?.email && (
                            <p className="text-sm text-muted-foreground">{assignment.worker.email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{assignment.role}</TableCell>
                      <TableCell>
                        {formatDate(assignment.start_date)}
                        {assignment.end_date && ` — ${formatDate(assignment.end_date)}`}
                      </TableCell>
                      <TableCell>
                        {assignment.pay_rate
                          ? `$${assignment.pay_rate}/${assignment.rate_type}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {assignment.bill_rate
                          ? `$${assignment.bill_rate}/${assignment.rate_type}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[assignment.status]}>{assignment.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditAssignment(assignment)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteAssignment(assignment)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No workers assigned yet</p>
                <Button variant="outline" className="mt-4" onClick={handleAddAssignment}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign First Worker
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assignment Dialog */}
        <Dialog open={showAssignmentDialog} onOpenChange={setShowAssignmentDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingAssignment ? "Edit Assignment" : "Assign Worker"}</DialogTitle>
              <DialogDescription>
                {editingAssignment
                  ? "Update worker assignment details"
                  : "Assign a worker to this project"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Worker *</Label>
                <Select
                  value={assignmentForm.worker_id}
                  onValueChange={(v) => {
                    if (v === "__create_new__") {
                      // Open workers page in new tab
                      window.open('/Workers', '_blank');
                      toast.info("Create the worker, then come back and refresh this dialog");
                    } else {
                      setAssignmentForm({ ...assignmentForm, worker_id: v });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a worker..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__create_new__" className="text-blue-600 font-medium">
                      <Plus className="h-4 w-4 inline mr-2" />
                      Create New Worker
                    </SelectItem>
                    {workers.length > 0 && <SelectItem value="__divider__" disabled>────────────────</SelectItem>}
                    {workers.map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>
                        {worker.first_name} {worker.last_name}
                        {worker.primary_skill && ` (${worker.primary_skill})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Worker not in list? Create new worker contact above.
                </p>
              </div>

              <div>
                <Label>Role *</Label>
                <Input
                  placeholder="Enter role (e.g., Laborer, Electrician, Carpenter)..."
                  value={assignmentForm.role}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, role: e.target.value })}
                  list="role-suggestions"
                />
                <datalist id="role-suggestions">
                  {commonRoles.map((role) => (
                    <option key={role} value={role} />
                  ))}
                </datalist>
                <p className="text-xs text-muted-foreground mt-1">
                  Common roles available as suggestions
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={assignmentForm.start_date}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={assignmentForm.end_date}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Pay Rate ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={assignmentForm.pay_rate}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, pay_rate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Bill Rate ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={assignmentForm.bill_rate}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, bill_rate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Rate Type</Label>
                  <Select
                    value={assignmentForm.rate_type}
                    onValueChange={(v) => setAssignmentForm({ ...assignmentForm, rate_type: v })}
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

              <div>
                <Label>Status</Label>
                <Select
                  value={assignmentForm.status}
                  onValueChange={(v) => setAssignmentForm({ ...assignmentForm, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  placeholder="Assignment notes..."
                  value={assignmentForm.notes}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAssignmentDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveAssignment}>
                {editingAssignment ? "Update" : "Assign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Projects List View
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Project Management
          </h1>
          <p className="text-muted-foreground">
            Manage projects and team assignments
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleCreateProject}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Planned">Planned</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="On Hold">On Hold</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Card>
        <CardContent className="pt-6">
          {filteredProjects.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Workers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => {
                  const StatusIcon = statusIcons[project.status] || Clock;
                  return (
                    <TableRow key={project.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{project.project_name}</p>
                        </div>
                      </TableCell>
                      <TableCell>{project.account?.name || "—"}</TableCell>
                      <TableCell>
                        <div>
                          <p>{project.site_name || "—"}</p>
                          {project.site_address && (
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {project.site_address}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(project.start_date)}
                          {project.end_date && (
                            <>
                              <br />
                              <span className="text-muted-foreground">to</span>{" "}
                              {formatDate(project.end_date)}
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(project.project_value)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          <Users className="h-3 w-3 mr-1" />
                          {project.assignments?.length || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[project.status]}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {project.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewProject(project)}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditProject(project)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteProject(project)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">No projects found</p>
              <p className="mb-4">Create your first project to start tracking</p>
              <Button onClick={handleCreateProject}>
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Dialog */}
      <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "Create Project"}</DialogTitle>
            <DialogDescription>
              {editingProject
                ? "Update project details"
                : "Create a new project"}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div>
                <Label>Project Name *</Label>
                <Input
                  placeholder="e.g., Website Redesign, Phase 2 Rollout"
                  value={projectForm.project_name}
                  onChange={(e) => setProjectForm({ ...projectForm, project_name: e.target.value })}
                />
              </div>

              <div>
                <Label>Client (Account)</Label>
                <Select
                  value={projectForm.account_id}
                  onValueChange={(v) => setProjectForm({ ...projectForm, account_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client company..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Original Lead (Optional)</Label>
                <Select
                  value={projectForm.lead_id}
                  onValueChange={(v) => setProjectForm({ ...projectForm, lead_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Link to original lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.first_name} {lead.last_name} {lead.company ? `(${lead.company})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Location Name</Label>
                  <Input
                    placeholder="e.g., Main Office, Site A"
                    value={projectForm.site_name}
                    onChange={(e) => setProjectForm({ ...projectForm, site_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={projectForm.status}
                    onValueChange={(v) => setProjectForm({ ...projectForm, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Planned">Planned</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="On Hold">On Hold</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Location Address</Label>
                <Input
                  placeholder="Full address..."
                  value={projectForm.site_address}
                  onChange={(e) => setProjectForm({ ...projectForm, site_address: e.target.value })}
                />
              </div>
            </TabsContent>

            <TabsContent value="contacts" className="space-y-4 mt-4">
              <div>
                <Label>Project Manager</Label>
                <Select
                  value={projectForm.project_manager_contact_id}
                  onValueChange={(v) =>
                    setProjectForm({ ...projectForm, project_manager_contact_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project manager..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {getContactName(contact)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Supervisor</Label>
                <Select
                  value={projectForm.supervisor_contact_id}
                  onValueChange={(v) =>
                    setProjectForm({ ...projectForm, supervisor_contact_id: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supervisor..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {contacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {getContactName(contact)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={projectForm.start_date}
                    onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={projectForm.end_date}
                    onChange={(e) => setProjectForm({ ...projectForm, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Project Value ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Contract or expected revenue value"
                  value={projectForm.project_value}
                  onChange={(e) => setProjectForm({ ...projectForm, project_value: e.target.value })}
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  placeholder="Project description..."
                  rows={3}
                  value={projectForm.description}
                  onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  placeholder="Internal notes..."
                  rows={3}
                  value={projectForm.notes}
                  onChange={(e) => setProjectForm({ ...projectForm, notes: e.target.value })}
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProjectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProject}>
              {editingProject ? "Update" : "Create"} Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Milestone Dialog */}
      <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMilestone ? "Edit" : "Add"} Milestone</DialogTitle>
            <DialogDescription>
              {editingMilestone ? "Update milestone details" : "Create a new milestone for this project"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Title *</Label>
              <Input
                placeholder="e.g., Design Phase Complete"
                value={milestoneForm.title}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                placeholder="Details about this milestone..."
                rows={3}
                value={milestoneForm.description}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={milestoneForm.due_date}
                onChange={(e) => setMilestoneForm({ ...milestoneForm, due_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={milestoneForm.status}
                onValueChange={(value) => setMilestoneForm({ ...milestoneForm, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMilestoneDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveMilestone}>
              {editingMilestone ? "Update" : "Add"} Milestone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
