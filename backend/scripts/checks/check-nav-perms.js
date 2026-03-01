import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const res = await pool.query(
      "SELECT email, role, metadata FROM users WHERE email = $1",
      ['andrei.byfield@gmail.com']
    );
    console.log('User data from database:');
    console.log(JSON.stringify(res.rows, null, 2));
    
    if (res.rows[0] && res.rows[0].metadata) {
      console.log('\nnavigation_permissions from metadata:');
      console.log(res.rows[0].metadata.navigation_permissions || 'NOT FOUND');
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
})();
