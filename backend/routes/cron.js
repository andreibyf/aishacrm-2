/**
 * Cron Routes
 * Scheduled job management with actual database-backed operations
 */

import express from 'express';
import { executeJob } from '../lib/cronExecutors.js';

export default function createCronRoutes(pgPool) {
  const router = express.Router();

  // GET /api/cron/jobs - List cron jobs
  router.get('/jobs', async (req, res) => {
    try {
      const { tenant_id, is_active } = req.query;
      
      let query = 'SELECT * FROM cron_job WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (tenant_id) {
        query += ` AND tenant_id = $${paramCount}`;
        params.push(tenant_id);
        paramCount++;
      }

      if (is_active !== undefined) {
        query += ` AND is_active = $${paramCount}`;
        params.push(is_active === 'true');
        paramCount++;
      }

      query += ' ORDER BY created_at DESC';

      const result = await pgPool.query(query, params);

      res.json({
        status: 'success',
        data: { 
          jobs: result.rows,
          total: result.rows.length
        },
      });
    } catch (error) {
      console.error('Error listing cron jobs:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/cron/jobs/:id - Get single cron job
  router.get('/jobs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pgPool.query(
        'SELECT * FROM cron_job WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Cron job not found'
        });
      }

      res.json({
        status: 'success',
        data: { job: result.rows[0] }
      });
    } catch (error) {
      console.error('Error getting cron job:', error);
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

      const result = await pgPool.query(
        `INSERT INTO cron_job (tenant_id, name, schedule, function_name, is_active, next_run, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [tenant_id || null, name, schedule, function_name, is_active, next_run, metadata]
      );

      res.json({
        status: 'success',
        message: 'Cron job created',
        data: { job: result.rows[0] },
      });
    } catch (error) {
      console.error('Error creating cron job:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/cron/jobs/:id - Update cron job
  router.put('/jobs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, schedule, function_name, is_active, metadata } = req.body;

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        values.push(name);
        paramCount++;
      }

      if (schedule !== undefined) {
        updates.push(`schedule = $${paramCount}`);
        values.push(schedule);
        paramCount++;
        
        // Recalculate next_run if schedule changed
        const next_run = calculateNextRun(schedule, new Date());
        updates.push(`next_run = $${paramCount}`);
        values.push(next_run);
        paramCount++;
      }

      if (function_name !== undefined) {
        updates.push(`function_name = $${paramCount}`);
        values.push(function_name);
        paramCount++;
      }

      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCount}`);
        values.push(is_active);
        paramCount++;
      }

      if (metadata !== undefined) {
        updates.push(`metadata = $${paramCount}`);
        values.push(metadata);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No fields to update'
        });
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      const query = `UPDATE cron_job SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      const result = await pgPool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Cron job not found'
        });
      }

      res.json({
        status: 'success',
        message: 'Cron job updated',
        data: { job: result.rows[0] }
      });
    } catch (error) {
      console.error('Error updating cron job:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/cron/jobs/:id - Delete cron job
  router.delete('/jobs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const result = await pgPool.query(
        'DELETE FROM cron_job WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'Cron job not found'
        });
      }

      res.json({
        status: 'success',
        message: 'Cron job deleted',
        data: { job: result.rows[0] }
      });
    } catch (error) {
      console.error('Error deleting cron job:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/cron/run - Execute due cron jobs
  router.post('/run', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const now = new Date();
      
      // Fetch all active jobs that are due to run
      const result = await pgPool.query(
        `SELECT * FROM cron_job 
         WHERE is_active = true 
         AND (next_run IS NULL OR next_run <= $1)
         ORDER BY next_run ASC NULLS FIRST`,
        [now]
      );

      const jobs = result.rows;
      const executed = [];
      const skipped = [];
      const failed = [];

      for (const job of jobs) {
        try {
          // Calculate next run time
          const nextRun = calculateNextRun(job.schedule, now);
          
          // Update job metadata
          await pgPool.query(
            `UPDATE cron_job 
             SET last_run = $1, 
                 next_run = $2,
                 metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
                 updated_at = NOW()
             WHERE id = $4`,
            [
              now, 
              nextRun, 
              JSON.stringify({
                last_execution: now.toISOString(),
                execution_count: (parseInt(job.metadata?.execution_count) || 0) + 1
              }),
              job.id
            ]
          );

          executed.push({
            id: job.id,
            name: job.name,
            function_name: job.function_name,
            next_run: nextRun?.toISOString(),
            executed_at: now.toISOString()
          });

          // Execute the actual job function via the job registry
          if (job.function_name) {
            await executeJob(job.function_name, pgPool, job.metadata || {});
          }
          
        } catch (error) {
          console.error(`Error executing cron job ${job.name}:`, error);
          
          failed.push({
            id: job.id,
            name: job.name,
            error: error.message
          });

          // Update error count
          await pgPool.query(
            `UPDATE cron_job 
             SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
                 updated_at = NOW()
             WHERE id = $2`,
            [
              JSON.stringify({
                last_error: error.message,
                error_count: (parseInt(job.metadata?.error_count) || 0) + 1
              }),
              job.id
            ]
          );
        }
      }

      res.json({
        status: 'success',
        data: {
          summary: {
            total: jobs.length,
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
      console.error('Error running cron jobs:', error);
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
  console.warn(`Unknown schedule pattern: ${schedule}, defaulting to 5 minutes`);
  return new Date(from.getTime() + 5 * 60 * 1000);
}
