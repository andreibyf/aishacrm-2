import pgPool from './backend/lib/db.cjs';

(async () => {
  try {
    const res = await pgPool.query(
      'SELECT tenant_id, COUNT(*) as count FROM performance_logs GROUP BY tenant_id ORDER BY count DESC'
    );
    console.log('Performance logs by tenant:');
    res.rows.forEach(r => console.log(`  ${r.tenant_id}: ${r.count}`));
    
    const res2 = await pgPool.query(
      'SELECT tenant_id, COUNT(*) as count FROM system_logs GROUP BY tenant_id ORDER BY count DESC'
    );
    console.log('\nSystem logs by tenant:');
    res2.rows.forEach(r => console.log(`  ${r.tenant_id}: ${r.count}`));
    
    const res3 = await pgPool.query(
      `SELECT tenant_id, source, level, COUNT(*) as count 
       FROM system_logs 
       WHERE created_at > NOW() - INTERVAL '24 hours'
       GROUP BY tenant_id, source, level 
       ORDER BY count DESC`
    );
    console.log('\nSystem logs in last 24h (by tenant, source, level):');
    res3.rows.forEach(r => console.log(`  ${r.tenant_id} | ${r.source} | ${r.level}: ${r.count}`));
    
    await pgPool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
