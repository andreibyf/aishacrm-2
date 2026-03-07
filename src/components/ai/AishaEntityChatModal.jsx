import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, CheckCircle2, Circle, Clock, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';
import { useTenant } from '@/components/shared/tenantContext';
import { useUser } from '@/components/shared/useUser';

export default function AishaEntityChatModal({
  open,
  onClose,
  entityType,
  entityId,
  entityLabel: _entityLabel,
  relatedData = {}, // { profile, opportunities, activities, notes }
  tenantId: tenantIdProp = null, // Optional: explicit tenant ID when outside TenantProvider
}) {
  const [input, setInput] = useState('');
  const [taskId, setTaskId] = useState(null);
  const [taskStatus, setTaskStatus] = useState(null); // PENDING, ASSIGNED, COMPLETED
  const [taskResult, setTaskResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { selectedTenantId } = useTenant();
  const { user } = useUser();
  // Use selectedTenantId (for superadmins) or fallback to user's tenant_id (for tenant admins)
  const tenantId = tenantIdProp || selectedTenantId || user?.tenant_id;
  const pollIntervalRef = useRef(null);

  const getOfficeVizUrl = () => {
    const base =
      window.location.hostname === 'app.aishacrm.com'
        ? 'https://backoffice.aishacrm.com'
        : `${window.location.protocol}//${window.location.hostname}:4010`;
    return base;
  };

  const openOffice = () => window.open(getOfficeVizUrl(), '_blank', 'noopener');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setInput('');
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
          tenant_id: tenantId,
          // Include full profile and related data from the profile page
          related_data: {
            profile: relatedData.profile || null,
            opportunities: relatedData.opportunities || [],
            activities: relatedData.activities || [],
            notes: relatedData.notes || [],
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create task');
      }

      const data = await response.json();
      setTaskId(data.task_id);
      setTaskStatus('PENDING');
      setIsLoading(false);

      // Keep modal open and start polling for the result
      startPolling(data.task_id);
    } catch (error) {
      console.error('Task creation error:', error);
      toast.error('Failed to start task');
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
          setTaskResult(task.result || 'Task completed successfully.');
          setIsLoading(false);
          clearInterval(pollIntervalRef.current);
          toast.success('Task completed!');
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
      case 'PENDING':
        return <Clock className="w-5 h-5 text-yellow-500 animate-pulse" />;
      case 'ASSIGNED':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'COMPLETED':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      default:
        return <Circle className="w-5 h-5 text-slate-500" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'PENDING':
        return 'Queued...';
      case 'ASSIGNED':
        return 'Processing...';
      case 'COMPLETED':
        return 'Completed';
      default:
        return 'Ready';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[580px] bg-slate-900 border-slate-700 text-slate-100 max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            Assign AiSHA a Task
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

              {/* Quick suggestion chips */}
              <div className="flex flex-wrap gap-2">
                {[
                  'Create a note and set up a meeting for tomorrow',
                  'Draft a follow-up email',
                  'Summarise this record and suggest next steps',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="text-xs px-3 py-1.5 rounded-full bg-slate-800 border border-slate-600 text-slate-300 hover:border-blue-500 hover:text-blue-300 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={openOffice}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Watch in Office
                </button>
                <Button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Start Task
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Status + Watch in Office */}
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3">
                  {getStatusIcon(taskStatus)}
                  <span className="font-medium text-lg">{getStatusText(taskStatus)}</span>
                </div>
                <button
                  type="button"
                  onClick={openOffice}
                  className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 bg-blue-950/40 px-3 py-1.5 rounded-full transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Watch in Office
                </button>
              </div>

              {/* Result Display */}
              {taskResult && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                    Result
                  </h4>
                  <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                    {taskResult.split('\n').map((line, i) => {
                      // Bold: **text**
                      const parts = line.split(/\*\*(.*?)\*\*/g);
                      return (
                        <p
                          key={i}
                          className={
                            line.startsWith('- ') || line.startsWith('* ')
                              ? 'ml-3 before:content-["•"] before:mr-2'
                              : 'mb-1'
                          }
                        >
                          {parts.map((part, j) =>
                            j % 2 === 1 ? (
                              <strong key={j} className="text-slate-100 font-semibold">
                                {part}
                              </strong>
                            ) : (
                              part
                            ),
                          )}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          {taskId && (
            <Button
              onClick={() => {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setTaskId(null);
                setTaskStatus(null);
                setTaskResult(null);
                setInput('');
              }}
              variant="outline"
              className="border-slate-700 hover:bg-slate-800 text-slate-400"
            >
              ← New Task
            </Button>
          )}
          {taskId && taskStatus === 'COMPLETED' && (
            <Button
              onClick={onClose}
              variant="outline"
              className="border-slate-700 hover:bg-slate-800 text-slate-300"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
