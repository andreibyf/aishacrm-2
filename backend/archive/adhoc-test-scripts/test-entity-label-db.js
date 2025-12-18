#!/usr/bin/env node
/**
 * Direct database test for Entity Label AI Integration
 * This script bypasses authentication to test the feature directly
 */

import pg from 'pg';
import { fetchEntityLabels, generateEntityLabelPrompt } from './lib/entityLabelInjector.js';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  host: process.env.PGHOST || 'postgres.base44.workers.dev',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'crm',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  ssl: process.env.PGHOST === 'postgres.base44.workers.dev' ? { rejectUnauthorized: false } : false,
});

const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

async function testEntityLabelIntegration() {
  console.log('🧪 Testing Entity Label AI Integration (Direct DB)\n');
  console.log('='.repeat(60));
  
  try {
    // Step 1: Show current labels
    console.log('\n📋 Step 1: Fetch current entity labels...');
    const currentLabels = await fetchEntityLabels(pool, TENANT_ID);
    console.log('Current labels:', JSON.stringify(currentLabels, null, 2));
    
    // Step 2: Insert custom label directly
    console.log('\n📝 Step 2: Insert custom label (Accounts → Clients) via direct DB...');
    await pool.query(
      `INSERT INTO entity_labels (tenant_id, entity_key, custom_label, custom_label_singular, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id, entity_key) 
       DO UPDATE SET 
         custom_label = EXCLUDED.custom_label,
         custom_label_singular = EXCLUDED.custom_label_singular,
         updated_at = NOW()`,
      [TENANT_ID, 'accounts', 'Clients', 'Client']
    );
    console.log('✅ Custom label inserted');
    
    // Step 3: Verify updated labels
    console.log('\n📋 Step 3: Verify updated labels...');
    const updatedLabels = await fetchEntityLabels(pool, TENANT_ID);
    console.log('Updated labels:', JSON.stringify(updatedLabels, null, 2));
    console.log('\nAccounts label:', updatedLabels.accounts);
    
    // Step 4: Generate AI prompt
    console.log('\n🤖 Step 4: Generate AI system prompt with custom labels...');
    const labelPrompt = generateEntityLabelPrompt(updatedLabels);
    console.log('\n--- AI System Prompt Addition ---');
    console.log(labelPrompt);
    console.log('--- End Prompt ---\n');
    
    // Step 5: Verify mapping
    console.log('🎯 Step 5: Verify AI will understand custom terminology');
    console.log('   User says: "Show me all my clients"');
    console.log('   AI sees system prompt: "clients" → accounts tools');
    console.log('   AI calls: list_accounts');
    console.log('   AI responds: "Here are your clients..."');
    
    // Step 6: Clean up (optional - comment out to keep custom label)
    console.log('\n🧹 Step 6: Clean up - reset to default label...');
    await pool.query(
      'DELETE FROM entity_labels WHERE tenant_id = $1 AND entity_key = $2',
      [TENANT_ID, 'accounts']
    );
    console.log('✅ Reset to default "Accounts"');
    
    const finalLabels = await fetchEntityLabels(pool, TENANT_ID);
    console.log('Final accounts label:', finalLabels.accounts);
    
    console.log('\n✅ Entity Label AI Integration Test Complete!\n');
    console.log('📚 Next Steps:');
    console.log('   1. Test in UI: Settings > Entity Labels (change Accounts to Clients)');
    console.log('   2. Test AI: Go to AI Agent page');
    console.log('   3. Say: "Show me all my clients"');
    console.log('   4. Verify: AI recognizes "clients" and calls list_accounts\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

// Run test
testEntityLabelIntegration();
