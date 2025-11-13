import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  await c.connect();

  const tenant = process.argv[2] || 'test-tenant-001';
  const q1 = `SELECT * FROM v_opportunity_pipeline_by_stage WHERE tenant_id = $1 ORDER BY stage`;
  const q2 = `SELECT * FROM v_lead_counts_by_status WHERE tenant_id = $1 ORDER BY status`;
  const q3 = `SELECT id, subject, due_at FROM v_calendar_activities WHERE tenant_id = $1 ORDER BY COALESCE(due_at, created_at) LIMIT 5`;

  const { rows: pipeline } = await c.query(q1, [tenant]);
  const { rows: leadStatus } = await c.query(q2, [tenant]);
  const { rows: calendar } = await c.query(q3, [tenant]);

  console.log(JSON.stringify({ pipeline, leadStatus, calendar }, null, 2));
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
