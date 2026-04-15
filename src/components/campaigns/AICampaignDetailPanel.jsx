import { useState, useEffect } from 'react';
import { BACKEND_URL, supabase } from '@/api/entities';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Edit,
  Trash2,
  Play,
  Pause,
  Bot,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  Target,
  BarChart3,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import { parseContacts } from '../../utils/campaignUtils';

const statusColors = {
  draft: 'bg-slate-700 text-slate-300 border-slate-600',
  scheduled: 'bg-blue-900/30 text-blue-400 border-blue-700',
  running: 'bg-green-900/30 text-green-400 border-green-700',
  paused: 'bg-yellow-900/30 text-yellow-400 border-yellow-700',
  completed: 'bg-purple-900/30 text-purple-400 border-purple-700',
  failed: 'bg-red-900/30 text-red-400 border-red-700',
  cancelled: 'bg-red-900/30 text-red-400 border-red-700',
};

export default function AICampaignDetailPanel({
  campaign,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onStatusChange,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [liveTargets, setLiveTargets] = useState(null);
  const [targetsLoading, setTargetsLoading] = useState(false);

  useEffect(() => {
    if (!open || !campaign?.id) return;
    setLiveTargets(null);
    setTargetsLoading(true);
    const tenant_id = campaign.tenant_id;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const authHeaders = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      fetch(
        `${BACKEND_URL}/api/aicampaigns/${campaign.id}/targets?tenant_id=${encodeURIComponent(tenant_id)}`,
        { headers: authHeaders, credentials: 'include' },
      )
        .then((r) => r.json())
        .then((r) => setLiveTargets(Array.isArray(r.data) ? r.data : null))
        .catch(() => setLiveTargets(null))
        .finally(() => setTargetsLoading(false));
    });
  }, [open, campaign?.id]);

  if (!campaign) return null;

  const contacts = parseContacts(campaign.target_contacts);

  // Prefer live progress from metadata (set by worker) over stale target_contacts statuses
  const metaProgress = campaign.metadata?.progress || null;

  const getProgressPercentage = () => {
    if (metaProgress) {
      const total = Number(metaProgress.total || 0);
      if (total === 0) return 0;
      const done = Number(metaProgress.completed || 0) + Number(metaProgress.failed || 0);
      return Math.round((done / total) * 100);
    }
    if (contacts.length === 0) return 0;
    const completedContacts = contacts.filter((c) =>
      ['completed', 'failed', 'skipped'].includes(c.status),
    ).length;
    return Math.round((completedContacts / contacts.length) * 100);
  };

  const statusCounts = metaProgress
    ? {
        pending: Number(metaProgress.pending || 0),
        scheduled: Number(metaProgress.processing || 0),
        completed: Number(metaProgress.completed || 0),
        failed: Number(metaProgress.failed || 0),
      }
    : contacts.reduce(
        (counts, contact) => {
          counts[contact.status] = (counts[contact.status] || 0) + 1;
          return counts;
        },
        { pending: 0, completed: 0, failed: 0, scheduled: 0 },
      );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[800px] sm:max-w-[800px] overflow-y-auto bg-slate-900 border-slate-800 text-slate-300">
        <SheetHeader className="pb-6">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="flex items-center gap-3 text-xl text-slate-100">
                <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-blue-400" />
                </div>
                {campaign.name}
              </SheetTitle>
              <div className="flex items-center gap-3 mt-2">
                <Badge className={`${statusColors[campaign.status]} border-none capitalize`}>
                  {campaign.status}
                </Badge>
                <Badge variant="outline" className="capitalize border-slate-600 text-slate-300">
                  {campaign.call_objective?.replace('_', ' ')}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(campaign)}
                className="bg-slate-800 border-slate-700 hover:bg-slate-700"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              {campaign.status === 'running' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStatusChange(campaign, 'paused')}
                  className="bg-slate-800 border-slate-700 hover:bg-slate-700"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </Button>
              ) : campaign.status === 'paused' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStatusChange(campaign, 'running')}
                  className="bg-slate-800 border-slate-700 hover:bg-slate-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Resume
                </Button>
              ) : campaign.status === 'draft' || campaign.status === 'scheduled' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStatusChange(campaign, 'running')}
                  className="bg-slate-800 border-slate-700 hover:bg-slate-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start
                </Button>
              ) : null}
            </div>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 bg-slate-800 border-slate-700 p-1 h-auto">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="contacts"
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400"
            >
              Contacts
            </TabsTrigger>
            <TabsTrigger
              value="performance"
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400"
            >
              Performance
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100 text-slate-400"
            >
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Campaign Description */}
            {campaign.description && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-100">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-300">{campaign.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Progress Overview */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
                  <BarChart3 className="w-5 h-5" />
                  Campaign Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Progress value={getProgressPercentage()} className="flex-1 bg-slate-700" />
                  <span className="text-sm font-medium text-slate-200">
                    {getProgressPercentage()}%
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-100">
                      {statusCounts.pending || 0}
                    </div>
                    <div className="text-xs text-slate-400">Pending</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">
                      {statusCounts.scheduled || 0}
                    </div>
                    <div className="text-xs text-slate-400">Scheduled</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">
                      {statusCounts.completed || 0}
                    </div>
                    <div className="text-xs text-slate-400">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-400">
                      {statusCounts.failed || 0}
                    </div>
                    <div className="text-xs text-slate-400">Failed</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* AI Prompt */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
                  <MessageSquare className="w-5 h-5" />
                  AI Prompt Template
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-900/50 rounded-lg p-4 font-mono text-sm border border-slate-700 text-slate-300">
                  {campaign.ai_prompt_template}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
                  <Users className="w-5 h-5" />
                  Target Contacts ({liveTargets ? liveTargets.length : contacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {targetsLoading ? (
                  <div className="text-center py-8 text-slate-500">Loading...</div>
                ) : liveTargets && liveTargets.length > 0 ? (
                  <div className="space-y-3">
                    {liveTargets.map((t) => {
                      const payload =
                        typeof t.target_payload === 'string'
                          ? (() => {
                              try {
                                return JSON.parse(t.target_payload);
                              } catch {
                                return {};
                              }
                            })()
                          : t.target_payload || {};
                      const name =
                        payload.contact_name || payload.first_name || t.destination || t.contact_id;
                      const sub = t.destination || payload.phone || payload.email;
                      const statusIcon = {
                        completed: <CheckCircle className="w-4 h-4 text-green-400" />,
                        failed: <XCircle className="w-4 h-4 text-red-400" />,
                        processing: <Clock className="w-4 h-4 text-blue-400" />,
                        pending: <Clock className="w-4 h-4 text-slate-500" />,
                      }[t.status] || <Clock className="w-4 h-4 text-slate-500" />;
                      const badgeClass =
                        {
                          completed: 'border-green-700 text-green-400',
                          failed: 'border-red-700 text-red-400',
                          processing: 'border-blue-700 text-blue-400',
                          pending: 'border-slate-600 text-slate-300',
                        }[t.status] || 'border-slate-600 text-slate-300';
                      return (
                        <div
                          key={t.id}
                          className="flex items-start justify-between p-3 border border-slate-700 rounded-lg bg-slate-800/50"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">{statusIcon}</div>
                            <div>
                              <div className="font-medium text-slate-200">{name}</div>
                              {sub && sub !== name && (
                                <div className="text-sm text-slate-400">{sub}</div>
                              )}
                              {t.error_message && (
                                <div className="text-xs text-red-400 mt-1 max-w-xs">
                                  ⚠ {t.error_message}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-sm flex-shrink-0 ml-4">
                            <Badge variant="outline" className={`capitalize ${badgeClass}`}>
                              {t.status}
                            </Badge>
                            {t.completed_at && (
                              <div className="text-xs text-slate-500 mt-1">
                                {format(new Date(t.completed_at), 'MMM d, HH:mm')}
                              </div>
                            )}
                            {!t.completed_at && t.created_at && (
                              <div className="text-xs text-slate-500 mt-1">
                                {format(new Date(t.created_at), 'MMM d, HH:mm')}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : contacts.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Users className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                    <p>No contacts configured for this campaign</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contacts.map((contact, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border border-slate-700 rounded-lg bg-slate-800/50"
                      >
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-slate-500" />
                          <div>
                            <div className="font-medium text-slate-200">{contact.contact_name}</div>
                            <div className="text-sm text-slate-400">
                              {contact.phone || contact.email}
                            </div>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="capitalize border-slate-600 text-slate-300"
                        >
                          {contact.status || 'pending'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
                  <BarChart3 className="w-5 h-5" />
                  {campaign.campaign_type === 'call' ? 'Call Performance' : 'Execution Metrics'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {campaign.campaign_type === 'call' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-slate-100">
                        {campaign.performance_metrics?.total_calls || 0}
                      </div>
                      <div className="text-sm text-slate-400">Total Calls</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-400">
                        {campaign.performance_metrics?.successful_calls || 0}
                      </div>
                      <div className="text-sm text-slate-400">Successful</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-400">
                        {campaign.performance_metrics?.failed_calls || 0}
                      </div>
                      <div className="text-sm text-slate-400">Failed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-400">
                        {campaign.performance_metrics?.appointments_set || 0}
                      </div>
                      <div className="text-sm text-slate-400">Appointments</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-400">
                        {campaign.performance_metrics?.leads_qualified || 0}
                      </div>
                      <div className="text-sm text-slate-400">Qualified</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-400">
                        {campaign.performance_metrics?.average_duration || 0}s
                      </div>
                      <div className="text-sm text-slate-400">Avg Duration</div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-slate-100">
                        {statusCounts.pending +
                          statusCounts.scheduled +
                          statusCounts.completed +
                          statusCounts.failed}
                      </div>
                      <div className="text-sm text-slate-400">Total Contacts</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-400">
                        {statusCounts.completed}
                      </div>
                      <div className="text-sm text-slate-400">Completed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-400">{statusCounts.failed}</div>
                      <div className="text-sm text-slate-400">Failed</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-yellow-400">
                        {statusCounts.pending}
                      </div>
                      <div className="text-sm text-slate-400">Pending</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-400">
                        {statusCounts.scheduled}
                      </div>
                      <div className="text-sm text-slate-400">Processing</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-400">
                        {(() => {
                          const total = statusCounts.completed + statusCounts.failed;
                          return total > 0
                            ? `${Math.round((statusCounts.completed / total) * 100)}%`
                            : '—';
                        })()}
                      </div>
                      <div className="text-sm text-slate-400">Success Rate</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            {campaign.campaign_type === 'call' && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
                    <Target className="w-5 h-5" />
                    Call Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-slate-400">Max Duration</div>
                      <div className="text-lg font-semibold text-slate-200">
                        {campaign.call_settings?.max_duration || 300}s
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-400">Retry Attempts</div>
                      <div className="text-lg font-semibold text-slate-200">
                        {campaign.call_settings?.retry_attempts || 2}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-400">Business Hours Only</div>
                      <div className="text-lg font-semibold text-slate-200">
                        {campaign.call_settings?.business_hours_only ? 'Yes' : 'No'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-400">Delay Between Calls</div>
                      <div className="text-lg font-semibold text-slate-200">
                        {campaign.call_settings?.delay_between_calls || 60}s
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-slate-100">
                  <Calendar className="w-5 h-5" />
                  Schedule Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-400">Start Date</div>
                    <div className="text-lg font-semibold text-slate-200">
                      {campaign.schedule_config?.start_date
                        ? format(new Date(campaign.schedule_config.start_date), 'MMM d, yyyy')
                        : 'Not set'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-400">End Date</div>
                    <div className="text-lg font-semibold text-slate-200">
                      {campaign.schedule_config?.end_date
                        ? format(new Date(campaign.schedule_config.end_date), 'MMM d, yyyy')
                        : 'Not set'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-400">Preferred Hours</div>
                    <div className="text-lg font-semibold text-slate-200">
                      {campaign.schedule_config?.preferred_hours?.start} -{' '}
                      {campaign.schedule_config?.preferred_hours?.end}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-400">Excluded Days</div>
                    <div className="text-lg font-semibold text-slate-200 capitalize">
                      {campaign.schedule_config?.excluded_days?.join(', ') || 'None'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-red-700/50 bg-red-900/20">
              <CardHeader>
                <CardTitle className="text-lg text-red-400">Danger Zone</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={() => onDelete(campaign.id)}
                  className="w-full"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Campaign
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
