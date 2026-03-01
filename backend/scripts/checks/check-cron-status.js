import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const { rows } = await pool.query(`
  SELECT 
    name, 
    last_run, 
    next_run, 
    metadata->>'execution_count' as executions, 
    metadata->>'last_execution' as last_execution
  FROM cron_job 
  ORDER BY name
`);

console.log('\n✅ Cron Job Status:\n');
rows.forEach(r => {
  console.log(`📊 ${r.name}:`);
  console.log(`   Last run: ${r.last_run || 'Never'}`);
  console.log(`   Next run: ${r.next_run || 'Not scheduled'}`);
  console.log(`   Executions: ${r.executions || 0}`);
  console.log(`   Last execution: ${r.last_execution || 'N/A'}`);
  console.log('');
});

await pool.end();
