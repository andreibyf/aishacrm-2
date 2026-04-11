import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, CheckCircle2, Circle, Clock, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { getBackendUrl } from '@/api/backendUrl';
import { processChatEmailDraft } from '@/api/functions';
import { draftFromTemplate } from '@/api/emailTemplates';
import { useTenant } from '@/components/shared/tenantContext';
import { useUser } from '@/components/shared/useUser';
import EmailTemplatePicker from './EmailTemplatePicker';

const EMAIL_DRAFT_PATTERNS = [
  /\bdraft\b.*\bemail\b/i,
  /\bwrite\b.*\bemail\b/i,
  /\bcompose\b.*\bemail\b/i,
  /\bfollow-?up email\b/i,
  /\breply email\b/i,
  /\bsend\b.*\bemail\b/i,
  /\bcreate\b.*\bemail\b/i,
  /\bgenerate\b.*\bemail\b/i,
  /\bemail\b.*\bproposal\b/i,
  /\bproposal\b.*\bemail\b/i,
  /\bemail\b.*\boutreach\b/i,
  /\boutreach\b.*\bemail\b/i,
];

const isEmailDraftIntent = (value = '') =>
  EMAIL_DRAFT_PATTERNS.some((pattern) => pattern.test(value.trim()));

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
  const [draftRun, setDraftRun] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const { selectedTenantId } = useTenant();
  const { user } = useUser();
  // Use selectedTenantId (for superadmins) or fallback to user's tenant_id (for tenant admins)
  const tenantId = tenantIdProp || selectedTenantId || user?.tenant_id;
  const pollIntervalRef = useRef(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setInput('');
      setTaskId(null);
      setTaskStatus(null);
      setTaskResult(null);
      setDraftRun(null);
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
      if (isEmailDraftIntent(input)) {
        const result = await processChatEmailDraft({
          tenantId,
          entity_type: entityType,
          entity_id: entityId,
          prompt: input.trim(),
          require_approval: true,
        });

        const payload = result?.data || {};
        if (result?.status >= 400 || payload?.status === 'error') {
          throw new Error(payload?.message || payload?.error || 'Failed to draft email');
        }

        const draftData = payload?.data || {};
        const generationResult = draftData?.generation_result || {};
        setDraftRun({
          status: generationResult?.status || 'completed',
          result:
            payload?.response || draftData?.response || 'AiSHA drafted an email for this record.',
          recipientEmail: draftData?.recipient_email || null,
          subject: draftData?.subject || null,
        });
        setTaskId(null);
        setTaskStatus(null);
        setTaskResult(null);
        setIsLoading(false);

        toast.success(
          generationResult?.status === 'pending_approval'
            ? 'AI email draft sent for approval'
            : 'AI email draft generated',
        );
        return;
      }

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
      setDraftRun(null);
      setIsLoading(false);

      // Keep modal open and start polling for the result
      startPolling(data.task_id);
    } catch (error) {
      console.error('Task creation error:', error);
      toast.error(error.message || 'Failed to start task');
      setIsLoading(false);
    }
  };

  const handleTemplateSelect = async ({ templateId, variables, additionalPrompt }) => {
    setIsLoading(true);
    try {
      const result = await draftFromTemplate({
        tenantId,
        templateId,
        entityType,
        entityId,
        variables,
        additionalPrompt,
        requireApproval: true,
      });

      const payload = result?.data || {};
      if (result?.status >= 400 || payload?.status === 'error') {
        throw new Error(payload?.message || 'Failed to draft email from template');
      }

      const draftData = payload?.data || {};
      const generationResult = draftData?.generation_result || {};
      setDraftRun({
        status: generationResult?.status || 'completed',
        result:
          payload?.response || draftData?.response || 'AiSHA drafted an email using the template.',
        recipientEmail: draftData?.recipient_email || null,
        subject: draftData?.subject || null,
      });
      setShowTemplatePicker(false);
      setTaskId(null);
      setTaskStatus(null);
      setTaskResult(null);

      toast.success(
        generationResult?.status === 'pending_approval'
          ? 'Template email draft sent for approval'
          : 'Template email draft generated',
      );
    } catch (error) {
      console.error('Template draft error:', error);
      toast.error(error.message || 'Failed to generate template draft');
    } finally {
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
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'pending_approval':
        return <Clock className="w-5 h-5 text-amber-500 animate-pulse" />;
      case 'queued':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
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
      case 'completed':
        return 'Completed';
      case 'pending_approval':
        return 'Awaiting approval';
      case 'queued':
        return 'Queued for delivery';
      default:
        return 'Ready';
    }
  };

  const hasRunResult = Boolean(taskId || draftRun);
  const activeStatus = draftRun?.status || taskStatus;
  const activeResult = draftRun?.result || taskResult;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[580px] bg-slate-900 border-slate-700 text-slate-100 max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            Assign AiSHA a Task
          </DialogTitle>
          <DialogDescription className="sr-only">
            Use AiSHA to run tasks or draft emails for the selected CRM record.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {!hasRunResult ? (
            showTemplatePicker ? (
              <EmailTemplatePicker
                entityType={entityType}
                tenantId={tenantId}
                onSelect={handleTemplateSelect}
                onCancel={() => setShowTemplatePicker(false)}
                isLoading={isLoading}
              />
            ) : (
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowTemplatePicker(true)}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-300 transition-colors border border-slate-600 hover:border-blue-500 px-2.5 py-1 rounded-full"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Use Template
                    </button>
                  </div>
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
            )
          ) : (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center gap-3">
                  {getStatusIcon(activeStatus)}
                  <span className="font-medium text-lg">{getStatusText(activeStatus)}</span>
                </div>
              </div>

              {/* Result Display */}
              {activeResult && (
                <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                  <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                    Result
                  </h4>
                  <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                    {activeResult.split('\n').map((line, i) => {
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

              {draftRun && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {draftRun.recipientEmail ? (
                    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Recipient
                      </div>
                      <div className="mt-1 text-sm text-slate-100">{draftRun.recipientEmail}</div>
                    </div>
                  ) : null}
                  {draftRun.subject ? (
                    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                      <div className="text-xs uppercase tracking-wide text-slate-400">Subject</div>
                      <div className="mt-1 text-sm text-slate-100">{draftRun.subject}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          {hasRunResult && (
            <Button
              onClick={() => {
                if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                setTaskId(null);
                setTaskStatus(null);
                setTaskResult(null);
                setDraftRun(null);
                setInput('');
                setShowTemplatePicker(false);
              }}
              variant="outline"
              className="border-slate-700 hover:bg-slate-800 text-slate-400"
            >
              ← New Task
            </Button>
          )}
          {hasRunResult && activeStatus !== 'PENDING' && activeStatus !== 'ASSIGNED' && (
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
