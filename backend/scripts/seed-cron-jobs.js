/**
 * Seed default cron jobs
 * Run this to populate the cron_job table with essential scheduled tasks
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const defaultJobs = [
  {
    name: 'Mark Users Offline',
    schedule: 'every_5_minutes',
    function_name: 'markUsersOffline',  // Match the executor function name
    is_active: true,
    metadata: {
      description: 'Marks users as offline when last_seen > 5 minutes',
      timeout_minutes: 5
    }
  },
  {
    name: 'Clean Old Activities',
    schedule: 'daily',
    function_name: 'cleanOldActivities',  // Match the executor function name
    is_active: false,
    metadata: {
      description: 'Archives activities older than 1 year',
      retention_days: 365
    }
  },
  {
    name: 'Sync Denormalized Fields',
    schedule: 'hourly',
    function_name: 'syncDenormalizedFields',  // Match the executor function name
    is_active: false,
    metadata: {
      description: 'Syncs denormalized data across tables for performance'
    }
  }
];

async function seedCronJobs() {
  try {
    console.log('Starting cron job seeding...');

    for (const job of defaultJobs) {
      // Check if job already exists
      const existing = await pool.query(
        'SELECT id FROM cron_job WHERE name = $1',
        [job.name]
      );

      if (existing.rows.length > 0) {
        console.log(`⊘ Job "${job.name}" already exists, skipping`);
        continue;
      }

      // Calculate initial next_run
      const now = new Date();
      let next_run = null;
      
      if (job.schedule === 'every_5_minutes') {
        next_run = new Date(now.getTime() + 5 * 60 * 1000);
      } else if (job.schedule === 'hourly') {
        next_run = new Date(now);
        next_run.setMinutes(0, 0, 0);
        next_run.setHours(next_run.getHours() + 1);
      } else if (job.schedule === 'daily') {
        next_run = new Date(now);
        next_run.setDate(next_run.getDate() + 1);
        next_run.setHours(0, 0, 0, 0);
      }

      const result = await pool.query(
        `INSERT INTO cron_job (name, schedule, function_name, is_active, next_run, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id, name`,
        [job.name, job.schedule, job.function_name, job.is_active, next_run, job.metadata]
      );

      console.log(`✓ Created job: "${result.rows[0].name}" (${result.rows[0].id})`);
    }

    console.log('\n✅ Cron job seeding complete!');
    console.log(`\nTo view jobs, run:\nSELECT id, name, schedule, is_active, next_run FROM cron_job ORDER BY created_at;`);
    
  } catch (error) {
    console.error('❌ Error seeding cron jobs:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

seedCronJobs().catch(err => {
  console.error(err);
  process.exit(1);
});
