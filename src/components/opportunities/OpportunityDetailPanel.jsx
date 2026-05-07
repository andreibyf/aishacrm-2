import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CustomFieldsDisplay } from '../shared/CustomFieldsDisplay';
import ErrorBoundary from '../shared/ErrorBoundary';
import SendDocumentDialog from '../docuseal/SendDocumentDialog';
import { getAuthorizationHeader } from '@/api/functions';
import { getBackendUrl } from '@/api/backendUrl';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Calendar as CalendarIcon,
  // CheckCircle2, // Reserved for future success indicators
  X,
  Edit,
  Trash2,
  // TrendingUp, // Reserved for future trend indicators
  // MoreHorizontal, // Reserved for future actions menu
  Loader2,
  Building2,
  User,
  Users,
  Phone,
  Mail,
  CheckCircle,
  FileText,
  FileSignature,
  Presentation,
  ExternalLink,
  ChevronDown,
  // AlertCircle, // Reserved for future alert indicators
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Activity } from '@/api/entities';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import StatusHelper from '../shared/StatusHelper'; // New import
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';

// Mirror of ContactDetailPanel's status palette so the Document Signatures
// section looks identical across Contact / Lead / Account / Opportunity (4VD-6).
const DOCUSEAL_STATUS_BADGE_CLASS = {
  pending: 'bg-blue-100 text-blue-800 border border-blue-200',
  sent: 'bg-blue-100 text-blue-800 border border-blue-200',
  viewed: 'bg-amber-100 text-amber-800 border border-amber-200',
  signed: 'bg-green-100 text-green-800 border border-green-200',
  completed: 'bg-green-100 text-green-800 border border-green-200',
  declined: 'bg-red-100 text-red-800 border border-red-200',
  expired: 'bg-red-100 text-red-800 border border-red-200',
  failed: 'bg-red-100 text-red-800 border border-red-200',
};

function getDocuSealStatusClass(status) {
  return (
    DOCUSEAL_STATUS_BADGE_CLASS[String(status || '').toLowerCase()] ||
    'bg-slate-100 text-slate-800 border border-slate-200'
  );
}

function formatDocuSealDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function OpportunityDetailPanel({
  opportunity,
  accounts,
  contacts,
  users: _users,
  employees,
  leads,
  onClose,
  onEdit,
  onDelete,
  onStageChange,
}) {
  const [localOpportunity, setLocalOpportunity] = useState(opportunity);
  const [relatedActivities, setRelatedActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [creatingActivity, setCreatingActivity] = useState(false);
  const [showSendDocDialog, setShowSendDocDialog] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const { getCardLabel } = useStatusCardPreferences();

  // Load DocuSeal submissions tied to this opportunity (4VD-6).
  const loadSubmissions = useCallback(async () => {
    if (!localOpportunity?.id) return;
    try {
      const BACKEND_URL = getBackendUrl();
      const headers = { 'Content-Type': 'application/json' };
      const authHeader = await getAuthorizationHeader();
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }
      const tenantId =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('selected_tenant_id') || localStorage.getItem('tenant_id') || ''
          : '';
      if (tenantId) {
        headers['x-tenant-id'] = tenantId;
      }

      const url = `${BACKEND_URL}/api/docuseal/submissions?related_to=opportunity&related_id=${encodeURIComponent(
        localOpportunity.id,
      )}`;
      const resp = await fetch(url, { headers, credentials: 'include' });
      if (!resp.ok) return;
      const json = await resp.json().catch(() => ({}));
      const list = Array.isArray(json) ? json : json?.data || json?.submissions || [];
      setSubmissions(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Error loading DocuSeal submissions:', err);
    }
  }, [localOpportunity?.id]);

  useEffect(() => {
    if (!localOpportunity?.id) return undefined;
    let cancelled = false;
    setSubmissionsLoading(true);
    (async () => {
      await loadSubmissions();
      if (!cancelled) setSubmissionsLoading(false);
    })();
    const interval = setInterval(loadSubmissions, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [localOpportunity?.id, loadSubmissions]);

  const stageToCardId = {
    closed_won: 'opportunity_won',
    closed_lost: 'opportunity_lost',
  };

  const getStageLabel = (stage) => {
    if (stageToCardId[stage]) {
      return getCardLabel(stageToCardId[stage]) || stage?.replace(/_/g, ' ');
    }
    return stage?.replace(/_/g, ' ');
  };

  // Update localOpportunity when the prop changes
  useEffect(() => {
    setLocalOpportunity(opportunity);
  }, [opportunity]);

  // Load related activities - use v2 API with proper filtering
  useEffect(() => {
    const loadActivities = async () => {
      if (!localOpportunity?.id || !localOpportunity?.tenant_id) return;

      setLoadingActivities(true);
      try {
        // Use v2 API with server-side filtering for activities linked to this opportunity
        const backendUrl =
          import.meta.env.VITE_AISHACRM_BACKEND_URL ||
          (typeof window !== 'undefined' && window._env_?.VITE_AISHACRM_BACKEND_URL) ||
          'http://localhost:4001';
        const url = `${backendUrl}/api/v2/activities?tenant_id=${localOpportunity.tenant_id}&related_to_type=opportunity&related_to_id=${localOpportunity.id}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`Failed to load activities: ${response.status}`);
        }

        const data = await response.json();
        const activities = data.data?.activities || data.activities || [];

        // Sort by due date descending (most recent first). Null due_dates come last.
        activities.sort((a, b) => {
          const dateA = a.due_date ? new Date(a.due_date).getTime() : -Infinity;
          const dateB = b.due_date ? new Date(b.due_date).getTime() : -Infinity;

          if (dateA === -Infinity && dateB === -Infinity) {
            return 0;
          }
          if (dateA === -Infinity) return 1;
          if (dateB === -Infinity) return -1;

          return dateB - dateA;
        });
        setRelatedActivities(activities);
      } catch (error) {
        console.error('Failed to load activities:', error);
        setRelatedActivities([]);
      } finally {
        setLoadingActivities(false);
      }
    };
    loadActivities();
  }, [localOpportunity?.id, localOpportunity?.tenant_id]);

  // Helper function to get Account Name
  const getAccountName = () =>
    accounts?.find((acc) => acc.id === localOpportunity.account_id)?.name || 'N/A';

  // Helper function to get Contact Name
  const getContactName = () =>
    contacts?.find((con) => con.id === localOpportunity.contact_id)?.name || 'N/A';

  // Helper function to get Lead Name
  const getLeadName = () =>
    leads?.find((lead) => lead.id === localOpportunity.lead_id)?.name || 'N/A';

  // Helper function to get Assigned To Name
  const getAssignedToName = () => {
    const employee = employees?.find((e) => e.id === localOpportunity.assigned_to);
    return employee ? `${employee.first_name} ${employee.last_name}` : 'N/A';
  };

  const handleStageUpdate = async (newStage) => {
    if (onStageChange) {
      const updatedOpportunity = await onStageChange(localOpportunity.id, newStage);
      if (updatedOpportunity) {
        setLocalOpportunity(updatedOpportunity);
        toast.success(`Opportunity stage updated to ${newStage.replace(/_/g, ' ')}`);
      }
    }
  };

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete(localOpportunity.id);
      onClose();
    }
  };

  // Helper for stage badge colors - matching OpportunityCard semi-transparent style
  const getStageColor = (stage) => {
    switch (stage) {
      case 'prospecting':
        return 'bg-blue-900/20 text-blue-300 border-blue-700';
      case 'qualification':
        return 'bg-indigo-900/20 text-indigo-300 border-indigo-700';
      case 'proposal':
        return 'bg-purple-900/20 text-purple-300 border-purple-700';
      case 'negotiation':
        return 'bg-yellow-900/20 text-yellow-300 border-yellow-700';
      case 'closed_won':
        return 'bg-emerald-900/20 text-emerald-300 border-emerald-700';
      case 'closed_lost':
        return 'bg-red-900/20 text-red-300 border-red-700';
      default:
        return 'bg-slate-900/20 text-slate-300 border-slate-700';
    }
  };

  const handleCreateActivity = async () => {
    if (!localOpportunity?.id) return;

    setCreatingActivity(true);
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 2);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      const activityPayload = {
        type: 'call',
        subject: `Follow up: ${localOpportunity.name}`,
        description:
          `Follow up on opportunity for ${getAccountName() || 'Unknown Account'}\n` +
          `Value: $${(localOpportunity.amount || 0).toLocaleString()}\n` +
          `Stage: ${localOpportunity.stage?.replace(/_/g, ' ')}`,
        status: 'scheduled',
        priority: 'normal',
        related_to: 'opportunity',
        related_id: localOpportunity.id,
        related_name: localOpportunity.name,
        due_date: dueDateStr,
        tenant_id: localOpportunity.tenant_id,
        assigned_to: localOpportunity.assigned_to,
        is_test_data: false,
      };

      console.log('[OpportunityDetail] Creating activity with payload:', activityPayload);

      const newActivity = await Activity.create(activityPayload);

      console.log('[OpportunityDetail] Activity created:', newActivity);

      toast.success('Activity created successfully!');

      // Reload activities using v2 API with proper filtering
      const backendUrl =
        import.meta.env.VITE_AISHACRM_BACKEND_URL ||
        (typeof window !== 'undefined' && window._env_?.VITE_AISHACRM_BACKEND_URL) ||
        'http://localhost:4001';
      const url = `${backendUrl}/api/v2/activities?tenant_id=${localOpportunity.tenant_id}&related_to_type=opportunity&related_to_id=${localOpportunity.id}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        const activities = data.data?.activities || data.activities || [];
        activities.sort((a, b) => {
          const dateA = a.due_date ? new Date(a.due_date).getTime() : -Infinity;
          const dateB = b.due_date ? new Date(b.due_date).getTime() : -Infinity;
          if (dateA === -Infinity && dateB === -Infinity) return 0;
          if (dateA === -Infinity) return 1;
          if (dateB === -Infinity) return -1;
          return dateB - dateA;
        });
        setRelatedActivities(activities);
      }

      // Navigate to the activity
      setTimeout(() => {
        window.location.href = createPageUrl(`Activities?id=${newActivity.id}`);
      }, 500);
    } catch (error) {
      console.error('Failed to create activity:', error);
      toast.error(`Failed to create activity: ${error.message || 'Unknown error'}`);
    } finally {
      setCreatingActivity(false);
    }
  };

  const getActivityStatusColor = (status) => {
    const colors = {
      scheduled: 'bg-blue-900/20 text-blue-300 border-blue-700',
      overdue: 'bg-red-900/20 text-red-300 border-red-700',
      completed: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
      cancelled: 'bg-slate-900/20 text-slate-300 border-slate-700',
      in_progress: 'bg-yellow-900/20 text-yellow-300 border-yellow-700',
      'in-progress': 'bg-yellow-900/20 text-yellow-300 border-yellow-700',
    };
    return colors[status] || 'bg-slate-900/20 text-slate-300 border-slate-700';
  };

  const getActivityTypeIcon = (type) => {
    const icons = {
      call: Phone,
      email: Mail,
      meeting: Users,
      task: CheckCircle,
      note: FileText,
      demo: Presentation,
      proposal: FileText,
    };
    return icons[type] || CalendarIcon;
  };

  if (!localOpportunity) return null;

  return (
    <ErrorBoundary variant="inline" label={`OpportunityDetailPanel[id=${localOpportunity?.id}]`}>
      <div className="fixed inset-y-0 right-0 w-full md:w-2/3 lg:w-1/2 bg-slate-900 shadow-2xl z-50 overflow-y-auto border-l border-slate-700">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 z-10">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-slate-100 mb-2">{localOpportunity.name}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Badge
                    className={`${getStageColor(localOpportunity.stage)} contrast-badge border font-semibold`}
                    data-variant="status"
                    data-status={localOpportunity.stage}
                  >
                    {getStageLabel(localOpportunity.stage)}
                  </Badge>
                  <StatusHelper statusKey={`opportunity_${localOpportunity.stage}`} />
                </div>
                {localOpportunity.type && (
                  <Badge variant="outline" className="border-slate-600 text-slate-300">
                    {localOpportunity.type?.replace(/_/g, ' ')}
                  </Badge>
                )}
                {localOpportunity.lead_source && (
                  <Badge variant="outline" className="border-slate-600 text-slate-300">
                    {localOpportunity.lead_source}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-300 hover:bg-slate-700"
              aria-label="Close Panel"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleCreateActivity}
              disabled={creatingActivity}
              className="bg-blue-600 hover:bg-blue-700"
              size="sm"
            >
              {creatingActivity ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  Create Activity
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(localOpportunity)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSendDocDialog(true)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <FileSignature className="w-4 h-4 mr-2" />
              Send Document
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  Change Stage
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-slate-800 border-slate-700 text-slate-200">
                <DropdownMenuItem
                  onClick={() => handleStageUpdate('prospecting')}
                  className="hover:bg-slate-700"
                >
                  Prospecting
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStageUpdate('qualification')}
                  className="hover:bg-slate-700"
                >
                  Qualification
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStageUpdate('proposal')}
                  className="hover:bg-slate-700"
                >
                  Proposal
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStageUpdate('negotiation')}
                  className="hover:bg-slate-700"
                >
                  Negotiation
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-700" />
                <DropdownMenuItem
                  onClick={() => handleStageUpdate('closed_won')}
                  className="hover:bg-slate-700"
                >
                  {getStageLabel('closed_won')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStageUpdate('closed_lost')}
                  className="hover:bg-slate-700"
                >
                  {getStageLabel('closed_lost')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="border-red-600 text-red-400 hover:bg-red-900/30"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-slate-700/50 border-slate-600">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400 mb-1">Value</p>
                <p className="text-2xl font-bold text-slate-100">
                  ${(localOpportunity.amount || 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-700/50 border-slate-600">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400 mb-1">Close Date</p>
                <p className="text-lg font-semibold text-slate-100">
                  {localOpportunity.close_date
                    ? format(new Date(localOpportunity.close_date), 'MMM d, yyyy')
                    : 'Not set'}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-700/50 border-slate-600">
              <CardContent className="p-4">
                <p className="text-xs text-slate-400 mb-1">Probability</p>
                <p className="text-2xl font-bold text-slate-100">
                  {localOpportunity.probability || 0}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Relationships */}
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader>
              <CardTitle className="text-slate-200">Relationships</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Account</p>
                  <p className="text-sm text-slate-200">{getAccountName()}</p>
                </div>
              </div>

              {localOpportunity.contact_id && (
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400">Primary Contact</p>
                    <p className="text-sm text-slate-200">{getContactName()}</p>
                  </div>
                </div>
              )}

              {localOpportunity.lead_id && (
                <div className="flex items-start gap-3">
                  <Users className="w-4 h-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400">Related Lead</p>
                    <p className="text-sm text-slate-200">{getLeadName()}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <User className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400">Assigned To</p>
                  <p className="text-sm text-slate-200">{getAssignedToName()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Related Activities */}
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-200 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-blue-400" />
                  Activities ({relatedActivities.length})
                </CardTitle>
                {loadingActivities && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
              </div>
            </CardHeader>
            <CardContent>
              {loadingActivities && relatedActivities.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-blue-400" />
                  <p className="text-sm">Loading activities...</p>
                </div>
              ) : relatedActivities.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No activities yet</p>
                  <p className="text-xs mt-1">Create an activity to track follow-ups</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {relatedActivities.map((activity) => {
                    const ActivityIcon = getActivityTypeIcon(activity.type);
                    return (
                      <Link
                        key={activity.id}
                        to={createPageUrl(`Activities?id=${activity.id}`)}
                        className="block"
                      >
                        <div className="p-3 bg-slate-800 border border-slate-600 rounded-lg hover:border-blue-500 transition-colors cursor-pointer">
                          <div className="flex items-start gap-3">
                            <ActivityIcon className="w-4 h-4 text-slate-400 mt-1" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-slate-200 truncate">
                                  {activity.subject}
                                </p>
                                <Badge
                                  className={`${getActivityStatusColor(
                                    activity.status,
                                  )} contrast-badge text-xs flex-shrink-0 border`}
                                  data-variant="status"
                                  data-status={activity.status}
                                >
                                  {activity.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                                <span className="capitalize">{activity.type}</span>
                                {activity.due_date && (
                                  <>
                                    <span>•</span>
                                    <span>
                                      {format(new Date(activity.due_date), 'MMM d, yyyy')}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Document Signatures (4VD-6) — DocuSeal lifecycle for documents
              sent against this opportunity. Mirror of the Contact panel
              section so the timeline + status badges are consistent. */}
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader>
              <CardTitle className="text-slate-200 flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-blue-400" />
                Document Signatures ({submissions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {submissionsLoading && submissions.length === 0 ? (
                <div className="text-center py-4 text-slate-400 text-sm">
                  Loading documents...
                </div>
              ) : submissions.length === 0 ? (
                <div className="text-center py-4 text-slate-400 text-sm">
                  No documents sent yet.
                </div>
              ) : (
                <ul className="space-y-3">
                  {submissions.map((s) => {
                    const status = String(s.status || 'pending').toLowerCase();
                    const templateName =
                      s.template_name || s.template_title || s.template_id || 'Document';
                    const recipient = s.recipient_email || s.recipient_name || '';
                    const sentAt = s.sent_at || s.created_at || s.created_date;
                    const signedHref = s.mirror_url || s.signed_document_url;
                    const showSigned =
                      (status === 'completed' || status === 'signed') && signedHref;
                    return (
                      <li
                        key={s.id || `${s.template_id}-${sentAt}`}
                        className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-sm font-medium text-slate-200 truncate">
                              {templateName}
                            </span>
                          </div>
                          {recipient && (
                            <p className="text-xs text-slate-400 ml-6 truncate">{recipient}</p>
                          )}
                          {sentAt && (
                            <p className="text-xs text-slate-400 ml-6">
                              Sent {formatDocuSealDate(sentAt)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-6 sm:ml-0 mt-1 sm:mt-0">
                          <Badge className={getDocuSealStatusClass(status)}>{status}</Badge>
                          {showSigned && (
                            <a
                              href={signedHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              View signed PDF
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Description */}
          {localOpportunity.description && (
            <Card className="bg-slate-700/50 border-slate-600">
              <CardHeader>
                <CardTitle className="text-slate-200">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">
                  {localOpportunity.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Additional Details */}
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader>
              <CardTitle className="text-slate-200">Additional Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {localOpportunity.next_step && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Next Step</p>
                  <p className="text-sm text-slate-200">{localOpportunity.next_step}</p>
                </div>
              )}

              {localOpportunity.competitor && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Competitor</p>
                  <p className="text-sm text-slate-200">{localOpportunity.competitor}</p>
                </div>
              )}

              {localOpportunity.tags && localOpportunity.tags.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {localOpportunity.tags.map((tag, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="border-slate-600 text-slate-300 text-xs"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom Fields (tenant-defined via Settings → Field Customization).
            Renders null when there are no defined custom fields or no stored values. */}
          {localOpportunity.metadata?.custom &&
            Object.keys(localOpportunity.metadata.custom).length > 0 && (
              <Card className="bg-slate-700/50 border-slate-600">
                <CardHeader>
                  <CardTitle className="text-slate-200">Additional Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <CustomFieldsDisplay
                    entityType="Opportunity"
                    metadata={localOpportunity.metadata}
                  />
                </CardContent>
              </Card>
            )}

          {/* Metadata */}
          <Card className="bg-slate-700/50 border-slate-600">
            <CardHeader>
              <CardTitle className="text-slate-200 text-sm">Record Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Created:</span>
                <span>
                  {localOpportunity.created_date
                    ? format(new Date(localOpportunity.created_date), 'MMM d, yyyy h:mm a')
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Last Updated:</span>
                <span>
                  {localOpportunity.updated_date
                    ? format(new Date(localOpportunity.updated_date), 'MMM d, yyyy h:mm a')
                    : 'N/A'}
                </span>
              </div>
              {localOpportunity.created_by && (
                <div className="flex justify-between">
                  <span>Created By:</span>
                  <span>{localOpportunity.created_by}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SendDocumentDialog
        open={showSendDocDialog}
        onOpenChange={setShowSendDocDialog}
        relatedTo="opportunity"
        relatedId={localOpportunity.id}
        defaultRecipientName={
          (() => {
            const c = contacts?.find((cn) => cn.id === localOpportunity.contact_id);
            if (c) {
              return (
                c.name ||
                `${c.first_name || ''} ${c.last_name || ''}`.trim() ||
                ''
              );
            }
            return localOpportunity.name || '';
          })()
        }
        defaultRecipientEmail={
          contacts?.find((cn) => cn.id === localOpportunity.contact_id)?.email || ''
        }
        onSent={(submission) => {
          if (submission && typeof submission === 'object') {
            setSubmissions((prev) => [submission, ...prev]);
          }
          loadSubmissions();
        }}
      />
    </ErrorBoundary>
  );
}
