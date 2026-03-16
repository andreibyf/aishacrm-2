import { useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity } from '@/api/entities';
import { format } from 'date-fns';
import UniversalDetailPanel from '../shared/UniversalDetailPanel';
import {
  getCurrentTimezoneOffset,
  getTimezoneDisplayName,
  formatActivityDateTime,
} from '../shared/timezoneUtils';
import { useTimezone } from '../shared/TimezoneContext';
import { Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';

const ActivityDetailPanel = ({
  activity,
  assignedUserName,
  relatedRecordInfo,
  relatedName, // Alternative prop from Activities page
  accounts = [],
  contacts = [],
  leads = [],
  opportunities = [],
  open,
  onOpenChange,
  onEdit,
  onDelete,
  user,
}) => {
  const { selectedTimezone } = useTimezone();
  const offsetMinutes = getCurrentTimezoneOffset(selectedTimezone);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [aiEmailGenerationState, setAiEmailGenerationState] = useState(
    activity?.metadata?.ai_email_generation || null,
  );

  useEffect(() => {
    setAiEmailGenerationState(activity?.metadata?.ai_email_generation || null);
  }, [activity]);

  const formattedDueDate = useMemo(() => {
    if (!activity) return 'Not set';
    return formatActivityDateTime(activity, offsetMinutes);
  }, [activity, offsetMinutes]);

  const timezoneDisplay = useMemo(() => {
    return getTimezoneDisplayName(selectedTimezone);
  }, [selectedTimezone]);

  // Build relatedRecordInfo from props if not directly provided
  const computedRelatedRecordInfo = useMemo(() => {
    if (relatedRecordInfo) return relatedRecordInfo;
    if (!activity?.related_to || !activity?.related_id) return null;

    let record = null;
    const relatedTo = activity.related_to;
    const relatedId = activity.related_id;

    if (relatedTo === 'contact') {
      record = contacts.find((c) => c.id === relatedId);
      if (record) {
        return {
          name: `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Unknown Contact',
          phone: record.phone,
          company: record.company,
        };
      }
    } else if (relatedTo === 'account') {
      record = accounts.find((a) => a.id === relatedId);
      if (record) {
        return { name: record.name || 'Unknown Account', phone: record.phone };
      }
    } else if (relatedTo === 'lead') {
      record = leads.find((l) => l.id === relatedId);
      if (record) {
        return {
          name: `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Unknown Lead',
          phone: record.phone,
          company: record.company,
        };
      }
    } else if (relatedTo === 'opportunity') {
      record = opportunities.find((o) => o.id === relatedId);
      if (record) {
        return { name: record.name || 'Unknown Opportunity' };
      }
    }

    // Fallback to relatedName prop
    if (relatedName) {
      return { name: relatedName };
    }

    return null;
  }, [relatedRecordInfo, relatedName, activity, accounts, contacts, leads, opportunities]);

  if (!activity) {
    return null;
  }

  const handleGenerateAiEmailDraft = async () => {
    const tenantId = activity.tenant_id || user?.tenant_id;
    if (!tenantId) {
      toast.error('tenant_id is required to generate an AI email draft.');
      return;
    }

    setIsGeneratingDraft(true);
    try {
      const result = await Activity.generateAiEmailDraft(activity.id, tenantId);
      const nextState = result?.activity?.metadata?.ai_email_generation || null;
      setAiEmailGenerationState(nextState);

      if (result?.generation_result?.status === 'pending_approval') {
        toast.success('AI email draft sent for approval.');
      } else if (result?.generation_result?.activity_id) {
        toast.success('AI email draft generated and queued for delivery.');
      } else {
        toast.success('AI email draft generated.');
      }
    } catch (error) {
      console.error('Failed to generate AI email draft:', error);
      toast.error(error?.message || 'Failed to generate AI email draft');
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Build display data for the universal panel
  const displayData = {
    'Due Date & Time': (
      <p className="text-slate-200 font-medium mt-1">
        {formattedDueDate !== 'Not set'
          ? `${formattedDueDate} (${timezoneDisplay})`
          : formattedDueDate}
      </p>
    ),
    // Suppress the standard "Due Date" field since we show "Due Date & Time" above
    'Due Date': null,
    'Assigned To': (
      <p className="text-slate-200 font-medium mt-1">{assignedUserName || 'Unassigned'}</p>
    ),
    'Related To': (
      <div className="mt-1">
        {computedRelatedRecordInfo && computedRelatedRecordInfo.name !== 'N/A' ? (
          <>
            <p className="text-slate-200 font-medium">{computedRelatedRecordInfo.name}</p>
            {computedRelatedRecordInfo.phone && (
              <p className="text-sm text-slate-400">{computedRelatedRecordInfo.phone}</p>
            )}
            {computedRelatedRecordInfo.company && (
              <p className="text-xs text-slate-500">{computedRelatedRecordInfo.company}</p>
            )}
          </>
        ) : (
          <p className="text-slate-500 italic">No related record</p>
        )}
      </div>
    ),
    Priority: activity.priority ? (
      <Badge
        className="contrast-badge mt-1"
        data-variant="priority"
        data-priority={activity.priority}
      >
        {activity.priority.toUpperCase()}
      </Badge>
    ) : (
      <p className="text-slate-500 italic mt-1">Not set</p>
    ),
    Location: (
      <p className="text-slate-200 font-medium mt-1">
        {activity.location || <span className="text-slate-500 italic">Not set</span>}
      </p>
    ),
    Duration: (
      <p className="text-slate-200 font-medium mt-1">
        {activity.duration ? (
          `${activity.duration} minutes`
        ) : (
          <span className="text-slate-500 italic">Not set</span>
        )}
      </p>
    ),
    Outcome: (
      <p className="text-slate-200 font-medium mt-1">
        {activity.outcome || <span className="text-slate-500 italic">No outcome recorded yet</span>}
      </p>
    ),
  };

  const customActions =
    activity.type === 'scheduled_ai_email'
      ? [
          {
            label: isGeneratingDraft ? 'Generating Draft...' : 'Generate Draft',
            icon: isGeneratingDraft ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            ),
            onClick: () => {
              if (!isGeneratingDraft) {
                handleGenerateAiEmailDraft();
              }
            },
          },
        ]
      : [];

  const customSections =
    activity.type === 'scheduled_ai_email'
      ? [
          {
            title: 'AI Email Drafting',
            content: (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <span className="text-slate-400">Status:</span>{' '}
                    <span className="text-slate-200">
                      {aiEmailGenerationState?.status || 'Not requested'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Recipient:</span>{' '}
                    <span className="text-slate-200">
                      {aiEmailGenerationState?.recipient_email ||
                        activity.related_email ||
                        'Not resolved'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Requested:</span>{' '}
                    <span className="text-slate-200">
                      {aiEmailGenerationState?.requested_at
                        ? format(
                            new Date(aiEmailGenerationState.requested_at),
                            'MMM d, yyyy h:mm a',
                          )
                        : 'Not requested yet'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Result:</span>{' '}
                    <span className="text-slate-200">
                      {aiEmailGenerationState?.suggestion_id
                        ? `Approval suggestion ${aiEmailGenerationState.suggestion_id}`
                        : aiEmailGenerationState?.generated_activity_id
                          ? `Queued email ${aiEmailGenerationState.generated_activity_id}`
                          : 'No draft generated yet'}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleGenerateAiEmailDraft}
                  disabled={isGeneratingDraft}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isGeneratingDraft ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Generate Draft
                    </>
                  )}
                </Button>
              </div>
            ),
          },
        ]
      : [];

  return (
    <UniversalDetailPanel
      entity={activity}
      entityType="activity"
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
      onDelete={onDelete}
      user={user}
      displayData={displayData}
      customActions={customActions}
      customSections={customSections}
      showNotes={true}
    />
  );
};

export default ActivityDetailPanel;
