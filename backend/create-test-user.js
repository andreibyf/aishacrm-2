import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = 'postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DATABASE_URL });

async function createTestUser() {
  try {
    console.log('\n🔐 Creating Test User in Supabase Auth...\n');
    
    // Note: We need to use Supabase's admin API to create users
    // For now, let's check if auth.users table exists
    const checkAuth = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'auth' 
        AND table_name = 'users'
      );
    `);
    
    if (checkAuth.rows[0].exists) {
      console.log('✅ Supabase Auth schema exists\n');
      console.log('📋 To create a test user:\n');
      console.log('1. Go to https://supabase.com/dashboard');
      console.log('2. Select project: ehjlenywplgyiahgxkfj');
      console.log('3. Go to Authentication → Users');
      console.log('4. Click "Add User" button');
      console.log('5. Fill in:');
      console.log('   Email: test@aishacrm.com');
      console.log('   Password: TestPassword123!');
      console.log('   User Metadata (JSON):');
      console.log('   {');
      console.log('     "tenant_id": "local-tenant-001",');
      console.log('     "name": "Test User"');
      console.log('   }');
      console.log('\n6. Click "Create User"\n');
      console.log('Then you can test sign in with:');
      console.log('   Email: test@aishacrm.com');
      console.log('   Password: TestPassword123!\n');
    } else {
      console.log('❌ Auth schema not found. Supabase Auth may not be enabled.\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

createTestUser();
