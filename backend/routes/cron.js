/**
 * Cron Routes
 * Scheduled job management with actual database-backed operations
 */

import express from 'express';
import { executeJob } from '../lib/cronExecutors.js';
import { cacheList } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

export default function createCronRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/cron/jobs - List cron jobs
  router.get('/jobs', cacheList('cron_jobs', 240), async (req, res) => {
    try {
      const { is_active } = req.query;

      // Enforce tenant isolation
      const tenant_id = req.tenant?.id || req.query.tenant_id;
      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      let query = supabase
        .from('cron_job')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false });

      if (is_active !== undefined) {
        query = query.eq('is_active', is_active === 'true');
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: { 
          jobs: data || [],
          total: data?.length || 0
        },
      });
    } catch (error) {
      logger.error('Error listing cron jobs:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/cron/jobs/:id - Get single cron job
  router.get('/jobs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from('cron_job')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Cron job not found'
        });
      }

      res.json({
        status: 'success',
        data: { job: data }
      });
    } catch (error) {
      logger.error('Error getting cron job:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/cron/jobs - Create new cron job
  router.post('/jobs', async (req, res) => {
    try {
      const { 
        tenant_id, 
        name, 
        schedule, 
        function_name, 
        is_active = true,
        metadata = {}
      } = req.body;

      if (!name || !schedule || !function_name) {
        return res.status(400).json({
          status: 'error',
          message: 'name, schedule, and function_name are required'
        });
      }

      // Calculate initial next_run time
      const next_run = calculateNextRun(schedule, new Date());

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('cron_job')
        .insert([{
          tenant_id: tenant_id || null,
          name,
          schedule,
          function_name,
          is_active,
          next_run: next_run?.toISOString() || null,
          metadata,
          created_at: nowIso,
          updated_at: nowIso
        }])
        .select('*')
        .single();
      
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        message: 'Cron job created',
        data: { job: data },
      });
    } catch (error) {
      logger.error('Error creating cron job:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/cron/jobs/:id - Update cron job
  router.put('/jobs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, schedule, function_name, is_active, metadata } = req.body;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      const updatePayload = {};
      if (name !== undefined) updatePayload.name = name;
      if (schedule !== undefined) {
        updatePayload.schedule = schedule;
        const next_run = calculateNextRun(schedule, new Date());
        updatePayload.next_run = next_run?.toISOString() || null;
      }
      if (function_name !== undefined) updatePayload.function_name = function_name;
      if (is_active !== undefined) updatePayload.is_active = is_active;
      if (metadata !== undefined) updatePayload.metadata = metadata;
      updatePayload.updated_at = new Date().toISOString();

      if (Object.keys(updatePayload).length === 1 && updatePayload.updated_at) {
        return res.status(400).json({
          status: 'error',
          message: 'No fields to update'
        });
      }

      const { data, error } = await supabase
        .from('cron_job')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Cron job not found'
        });
      }

      res.json({
        status: 'success',
        message: 'Cron job updated',
        data: { job: data }
      });
    } catch (error) {
      logger.error('Error updating cron job:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/cron/jobs/:id - Delete cron job
  router.delete('/jobs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from('cron_job')
        .delete()
        .eq('id', id)
        .select('*')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Cron job not found'
        });
      }

      res.json({
        status: 'success',
        message: 'Cron job deleted',
        data: { job: data }
      });
    } catch (error) {
      logger.error('Error deleting cron job:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/cron/run - Execute due cron jobs
  router.post('/run', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      
      // Fetch all active jobs that are due to run
      const { data: jobs, error: fetchErr } = await supabase
        .from('cron_job')
        .select('*')
        .eq('is_active', true)
        .or(`next_run.is.null,next_run.lte.${nowIso}`)
        .order('next_run', { ascending: true, nullsFirst: true });
      
      if (fetchErr) throw new Error(fetchErr.message);

      const executed = [];
      const skipped = [];
      const failed = [];

      for (const job of jobs || []) {
        try {
          // Calculate next run time
          const nextRun = calculateNextRun(job.schedule, now);
          
          // Update job metadata
          const newMeta = {
            ...(job.metadata || {}),
            last_execution: nowIso,
            execution_count: (parseInt(job.metadata?.execution_count) || 0) + 1
          };
          
          await supabase
            .from('cron_job')
            .update({
              last_run: nowIso,
              next_run: nextRun?.toISOString() || null,
              metadata: newMeta,
              updated_at: nowIso
            })
            .eq('id', job.id);

          executed.push({
            id: job.id,
            name: job.name,
            function_name: job.function_name,
            next_run: nextRun?.toISOString(),
            executed_at: nowIso
          });

          // Execute the actual job function via the job registry
          if (job.function_name) {
            // Note: executeJob needs access to database - pass supabase client via metadata
            await executeJob(job.function_name, null, { ...job.metadata || {}, supabase });
          }
          
        } catch (error) {
          logger.error(`Error executing cron job ${job.name}:`, error);
          
          failed.push({
            id: job.id,
            name: job.name,
            error: error.message
          });

          // Update error count
          const errorMeta = {
            ...(job.metadata || {}),
            last_error: error.message,
            error_count: (parseInt(job.metadata?.error_count) || 0) + 1
          };
          
          await supabase
            .from('cron_job')
            .update({
              metadata: errorMeta,
              updated_at: nowIso
            })
            .eq('id', job.id);
        }
      }

      res.json({
        status: 'success',
        data: {
          summary: {
            total: jobs?.length || 0,
            executed: executed.length,
            skipped: skipped.length,
            failed: failed.length,
            duration_ms: Date.now() - startTime
          },
          executed,
          failed
        }
      });
    } catch (error) {
      logger.error('Error running cron jobs:', error);
      res.status(500).json({ 
        status: 'error', 
        message: error.message,
        duration_ms: Date.now() - startTime
      });
    }
  });

  // POST /api/cron/jobs/:id/run - Force run a specific cron job immediately
  router.post('/jobs/:id/run', async (req, res) => {
    const startTime = Date.now();

    try {
      const { id } = req.params;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Fetch the job
      const { data: job, error: fetchErr } = await supabase
        .from('cron_job')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) throw new Error(fetchErr.message);
      if (!job) {
        return res.status(404).json({
          status: 'error',
          message: 'Cron job not found'
        });
      }

      const nowIso = new Date().toISOString();

      // Execute the job
      let executionResult = null;
      if (job.function_name) {
        executionResult = await executeJob(job.function_name, null, { ...job.metadata || {}, supabase });
      }

      // Update last_run and next_run
      const nextRun = calculateNextRun(job.schedule, new Date());
      await supabase
        .from('cron_job')
        .update({
          last_run: nowIso,
          next_run: nextRun?.toISOString(),
          updated_at: nowIso
        })
        .eq('id', id);

      res.json({
        status: 'success',
        message: `Job "${job.name}" executed`,
        data: {
          job: {
            id: job.id,
            name: job.name,
            function_name: job.function_name
          },
          result: executionResult,
          duration_ms: Date.now() - startTime
        }
      });
    } catch (error) {
      logger.error('Error running cron job:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
        duration_ms: Date.now() - startTime
      });
    }
  });

  return router;
}

// Helper function to calculate next run time
function calculateNextRun(schedule, fromDate) {
  if (!schedule) return null;
  
  const from = new Date(fromDate);
  const scheduleLower = schedule.toLowerCase();
  
  // Handle simple expressions
  if (scheduleLower === 'every_minute' || scheduleLower === '* * * * *') {
    return new Date(from.getTime() + 60 * 1000);
  }
  if (scheduleLower === 'every_5_minutes' || scheduleLower === '*/5 * * * *') {
    return new Date(from.getTime() + 5 * 60 * 1000);
  }
  if (scheduleLower === 'every_15_minutes' || scheduleLower === '*/15 * * * *') {
    return new Date(from.getTime() + 15 * 60 * 1000);
  }
  if (scheduleLower === 'every_30_minutes' || scheduleLower === '*/30 * * * *') {
    return new Date(from.getTime() + 30 * 60 * 1000);
  }
  if (scheduleLower === 'hourly' || scheduleLower === 'every_hour' || scheduleLower === '0 * * * *') {
    const next = new Date(from);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  }
  if (scheduleLower === 'daily' || scheduleLower === '0 0 * * *') {
    const next = new Date(from);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }
  if (scheduleLower === 'weekly' || scheduleLower === '0 0 * * 0') {
    const next = new Date(from);
    next.setDate(next.getDate() + (7 - next.getDay()));
    next.setHours(0, 0, 0, 0);
    return next;
  }
  
  // Default to 5 minutes for unrecognized patterns
  logger.warn(`Unknown schedule pattern: ${schedule}, defaulting to 5 minutes`);
  return new Date(from.getTime() + 5 * 60 * 1000);
}
