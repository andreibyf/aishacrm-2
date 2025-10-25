import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedTestTenant() {
  try {
    console.log('\n🌱 Seeding test tenant...\n');
    
    // Check if tenant exists
    const existingTenant = await pool.query(
      'SELECT * FROM tenant WHERE tenant_id = $1',
      ['local-tenant-001']
    );
    
    if (existingTenant.rows.length > 0) {
      console.log('✓ Tenant "local-tenant-001" already exists');
      console.log('  ID:', existingTenant.rows[0].id);
      console.log('  Name:', existingTenant.rows[0].name);
      return;
    }
    
    // Create tenant
    const result = await pool.query(`
      INSERT INTO tenant (tenant_id, name, status, subscription_tier, branding_settings, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      'local-tenant-001',
      'Local Development Tenant',
      'active',
      'free',
      {
        company_name: 'Aisha CRM Dev',
        primary_color: '#3b82f6',
        logo_url: null
      },
      {
        environment: 'local-dev',
        created_by: 'seed-script'
      }
    ]);
    
    console.log('✅ Created tenant successfully!');
    console.log('  ID (UUID):', result.rows[0].id);
    console.log('  Tenant ID:', result.rows[0].tenant_id);
    console.log('  Name:', result.rows[0].name);
    console.log('  Status:', result.rows[0].status);
    
    // Create a test user for this tenant
    console.log('\n👤 Creating test user...\n');
    
    // Check if user exists first
    const existingUser = await pool.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      ['dev@localhost']
    );
    
    if (existingUser.rows.length > 0) {
      console.log('ℹ️  User already exists');
      console.log('  Email:', existingUser.rows[0].email);
      console.log('  Role:', existingUser.rows[0].role);
    } else {
      const userResult = await pool.query(`
        INSERT INTO users (tenant_id, email, first_name, last_name, role, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, role
      `, [
        'local-tenant-001',
        'dev@localhost',
        'Dev',
        'User',
        'admin',
        'active'
      ]);
      
      console.log('✅ Created user successfully!');
      console.log('  Email:', userResult.rows[0].email);
      console.log('  Role:', userResult.rows[0].role);
    }
    
    console.log('\n✅ Seed completed successfully!\n');
    
  } catch (error) {
    console.error('❌ Error seeding tenant:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

seedTestTenant();
