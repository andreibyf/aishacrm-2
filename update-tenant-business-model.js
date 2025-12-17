const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function updateTenant() {
  try {
    console.log('Starting tenant business_model update...');
    console.log('Target tenant ID: a11dfb63-4b18-4eb8-872e-747af2e37c46');
    
    // First, check current state
    const checkResult = await pool.query(
      'SELECT id, name, business_model FROM tenant WHERE id = $1',
      ['a11dfb63-4b18-4eb8-872e-747af2e37c46']
    );
    
    if (checkResult.rows.length === 0) {
      console.error('Tenant not found');
      process.exit(1);
    }
    
    const current = checkResult.rows[0];
    console.log('Current state:', {
      id: current.id,
      name: current.name,
      business_model: current.business_model
    });
    
    // Update to b2c
    const updateResult = await pool.query(
      'UPDATE tenant SET business_model = $1 WHERE id = $2 RETURNING id, name, business_model',
      ['b2c', 'a11dfb63-4b18-4eb8-872e-747af2e37c46']
    );
    
    const updated = updateResult.rows[0];
    console.log('\n✅ Update successful!');
    console.log('New state:', {
      id: updated.id,
      name: updated.name,
      business_model: updated.business_model
    });
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateTenant();
