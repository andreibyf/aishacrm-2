
import { useState, useEffect, useCallback } from 'react';
import { CronJob } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Clock, Loader2, Zap, ChevronDown, ChevronRight, Play, RefreshCw, BarChart3, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

// Available functions that can be scheduled (not currently used, reserved for future UI)
const _SCHEDULABLE_FUNCTIONS = [
  {
    name: 'processScheduledAICalls',
    description: 'Process and execute scheduled AI calls',
    recommendedSchedule: 'every_5_minutes',
    category: 'AI Calls',
    requiresTenant: true
  },
  {
    name: 'processScheduledAIEmails',
    description: 'Process and send scheduled AI emails',
    recommendedSchedule: 'every_15_minutes',
    category: 'AI Emails',
    requiresTenant: true
  },
  {
    name: 'archiveAgedData',
    description: 'Archive old completed activities and opportunities',
    recommendedSchedule: 'daily',
    category: 'Data Management',
    requiresTenant: true
  },
  {
    name: 'cleanupTestRecords',
    description: 'Remove test data and expired records',
    recommendedSchedule: 'weekly',
    category: 'Data Management',
    requiresTenant: false
  },
  {
    name: 'checkIntegrationUsage',
    description: 'Monitor API usage and integration health',
    recommendedSchedule: 'hourly',
    category: 'Monitoring',
    requiresTenant: false
  },
  {
    name: 'generateDailyBriefing',
    description: 'Generate daily CRM summary reports',
    recommendedSchedule: 'daily_8am',
    category: 'Reporting',
    requiresTenant: true
  },
  {
    name: 'runFullSystemDiagnostics',
    description: 'Run comprehensive system health checks',
    recommendedSchedule: 'daily_midnight',
    category: 'Monitoring',
    requiresTenant: false
  }
];

const SCHEDULE_PRESETS = {
  'every_15_seconds': { expression: 'N/A', description: 'Every 15 seconds' },
  'every_30_seconds': { expression: 'N/A', description: 'Every 30 seconds' },
  'every_minute': { expression: '* * * * *', description: 'Every minute' },
  'every_5_minutes': { expression: '*/5 * * * *', description: 'Every 5 minutes' },
  'every_15_minutes': { expression: '*/15 * * * *', description: 'Every 15 minutes' },
  'every_30_minutes': { expression: '*/30 * * * *', description: 'Every 30 minutes' },
  'hourly': { expression: '0 * * * *', description: 'Every hour' },
  'daily': { expression: '0 0 * * *', description: 'Daily at midnight' },
  'daily_8am': { expression: '0 8 * * *', description: 'Daily at 8 AM' },
  'daily_midnight': { expression: '0 0 * * *', description: 'Daily at midnight' },
  'weekly': { expression: '0 0 * * 0', description: 'Weekly on Sunday' },
  'monthly': { expression: '0 0 1 * *', description: 'Monthly on 1st' }
};

export default function CronJobManager({ user }) {
  const [cronJobs, setCronJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadCronJobs = useCallback(async () => {
    try {
      setLoading(true);
      const [jobs, _tenantsData] = await Promise.all([
        CronJob.list('-created_date'),
        user?.role === 'superadmin' || user?.role === 'admin' ?
          (async () => {
            try {
              const { Tenant } = await import('@/api/entities');
              return await Tenant.list();
            } catch (error) {
              console.error('Error loading tenants:', error);
              toast.error('Failed to load tenants.');
              return [];
            }
          })() : Promise.resolve([])
      ]);
      setCronJobs(jobs);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading cron jobs:', error);
      toast.error('Failed to load scheduled tasks.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadCronJobs();
  }, [loadCronJobs]);

  // Update current time every second for real-time countdowns
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadCronJobs();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadCronJobs, autoRefresh]);

  // Calculate time until next run
  const getTimeUntilNextRun = (nextRun) => {
    if (!nextRun) return 'Not scheduled';
    const next = new Date(nextRun);
    const diff = next.getTime() - currentTime.getTime();
    if (diff <= 0) return 'Overdue';
    
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  // Get execution health status
  const getExecutionHealth = (job) => {
    const count = job.metadata?.execution_count || 0;
    const lastRun = job.last_run;
    const isActive = job.is_active;
    
    if (!isActive) return { status: 'paused', color: 'slate' };
    if (count === 0) return { status: 'pending', color: 'yellow' };
    if (lastRun) {
      const lastRunTime = new Date(lastRun);
      const hoursSinceLastRun = (currentTime - lastRunTime) / (1000 * 60 * 60);
      if (hoursSinceLastRun > 24) return { status: 'stale', color: 'red' };
      if (hoursSinceLastRun > 2) return { status: 'delayed', color: 'orange' };
    }
    return { status: 'healthy', color: 'green' };
  };

  // Toggle job details expansion
  const toggleJobExpansion = (jobId) => {
    const newExpanded = new Set(expandedJobs);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedJobs(newExpanded);
  };

  // UNUSED: Future features for creating/editing cron jobs
  // const calculateNextExecution = (scheduleExpression) => { ... }
  // const handleSubmit = async (e) => { ... }
  //       description: '',
  //       is_active: true,
  //       max_retries: 3,
  //       timeout_seconds: 300
  //     });

  //     loadCronJobs();
  //   } catch (error) {
  //     console.error('Error saving cron job:', error);
  //     toast.error(`Error saving scheduled task: ${error.message}`);
  //   } finally {
  //     setSaving(false);
  //   }
  // };

  const handleToggleActive = async (jobId, isActive) => {
    try {
      await CronJob.update(jobId, { is_active: isActive });
      toast.success(`Task status updated to ${isActive ? 'Active' : 'Paused'}.`);
      loadCronJobs();
    } catch (error) {
      console.error('Error toggling job status:', error);
      toast.error('Failed to toggle task status.');
    }
  };

  // Handle running job immediately
  const handleRunNow = async (jobId, jobName) => {
    try {
      toast.loading(`Running ${jobName} now...`, { id: `run-${jobId}` });
      const result = await CronJob.runNow(jobId);
      
      if (result.status === 'success') {
        toast.success(`${jobName} executed successfully`, { 
          id: `run-${jobId}`,
          description: `Duration: ${result.data?.duration_ms || 0}ms`
        });
      } else {
        throw new Error(result.message || 'Execution failed');
      }
      
      // Reload to get updated execution stats
      loadCronJobs();
    } catch (error) {
      console.error('Error running job:', error);
      toast.error(`Failed to run ${jobName}`, { 
        id: `run-${jobId}`,
        description: error.message 
      });
    }
  };

  // UNUSED: handleDelete function - not connected to UI
  // const handleDelete = async (jobId) => {
  //   if (!confirm('Are you sure you want to delete this cron job?')) return;

  //   try {
  //     await CronJob.delete(jobId);
  //     toast.success('Scheduled task deleted successfully.');
  //     loadCronJobs();
  //   } catch (error) {
  //     console.error('Error deleting cron job:', error);
  //     toast.error('Failed to delete scheduled task.');
  //   }
  // };

  // UNUSED: handleEdit function - not connected to UI
  // const handleEdit = (job) => {
  //   setEditingJob(job);
  //   setFormData({
  //     name: job.name,
  //     tenant_id: job.tenant_id || '',
  //     function_name: job.function_name,
  //     schedule_expression: job.schedule_expression,
  //     description: job.description || '',
  //     is_active: job.is_active,
  //     max_retries: job.max_retries || 3,
  //     timeout_seconds: job.timeout_seconds || 300
  //   });
  //   setIsCreateDialogOpen(true);
  // };

  // UNUSED: getStatusBadge function - not connected to UI
  // const getStatusBadge = (job) => {
  //   if (!job.is_active) {
  //     return <Badge variant="secondary" className="bg-slate-600 text-slate-300">Paused</Badge>;
  //   }

  //   if (job.error_count > 0) {
  //     return <Badge variant="destructive" className="bg-red-700 text-red-100">Error ({job.error_count})</Badge>;
  //   }

  //   return <Badge variant="default" className="bg-green-600 text-white">Active</Badge>;
  // };

  // UNUSED: getNextRunText function - not connected to UI
  // const getNextRunText = (job) => {
  //   if (!job.next_execution) return 'Not scheduled';

  //   const nextRun = new Date(job.next_execution);
  //   const now = new Date();

  //   if (nextRun < now) {
  //     return 'Overdue';
  //   }

  //   return format(nextRun, 'MMM d, h:mm a');
  // };

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <Clock className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          Manage scheduled background tasks and automated processes.
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <Clock className="w-5 h-5 text-yellow-400" />
                Scheduled Cron Jobs
              </CardTitle>
              <CardDescription className="text-slate-400">
                View and manage automated tasks
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Last refresh: {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                  className="data-[state=checked]:bg-blue-600"
                />
                <span className="text-slate-400">Auto-refresh (30s)</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-slate-300 border-slate-600 hover:bg-slate-700"
                onClick={loadCronJobs}
                disabled={loading}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          ) : cronJobs.length === 0 ? (
            <div className="text-center p-8 text-slate-400">
              No cron jobs configured
            </div>
          ) : (
            <div className="space-y-3">
              {cronJobs.map((job) => {
                const isSystemWorker = job.metadata?.type === 'system_worker';
                const executionCount = job.metadata?.execution_count || 0;
                const health = getExecutionHealth(job);
                const isExpanded = expandedJobs.has(job.id);
                const timeUntilNext = getTimeUntilNextRun(job.next_run);
                
                return (
                  <Collapsible key={job.id} open={isExpanded} onOpenChange={() => toggleJobExpansion(job.id)}>
                    <div className="p-4 bg-slate-900 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isSystemWorker && <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
                            <p className="font-medium text-slate-200 truncate">{job.name}</p>
                            {/* Health indicator */}
                            <div className="flex items-center gap-1">
                              {health.status === 'healthy' && <CheckCircle className="w-3 h-3 text-green-400" />}
                              {health.status === 'stale' && <AlertCircle className="w-3 h-3 text-red-400" />}
                              {health.status === 'delayed' && <AlertCircle className="w-3 h-3 text-orange-400" />}
                              {health.status === 'pending' && <Clock className="w-3 h-3 text-yellow-400" />}
                              {health.status === 'paused' && <div className="w-3 h-3 bg-slate-500 rounded-full" />}
                            </div>
                          </div>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                            {job.metadata?.description || job.description || 'No description'}
                          </p>
                          
                          {/* Enhanced execution stats */}
                          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs">
                            <div className="flex items-center gap-1 text-slate-400">
                              <Clock className="w-3 h-3" />
                              <span>{SCHEDULE_PRESETS[job.schedule]?.description || job.schedule}</span>
                            </div>
                            
                            {job.is_active && (
                              <div className="flex items-center gap-1 text-blue-400">
                                <RefreshCw className="w-3 h-3" />
                                <span>Next: {timeUntilNext}</span>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-1 text-slate-500">
                              <BarChart3 className="w-3 h-3" />
                              <span>{executionCount} runs</span>
                            </div>
                            
                            {job.last_run && (
                              <div className="text-slate-500">
                                Last: {new Date(job.last_run).toLocaleString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Status and controls */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <Badge 
                            variant={job.is_active ? 'default' : 'secondary'} 
                            className={`${
                              job.is_active 
                                ? health.color === 'green' ? 'bg-green-600' 
                                  : health.color === 'yellow' ? 'bg-yellow-600' 
                                  : health.color === 'orange' ? 'bg-orange-600' 
                                  : health.color === 'red' ? 'bg-red-600' 
                                  : 'bg-blue-600'
                                : 'bg-slate-600'
                            }`}
                          >
                            {job.is_active ? (
                              health.status === 'healthy' ? 'Active' :
                              health.status === 'delayed' ? 'Delayed' :
                              health.status === 'stale' ? 'Stale' :
                              health.status === 'pending' ? 'Pending' : 'Active'
                            ) : 'Paused'}
                          </Badge>
                          
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </Button>
                          </CollapsibleTrigger>
                          
                          <Switch
                            checked={job.is_active}
                            onCheckedChange={(checked) => handleToggleActive(job.id, checked)}
                            className="data-[state=checked]:bg-green-600"
                          />
                        </div>
                      </div>
                      
                      {/* Expanded details */}
                      <CollapsibleContent className="pt-4 border-t border-slate-700 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                          <div className="space-y-2">
                            <h4 className="font-medium text-slate-300">Schedule Details</h4>
                            <div className="space-y-1 text-xs text-slate-400">
                              <div>Expression: <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">{job.schedule}</code></div>
                              <div>Function: <code className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">{job.function_name}</code></div>
                              {job.next_run && (
                                <div>Next Run: {new Date(job.next_run).toLocaleString()}</div>
                              )}
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <h4 className="font-medium text-slate-300">Execution Stats</h4>
                            <div className="space-y-1 text-xs text-slate-400">
                              <div>Total Runs: {executionCount}</div>
                              <div>Status: <span className={`text-${health.color}-400`}>{health.status}</span></div>
                              {job.last_run && (
                                <div>Last Success: {new Date(job.last_run).toLocaleString()}</div>
                              )}
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <h4 className="font-medium text-slate-300">Metadata</h4>
                            <div className="space-y-1 text-xs text-slate-400">
                              <div>Created: {new Date(job.created_at).toLocaleDateString()}</div>
                              <div>Updated: {new Date(job.updated_at).toLocaleDateString()}</div>
                              {job.metadata?.version && (
                                <div>Version: {job.metadata.version}</div>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {/* Quick actions */}
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-700">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-slate-300 border-slate-600 hover:bg-slate-700"
                            disabled={!job.is_active}
                            onClick={() => handleRunNow(job.id, job.name)}
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Run Now
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-slate-400"
                            onClick={() => loadCronJobs()}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Refresh
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
