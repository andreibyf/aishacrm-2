import { useState } from 'react';
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
  draft: 'bg-gray-500 text-gray-100',
  scheduled: 'bg-blue-500 text-blue-100',
  running: 'bg-green-500 text-green-100',
  paused: 'bg-yellow-500 text-yellow-100',
  completed: 'bg-purple-500 text-purple-100',
  cancelled: 'bg-red-500 text-red-100',
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

  if (!campaign) return null;

  const contacts = parseContacts(campaign.target_contacts);

  const getProgressPercentage = () => {
    if (contacts.length === 0) return 0;
    const completedContacts = contacts.filter((c) =>
      ['completed', 'failed', 'skipped'].includes(c.status),
    ).length;
    return Math.round((completedContacts / contacts.length) * 100);
  };

  const getStatusCounts = () => {
    return contacts.reduce(
      (counts, contact) => {
        counts[contact.status] = (counts[contact.status] || 0) + 1;
        return counts;
      },
      { pending: 0, completed: 0, failed: 0, scheduled: 0 },
    );
  };

  const statusCounts = getStatusCounts();

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
                  Target Contacts ({contacts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contacts.length === 0 ? (
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
                          <div className="flex items-center gap-2">
                            {contact.status === 'completed' && (
                              <CheckCircle className="w-4 h-4 text-green-400" />
                            )}
                            {contact.status === 'failed' && (
                              <XCircle className="w-4 h-4 text-red-400" />
                            )}
                            {contact.status === 'scheduled' && (
                              <Clock className="w-4 h-4 text-blue-400" />
                            )}
                            {contact.status === 'pending' && (
                              <Clock className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-slate-200">{contact.contact_name}</div>
                            <div className="text-sm text-slate-400">{contact.phone}</div>
                            {contact.company && (
                              <div className="text-sm text-slate-400">{contact.company}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <Badge
                            variant="outline"
                            className="capitalize border-slate-600 text-slate-300"
                          >
                            {contact.status}
                          </Badge>
                          {contact.scheduled_date && (
                            <div className="text-xs text-slate-500 mt-1">
                              {format(new Date(contact.scheduled_date), 'MMM d')} at{' '}
                              {contact.scheduled_time}
                            </div>
                          )}
                          {contact.outcome && (
                            <div className="text-xs text-slate-400 mt-1 max-w-48 truncate">
                              {contact.outcome}
                            </div>
                          )}
                        </div>
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
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
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
