import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, CheckCircle2, Circle, Clock } from "lucide-react";
import { toast } from "sonner";
import { getBackendUrl } from "@/api/backendUrl";
import { useTenant } from "@/components/shared/tenantContext";
import { useUser } from "@/components/shared/useUser";

export default function AishaEntityChatModal({ 
  open, 
  onClose, 
  entityType, 
  entityId, 
  entityLabel 
}) {
  const [input, setInput] = useState("");
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null); // PENDING, ASSIGNED, COMPLETED
  const [taskResult, setTaskResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { selectedTenantId } = useTenant();
  const { user } = useUser();
  // Use selectedTenantId (for superadmins) or fallback to user's tenant_id (for tenant admins)
  const tenantId = selectedTenantId || user?.tenant_id;
  const pollIntervalRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setInput("");
      setTaskId(null);
      setTaskStatus(null);
      setTaskResult(null);
      setIsLoading(false);
    } else {
      // Cleanup polling on close
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${getBackendUrl()}/api/tasks/from-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: input,
          entity_type: entityType,
          entity_id: entityId,
          tenant_id: tenantId
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create task');
      }

      const data = await response.json();
      setTaskId(data.task_id);
      setTaskStatus('PENDING');
      
      // Start polling
      startPolling(data.task_id);
      
    } catch (error) {
      console.error('Task creation error:', error);
      toast.error("Failed to start task");
      setIsLoading(false);
    }
  };

  const startPolling = (id) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${getBackendUrl()}/api/tasks/${id}`);
        if (!response.ok) return;
        
        const task = await response.json();
        setTaskStatus(task.status);
        
        if (task.status === 'COMPLETED') {
          setTaskResult(task.result || "Task completed successfully.");
          setIsLoading(false);
          clearInterval(pollIntervalRef.current);
          toast.success("Task completed!");
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1500); // Poll every 1.5s
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PENDING': return <Clock className="w-5 h-5 text-yellow-500 animate-pulse" />;
      case 'ASSIGNED': return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'COMPLETED': return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      default: return <Circle className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'PENDING': return "Queued...";
      case 'ASSIGNED': return "Processing...";
      case 'COMPLETED': return "Completed";
      default: return "Ready";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-700 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            Ask AiSHA about {entityLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {!taskId ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-slate-400">
                  What would you like me to do with this {entityType}?
                </p>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g., Generate next steps, Draft an email..."
                  className="bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500"
                  autoFocus
                />
              </div>
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={isLoading || !input.trim()}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Start Task
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-6">
              {/* Status Display */}
              <div className="flex items-center justify-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                {getStatusIcon(taskStatus)}
                <span className="font-medium text-lg">{getStatusText(taskStatus)}</span>
              </div>

              {/* Result Display */}
              {taskResult && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Result</h4>
                  <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 text-sm leading-relaxed">
                    {taskResult}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {taskId && taskStatus === 'COMPLETED' && (
            <Button onClick={onClose} variant="outline" className="border-slate-700 hover:bg-slate-800 text-slate-300">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
