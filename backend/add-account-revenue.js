import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function addAccountRevenue() {
  try {
    console.log('Adding revenue data to accounts...\n');
    
    // Get some accounts to update
    const accountsResult = await pgPool.query(`
      SELECT id, name 
      FROM accounts 
      WHERE tenant_id = 'local-tenant-001'
      LIMIT 10
    `);
    
    if (accountsResult.rows.length === 0) {
      console.log('No accounts found. Creating sample accounts with revenue...');
      
      // Create sample accounts with revenue
      const sampleAccounts = [
        { name: 'Acme Corporation', revenue: 5000000, industry: 'Technology' },
        { name: 'Global Industries Inc', revenue: 3500000, industry: 'Manufacturing' },
        { name: 'Tech Solutions Ltd', revenue: 2800000, industry: 'Technology' },
        { name: 'Retail Innovations', revenue: 1900000, industry: 'Retail' },
        { name: 'Healthcare Systems', revenue: 4200000, industry: 'Healthcare' }
      ];
      
      for (const account of sampleAccounts) {
        await pgPool.query(`
          INSERT INTO accounts (tenant_id, name, annual_revenue, industry, type, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['local-tenant-001', account.name, account.revenue, account.industry, 'customer', '{}']);
        console.log(`✓ Created: ${account.name} - $${account.revenue.toLocaleString()}`);
      }
    } else {
      console.log(`Found ${accountsResult.rows.length} accounts. Adding revenue data...\n`);
      
      // Revenue values to assign (varying amounts)
      const revenues = [5000000, 3500000, 2800000, 1900000, 1200000, 950000, 750000, 500000];
      
      for (let i = 0; i < Math.min(accountsResult.rows.length, revenues.length); i++) {
        const account = accountsResult.rows[i];
        const revenue = revenues[i];
        
        await pgPool.query(`
          UPDATE accounts 
          SET annual_revenue = $1,
              metadata = COALESCE(metadata, '{}'::jsonb)
          WHERE id = $2
        `, [revenue, account.id]);
        
        console.log(`✓ Updated: ${account.name} - $${revenue.toLocaleString()}`);
      }
    }
    
    // Show top accounts by revenue
    const topAccountsResult = await pgPool.query(`
      SELECT name, annual_revenue, industry
      FROM accounts
      WHERE tenant_id = 'local-tenant-001' 
        AND annual_revenue IS NOT NULL
      ORDER BY annual_revenue DESC
      LIMIT 5
    `);
    
    console.log('\n📊 Top 5 Accounts by Revenue:');
    topAccountsResult.rows.forEach((account, i) => {
      console.log(`  ${i + 1}. ${account.name} - $${account.annual_revenue?.toLocaleString()} (${account.industry || 'N/A'})`);
    });
    
    await pgPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error adding account revenue:', error);
    await pgPool.end();
    process.exit(1);
  }
}

addAccountRevenue();
