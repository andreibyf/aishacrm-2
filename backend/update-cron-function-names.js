import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function updateFunctionNames() {
  try {
    console.log('Updating cron job function names to match executor registry...');
    
    await pool.query(`UPDATE cron_job SET function_name = 'markUsersOffline' WHERE function_name = 'mark_users_offline'`);
    await pool.query(`UPDATE cron_job SET function_name = 'cleanOldActivities' WHERE function_name = 'clean_old_activities'`);
    await pool.query(`UPDATE cron_job SET function_name = 'syncDenormalizedFields' WHERE function_name = 'sync_denormalized_fields'`);
    
    const { rows } = await pool.query(`SELECT id, name, function_name FROM cron_job`);
    
    console.log('\n✅ Updated function names:\n');
    rows.forEach(job => {
      console.log(`   - ${job.name}: ${job.function_name}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

updateFunctionNames();
