#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false
});

const TENANT_ID = 'local-tenant-001';

async function seedTestData() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Seeding test data for tenant:', TENANT_ID);
    
    // Get the tenant UUID
    const tenantResult = await client.query(
      'SELECT id FROM tenant WHERE tenant_id = $1',
      [TENANT_ID]
    );
    
    if (tenantResult.rows.length === 0) {
      console.error('❌ Tenant not found! Run seed-test-tenant.js first');
      process.exit(1);
    }
    
    const tenantUUID = tenantResult.rows[0].id;
    console.log('✅ Found tenant UUID:', tenantUUID);
    
    // Seed Contacts
    console.log('\n📇 Creating test contacts...');
    const contacts = [
      {
        first_name: 'John',
        last_name: 'Smith',
        email: 'john.smith@example.com',
        phone: '+1-555-0101',
        metadata: { company: 'Acme Corp', title: 'CEO' }
      },
      {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane.doe@techco.com',
        phone: '+1-555-0102',
        metadata: { company: 'TechCo Inc', title: 'CTO' }
      },
      {
        first_name: 'Bob',
        last_name: 'Wilson',
        email: 'bob.wilson@innovate.io',
        phone: '+1-555-0103',
        metadata: { company: 'Innovate Solutions', title: 'VP Sales' }
      }
    ];
    
    const contactIds = [];
    for (const contact of contacts) {
      const result = await client.query(
        `INSERT INTO contacts 
        (tenant_id, first_name, last_name, email, phone, metadata, status, created_date) 
        VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW()) 
        RETURNING id`,
        [TENANT_ID, contact.first_name, contact.last_name, contact.email, contact.phone, JSON.stringify(contact.metadata)]
      );
      contactIds.push(result.rows[0].id);
      console.log(`  ✅ Created contact: ${contact.first_name} ${contact.last_name}`);
    }
    
    // Seed Leads
    console.log('\n🎯 Creating test leads...');
    const leads = [
      {
        first_name: 'Sarah',
        last_name: 'Johnson',
        email: 'sarah.johnson@newcompany.com',
        phone: '+1-555-0201',
        company: 'New Company LLC',
        status: 'new',
        source: 'website',
        metadata: { title: 'Director', score: 75 }
      },
      {
        first_name: 'Mike',
        last_name: 'Brown',
        email: 'mike.brown@startup.io',
        phone: '+1-555-0202',
        company: 'Startup.io',
        status: 'qualified',
        source: 'referral',
        metadata: { title: 'Founder', score: 85 }
      },
      {
        first_name: 'Emily',
        last_name: 'Davis',
        email: 'emily.davis@enterprise.com',
        phone: '+1-555-0203',
        company: 'Enterprise Corp',
        status: 'contacted',
        source: 'cold_call',
        metadata: { title: 'Manager', score: 60 }
      }
    ];
    
    const leadIds = [];
    for (const lead of leads) {
      const result = await client.query(
        `INSERT INTO leads 
        (tenant_id, first_name, last_name, email, phone, company, status, source, metadata, created_date) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) 
        RETURNING id`,
        [TENANT_ID, lead.first_name, lead.last_name, lead.email, lead.phone, lead.company, lead.status, lead.source, JSON.stringify(lead.metadata)]
      );
      leadIds.push(result.rows[0].id);
      console.log(`  ✅ Created lead: ${lead.first_name} ${lead.last_name} (${lead.status})`);
    }
    
    // Seed Accounts
    console.log('\n🏢 Creating test accounts...');
    const accounts = [
      {
        name: 'Acme Corp',
        industry: 'Technology',
        website: 'https://acme-corp.example.com',
        type: 'customer',
        metadata: { phone: '+1-555-1000' }
      },
      {
        name: 'TechCo Inc',
        industry: 'Software',
        website: 'https://techco.example.com',
        type: 'prospect',
        metadata: { phone: '+1-555-2000' }
      }
    ];
    
    const accountIds = [];
    for (const account of accounts) {
      const result = await client.query(
        `INSERT INTO accounts 
        (tenant_id, name, industry, website, type, metadata, created_date) 
        VALUES ($1, $2, $3, $4, $5, $6, NOW()) 
        RETURNING id`,
        [TENANT_ID, account.name, account.industry, account.website, account.type, JSON.stringify(account.metadata)]
      );
      accountIds.push(result.rows[0].id);
      console.log(`  ✅ Created account: ${account.name}`);
    }
    
    // Seed Opportunities
    console.log('\n💰 Creating test opportunities...');
    const opportunities = [
      {
        name: 'Acme Corp - Enterprise License',
        stage: 'proposal',
        amount: 50000,
        probability: 75,
        close_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
        account_id: accountIds[0]
      },
      {
        name: 'TechCo - Annual Subscription',
        stage: 'negotiation',
        amount: 25000,
        probability: 60,
        close_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 45 days from now
        account_id: accountIds[1]
      },
      {
        name: 'Innovate Solutions - Consulting',
        stage: 'qualification',
        amount: 15000,
        probability: 40,
        close_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 60 days from now
        account_id: null
      }
    ];
    
    for (const opp of opportunities) {
      await client.query(
        `INSERT INTO opportunities 
        (tenant_id, name, stage, amount, probability, close_date, account_id, created_date) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [TENANT_ID, opp.name, opp.stage, opp.amount, opp.probability, opp.close_date, opp.account_id]
      );
      console.log(`  ✅ Created opportunity: ${opp.name} ($${opp.amount.toLocaleString()})`);
    }
    
    // Seed Activities
    console.log('\n📝 Creating test activities...');
    const activities = [
      {
        subject: 'Initial call with John Smith',
        type: 'call',
        body: 'Discussed product requirements and timeline',
        related_id: contactIds[0]
      },
      {
        subject: 'Demo scheduled with Jane Doe',
        type: 'meeting',
        body: 'Product demo for TechCo team',
        related_id: contactIds[1]
      },
      {
        subject: 'Follow-up email to Bob Wilson',
        type: 'email',
        body: 'Sent proposal and pricing information',
        related_id: contactIds[2]
      }
    ];
    
    for (const activity of activities) {
      await client.query(
        `INSERT INTO activities 
        (tenant_id, subject, type, body, related_id, created_at) 
        VALUES ($1, $2, $3, $4, $5, NOW())`,
        [TENANT_ID, activity.subject, activity.type, activity.body, activity.related_id]
      );
      console.log(`  ✅ Created activity: ${activity.subject}`);
    }
    
    console.log('\n✨ Test data seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`  - ${contacts.length} contacts`);
    console.log(`  - ${leads.length} leads`);
    console.log(`  - ${accounts.length} accounts`);
    console.log(`  - ${opportunities.length} opportunities`);
    console.log(`  - ${activities.length} activities`);
    console.log(`\n💡 Tenant: ${TENANT_ID} (UUID: ${tenantUUID})`);
    
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedTestData().catch(console.error);
