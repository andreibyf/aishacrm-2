import { useState, useEffect, useCallback } from 'react'
import { CronJob } from '@/api/entities';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import { Alert, AlertDescription } from "@/components/ui/alert"; // Added Alert and AlertDescription
import { Clock, Loader2 } from 'lucide-react'

import { toast } from "sonner";

// Available functions that can be scheduled
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
  const [_tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [_isCreateDialogOpen, _setIsCreateDialogOpen] = useState(false);
  const [_editingJob, _setEditingJob] = useState(null);
  const [_saving, _setSaving] = useState(false);

  const [_formData, _setFormData] = useState({
    name: '',
    tenant_id: '',
    function_name: '',
    schedule_expression: '',
    description: '',
    is_active: true,
    max_retries: 3,
    timeout_seconds: 300
  });

  const loadCronJobs = useCallback(async () => {
    try {
      setLoading(true);
      const [jobs, tenantsData] = await Promise.all([
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
      setTenants(tenantsData);
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

  const _calculateNextExecution = (scheduleExpression) => {
    // Simple calculation - in production you'd want a proper cron parser
    const now = new Date();
    // const preset = SCHEDULE_PRESETS[scheduleExpression]; // unused variable

    // This simplified logic assumes schedule_expression directly maps to preset keys or implies 'every_minute'
    // For a real cron expression, a library like 'cron-parser' would be used.
    // For now, based on the existing logic:
    switch (scheduleExpression) {
      case 'every_minute':
        return new Date(now.getTime() + 60 * 1000).toISOString();
      case 'every_5_minutes':
        return new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      case 'every_15_minutes':
        return new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      case 'every_30_minutes':
        return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
      case 'hourly':
        const nextHour = new Date(now);
        nextHour.setHours(now.getHours() + 1, 0, 0, 0);
        return nextHour.toISOString();
      case 'daily':
      case 'daily_midnight':
        const nextDay = new Date(now);
        nextDay.setDate(now.getDate() + 1);
        nextDay.setHours(0, 0, 0, 0);
        return nextDay.toISOString();
      case 'daily_8am':
        const next8am = new Date(now);
        if (now.getHours() >= 8) {
          next8am.setDate(now.getDate() + 1);
        }
        next8am.setHours(8, 0, 0, 0);
        return next8am.toISOString();
      case 'weekly':
        const nextWeek = new Date(now);
        nextWeek.setDate(now.getDate() + (7 - now.getDay())); // Next Sunday
        nextWeek.setHours(0, 0, 0, 0);
        return nextWeek.toISOString();
      case 'monthly':
        const nextMonth = new Date(now);
        nextMonth.setMonth(now.getMonth() + 1, 1); // 1st of next month
        nextMonth.setHours(0, 0, 0, 0);
        return nextMonth.toISOString();
      default:
        // If not a known preset, fallback to a default or error. Here, we'll mimic every minute.
        return new Date(now.getTime() + 60 * 1000).toISOString();
    }
  };

  // UNUSED: handleSubmit function - form submission not connected to UI
  // const handleSubmit = async (e) => {
  //   e.preventDefault();
  //   setSaving(true);

  //   try {
  //     const payload = {
  //       ...formData,
  //       tenant_id: formData.tenant_id === '' ? null : formData.tenant_id
  //     };

  //     if (editingJob) {
  //       await CronJob.update(editingJob.id, payload);
  //       toast.success(`Task "${payload.name}" updated successfully.`);
  //     } else {
  //       const nextExecution = calculateNextExecution(formData.schedule_expression);
  //       await CronJob.create({
  //         ...payload,
  //         next_execution: nextExecution
  //       });
  //       toast.success(`Task "${payload.name}" created successfully.`);
  //     }

  //     setIsCreateDialogOpen(false);
  //     setEditingJob(null);
  //     setFormData({
  //       name: '',
  //       tenant_id: '',
  //       function_name: '',
  //       schedule_expression: '',
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

  // UNUSED: handleToggleActive function - not connected to UI
  // const handleToggleActive = async (jobId, isActive) => {
  //   try {
  //     await CronJob.update(jobId, { is_active: isActive });
  //     toast.success(`Task status updated to ${isActive ? 'Active' : 'Paused'}.`);
  //     loadCronJobs();
  //   } catch (error) {
  //     console.error('Error toggling job status:', error);
  //     toast.error('Failed to toggle task status.');
  //   }
  // };

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
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Clock className="w-5 h-5 text-yellow-400" />
            Scheduled Cron Jobs
          </CardTitle>
          <CardDescription className="text-slate-400">
            View and manage automated tasks
          </CardDescription>
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
              {cronJobs.map((job) => (
                <div key={job.id} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-slate-200">{job.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{job.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span>Schedule: {SCHEDULE_PRESETS[job.schedule_expression]?.description || job.schedule_expression}</span>
                        <span>Executions: {job.execution_count}</span>
                      </div>
                    </div>
                    <Badge variant={job.is_active ? 'default' : 'secondary'} className={job.is_active ? 'bg-green-600' : 'bg-slate-600'}>
                      {job.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
