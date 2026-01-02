import { useEffect, useState } from "react";
import {
  CheckCircle,
  Clock,
  Edit,
  Pause,
  Play,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Workflow } from "@/api/entities";
import { useUser } from "../components/shared/useUser.js";
import WorkflowBuilder from "../components/workflows/WorkflowBuilder";
import { format } from "date-fns";
import { toast } from "sonner";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);
  const { loading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Fetch workflows for current tenant context
      const workflowsData = await Workflow.list();
      setWorkflows(workflowsData || []);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to load workflows:", error);
      }
      toast.error("Failed to load workflows");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingWorkflow(null);
    setShowBuilder(true);
  };

  const handleEdit = (workflow) => {
    setEditingWorkflow(workflow);
    setShowBuilder(true);
  };

  const handleToggleActive = async (workflow) => {
    try {
      await Workflow.update(workflow.id, { is_active: !workflow.is_active });
      toast.success(
        `Workflow ${!workflow.is_active ? "activated" : "deactivated"}`,
      );
      loadData();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to toggle workflow:", error);
      }
      toast.error("Failed to update workflow");
    }
  };

  const handleDelete = async (workflow) => {
    if (!confirm(`Delete workflow "${workflow.name}"?`)) return;

    try {
      await Workflow.delete(workflow.id);
      toast.success("Workflow deleted");
      loadData();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to delete workflow:", error);
      }
      toast.error("Failed to delete workflow");
    }
  };

  const handleSave = async () => {
    setShowBuilder(false);
    setEditingWorkflow(null);
    // Refresh the list after a brief delay to ensure backend has processed
    setTimeout(() => {
      loadData();
    }, 300);
  };

  if (loading || userLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-400">Loading workflows...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
              <Zap className="w-8 h-8 text-purple-400" />
              Workflows
            </h1>
            <p className="text-slate-400 mt-1">
              Automate your CRM with custom workflows
            </p>
          </div>
          <Button
            onClick={handleCreateNew}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Workflow
          </Button>
        </div>

        {/* Workflows List */}
        {workflows.length === 0
          ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="py-12 text-center">
                <Zap className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-300 mb-2">
                  No workflows yet
                </h3>
                <p className="text-slate-500 mb-4">
                  Create your first workflow to automate your CRM
                </p>
                <Button
                  onClick={handleCreateNew}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Workflow
                </Button>
              </CardContent>
            </Card>
          )
          : (
            <div className="grid gap-4">
              {workflows.map((workflow) => (
                <Card
                  key={workflow.id}
                  className="bg-slate-800 border-slate-700 hover:bg-slate-700/50 transition-colors"
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-100">
                            {workflow.name}
                          </h3>
                          <Badge
                            variant={workflow.is_active
                              ? "default"
                              : "secondary"}
                            className={workflow.is_active
                              ? "bg-green-600"
                              : "bg-slate-600"}
                          >
                            {workflow.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-slate-400 text-sm mb-3">
                          {workflow.description || "No description"}
                        </p>

                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            <span>{workflow.trigger?.type || "webhook"}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            <span>
                              {workflow.execution_count || 0} executions
                            </span>
                          </div>
                          {workflow.last_executed && (
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>
                                Last run:{" "}
                                {format(
                                  new Date(workflow.last_executed),
                                  "MMM d, h:mm a",
                                )}
                              </span>
                            </div>
                          )}
                        </div>

                        {workflow.webhook_url && (
                          <div className="mt-3 p-2 bg-slate-900 rounded border border-slate-700">
                            <p className="text-xs text-slate-500 mb-1">
                              Webhook URL:
                            </p>
                            <code className="text-xs text-blue-400 break-all">
                              {workflow.webhook_url}
                            </code>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleActive(workflow)}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          {workflow.is_active
                            ? <Pause className="w-4 h-4" />
                            : <Play className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(workflow)}
                          className="text-slate-400 hover:text-slate-200"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(workflow)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

        {/* Workflow Builder Dialog */}
        <Dialog open={showBuilder} onOpenChange={setShowBuilder}>
          <DialogContent className="max-w-[95vw] w-full max-h-[90vh] h-[90vh] bg-slate-900 border-slate-700 p-0">
            <DialogHeader className="px-6 pt-6 pb-0">
              <DialogTitle className="text-slate-100">
                {editingWorkflow ? "Edit Workflow" : "Create New Workflow"}
              </DialogTitle>
            </DialogHeader>
            <div className="h-[calc(90vh-4rem)] overflow-hidden">
              <WorkflowBuilder
                workflow={editingWorkflow}
                onSave={handleSave}
                onCancel={() => setShowBuilder(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
