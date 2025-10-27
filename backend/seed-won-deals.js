import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function seedWonDeals() {
  try {
    console.log('Creating test accounts, contacts, and won opportunities...\n');
    
    const tenantId = 'local-tenant-001';
    
    // Create 5 sample accounts
    const accounts = [
      { name: 'Acme Corporation', industry: 'Technology' },
      { name: 'Global Industries Inc', industry: 'Manufacturing' },
      { name: 'Tech Solutions Ltd', industry: 'Technology' },
      { name: 'Retail Innovations', industry: 'Retail' },
      { name: 'Healthcare Systems', industry: 'Healthcare' }
    ];
    
    const accountIds = [];
    
    for (const account of accounts) {
      const result = await pgPool.query(`
        INSERT INTO accounts (tenant_id, name, industry, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [tenantId, account.name, account.industry, '{}']);
      
      accountIds.push({ id: result.rows[0].id, name: account.name });
      console.log(`✓ Created account: ${account.name}`);
    }
    
    // Create contacts for some accounts
    const contacts = [
      { firstName: 'John', lastName: 'Smith', email: 'john@acme.com', accountId: accountIds[0].id },
      { firstName: 'Sarah', lastName: 'Johnson', email: 'sarah@global.com', accountId: accountIds[1].id },
      { firstName: 'Mike', lastName: 'Williams', email: 'mike@techsolutions.com', accountId: accountIds[2].id },
    ];
    
    const contactIds = [];
    
    for (const contact of contacts) {
      const result = await pgPool.query(`
        INSERT INTO contacts (tenant_id, first_name, last_name, email, account_id, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [tenantId, contact.firstName, contact.lastName, contact.email, contact.accountId, '{}']);
      
      contactIds.push({ id: result.rows[0].id, name: `${contact.firstName} ${contact.lastName}`, accountId: contact.accountId });
      console.log(`✓ Created contact: ${contact.firstName} ${contact.lastName}`);
    }
    
    console.log('\nCreating won opportunities...\n');
    
    // Create won opportunities with different attribution patterns
    const opportunities = [
      // Direct account attribution
      { name: 'Enterprise License Deal', accountId: accountIds[0].id, contactId: null, amount: 150000, stage: 'won' },
      { name: 'Cloud Migration Project', accountId: accountIds[0].id, contactId: null, amount: 85000, stage: 'won' },
      
      // Contact attribution (will roll up to account through contact.account_id)
      { name: 'Manufacturing System Upgrade', accountId: null, contactId: contactIds[1].id, amount: 220000, stage: 'won' },
      { name: 'Equipment Purchase', accountId: null, contactId: contactIds[1].id, amount: 95000, stage: 'won' },
      
      // Mix of both
      { name: 'Software Implementation', accountId: accountIds[2].id, contactId: contactIds[2].id, amount: 125000, stage: 'won' },
      { name: 'Support Contract', accountId: accountIds[2].id, contactId: null, amount: 45000, stage: 'won' },
      
      // Smaller accounts
      { name: 'Retail POS System', accountId: accountIds[3].id, contactId: null, amount: 78000, stage: 'won' },
      { name: 'Healthcare Software', accountId: accountIds[4].id, contactId: null, amount: 165000, stage: 'won' },
    ];
    
    for (const opp of opportunities) {
      await pgPool.query(`
        INSERT INTO opportunities (tenant_id, name, account_id, contact_id, amount, stage, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [tenantId, opp.name, opp.accountId, opp.contactId, opp.amount, opp.stage, '{}']);
      
      const attribution = opp.accountId ? 'Direct Account' : 'Via Contact';
      console.log(`✓ Created: ${opp.name} - $${opp.amount.toLocaleString()} (${attribution})`);
    }
    
    // Calculate and display results
    console.log('\n📊 Top Accounts by Won Deals:\n');
    
    const results = await pgPool.query(`
      WITH opportunity_attribution AS (
        SELECT 
          o.amount,
          COALESCE(o.account_id, c.account_id) as attributed_account_id
        FROM opportunities o
        LEFT JOIN contacts c ON o.contact_id = c.id
        WHERE o.tenant_id = $1 AND o.stage = 'won'
      )
      SELECT 
        a.name,
        a.industry,
        COUNT(*) as deal_count,
        SUM(oa.amount) as total_revenue
      FROM opportunity_attribution oa
      JOIN accounts a ON oa.attributed_account_id = a.id
      WHERE a.tenant_id = $1
      GROUP BY a.id, a.name, a.industry
      ORDER BY total_revenue DESC
      LIMIT 5
    `, [tenantId]);
    
    results.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.name} - $${parseFloat(row.total_revenue).toLocaleString()}`);
      console.log(`     ${row.deal_count} ${row.deal_count === 1 ? 'deal' : 'deals'} won • ${row.industry}`);
      console.log('');
    });
    
    await pgPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding won deals:', error);
    await pgPool.end();
    process.exit(1);
  }
}

seedWonDeals();
