import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

async function fixUserTenantId() {
  try {
    await client.connect();
    
    // Find users with string tenant_id that should be UUID
    console.log('\n=== Finding users with invalid tenant_id ===');
    const invalidUsers = await client.query(`
      SELECT u.id, u.email, u.role, u.tenant_id, t.id as correct_tenant_id, t.name as tenant_name
      FROM users u
      LEFT JOIN tenant t ON (
        LOWER(u.tenant_id) = LOWER(t.name) OR 
        LOWER(u.tenant_id) = REPLACE(LOWER(t.name), ' ', '-')
      )
      WHERE u.tenant_id IS NOT NULL 
        AND u.tenant_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    `);
    
    console.table(invalidUsers.rows);
    
    if (invalidUsers.rows.length === 0) {
      console.log('✅ No users with invalid tenant_id found');
      return;
    }
    
    // Fix each user
    for (const user of invalidUsers.rows) {
      if (user.correct_tenant_id) {
        console.log(`\nFixing user ${user.email}:`);
        console.log(`  Old tenant_id: ${user.tenant_id}`);
        console.log(`  New tenant_id: ${user.correct_tenant_id} (${user.tenant_name})`);
        
        await client.query(
          `UPDATE users SET tenant_id = $1 WHERE id = $2`,
          [user.correct_tenant_id, user.id]
        );
        
        console.log('  ✅ Updated');
      } else {
        console.log(`\n⚠️  Could not find matching tenant for user ${user.email} with tenant_id "${user.tenant_id}"`);
      }
    }
    
    console.log('\n=== Verification ===');
    const verification = await client.query(`
      SELECT id, email, role, tenant_id 
      FROM users 
      WHERE email = 'andrei.byfield@gmail.com'
    `);
    console.table(verification.rows);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

fixUserTenantId();
