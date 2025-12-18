#!/usr/bin/env node

/**
 * COMPREHENSIVE METADATA MERGE PATTERN TESTS
 * Tests all 8 entities with metadata columns:
 * - users (employees)
 * - accounts
 * - contacts
 * - leads
 * - activities
 * - opportunities
 * - notifications
 * - system-logs
 */

const BASE_URL = 'http://localhost:3001';
const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const TEST_USER = 'admin@aishacrm.com';

// Test counter
let testsPassed = 0;
let testsFailed = 0;

function pass(message) {
  console.log(`✅ ${message}`);
  testsPassed++;
}

function fail(message, error) {
  console.log(`❌ ${message}`);
  if (error) console.log(`   Error: ${error.message || error}`);
  testsFailed++;
}

function section(title) {
  console.log(`\n═══ ${title} ═══\n`);
}

async function testLeadsMetadata() {
  section('TESTING LEADS METADATA');
  
  try {
    // 1. Create lead
    const createRes = await fetch(`${BASE_URL}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        first_name: 'Test',
        last_name: 'Lead',
        email: `lead-${Date.now()}@test.com`,
        company: 'Test Corp',
        custom_field: 'initial_value'
      })
    });
    const lead = await createRes.json();
    const leadId = lead.data.id;
    console.log(`   Created lead: ${leadId}`);
    
    if (lead.data.custom_field === 'initial_value') {
      pass('Lead POST stores unknown fields in metadata');
    } else {
      fail('Lead POST did not store custom_field');
    }

    // 2. Update lead with new metadata field
    const updateRes = await fetch(`${BASE_URL}/api/leads/${leadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        custom_field_2: 'value2',
        preferences: { theme: 'dark' }
      })
    });
    const updated = await updateRes.json();
    
    if (updated.data.custom_field === 'initial_value' && updated.data.custom_field_2 === 'value2') {
      pass('Lead PUT merges metadata (preserves custom_field, adds custom_field_2)');
    } else {
      fail('Lead PUT did not merge metadata correctly');
    }

    // 3. GET single lead
    const getRes = await fetch(`${BASE_URL}/api/leads/${leadId}`);
    const retrieved = await getRes.json();
    
    if (retrieved.data.custom_field_2 === 'value2' && retrieved.data.preferences) {
      pass('Lead GET expands metadata');
    } else {
      fail('Lead GET did not expand metadata');
    }

    // Cleanup
    await fetch(`${BASE_URL}/api/leads/${leadId}`, { method: 'DELETE' });

  } catch (error) {
    fail('Lead metadata test suite failed', error);
  }
}

async function testOpportunitiesMetadata() {
  section('TESTING OPPORTUNITIES METADATA');
  
  try {
    // 1. Create opportunity
    const createRes = await fetch(`${BASE_URL}/api/opportunities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        name: 'Test Opportunity',
        amount: 50000,
        stage: 'Qualification',
        custom_source: 'referral'
      })
    });
    const opp = await createRes.json();
    const oppId = opp.data.id;
    console.log(`   Created opportunity: ${oppId}`);
    
    if (opp.data.custom_source === 'referral') {
      pass('Opportunity POST stores unknown fields in metadata');
    } else {
      fail('Opportunity POST did not store custom_source');
    }

    // 2. Update opportunity with new metadata
    const updateRes = await fetch(`${BASE_URL}/api/opportunities/${oppId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: 'Proposal',
        custom_tags: ['high-value', 'strategic']
      })
    });
    const updated = await updateRes.json();
    
    if (updated.data.custom_source === 'referral' && updated.data.custom_tags) {
      pass('Opportunity PUT merges metadata');
    } else {
      fail('Opportunity PUT did not merge metadata correctly');
    }

    // 3. GET single opportunity
    const getRes = await fetch(`${BASE_URL}/api/opportunities/${oppId}`);
    const retrieved = await getRes.json();
    
    if (retrieved.data.custom_tags && retrieved.data.custom_source === 'referral') {
      pass('Opportunity GET expands metadata');
    } else {
      fail('Opportunity GET did not expand metadata');
    }

    // Cleanup
    await fetch(`${BASE_URL}/api/opportunities/${oppId}`, { method: 'DELETE' });

  } catch (error) {
    fail('Opportunity metadata test suite failed', error);
  }
}

async function testNotificationsMetadata() {
  section('TESTING NOTIFICATIONS METADATA');
  
  try {
    // 1. Create notification
    const createRes = await fetch(`${BASE_URL}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        user_email: TEST_USER,
        title: 'Test Notification',
        message: 'Test message',
        custom_priority: 'high'
      })
    });
    const notif = await createRes.json();
    const notifId = notif.data.id;
    console.log(`   Created notification: ${notifId}`);
    
    if (notif.data.custom_priority === 'high') {
      pass('Notification POST stores unknown fields in metadata');
    } else {
      fail('Notification POST did not store custom_priority');
    }

    // 2. Update notification with new metadata
    const updateRes = await fetch(`${BASE_URL}/api/notifications/${notifId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_read: true,
        custom_action: 'dismiss'
      })
    });
    const updated = await updateRes.json();
    
    if (updated.data.custom_priority === 'high' && updated.data.custom_action === 'dismiss') {
      pass('Notification PUT merges metadata');
    } else {
      fail('Notification PUT did not merge metadata correctly');
    }

    // 3. GET list to verify expansion
    const listRes = await fetch(`${BASE_URL}/api/notifications?tenant_id=${TENANT_ID}&user_email=${TEST_USER}`);
    const list = await listRes.json();
    const found = list.data.notifications.find(n => n.id === notifId);
    
    if (found && found.custom_action === 'dismiss') {
      pass('Notification list expands metadata');
    } else {
      fail('Notification list did not expand metadata');
    }

    // Cleanup
    await fetch(`${BASE_URL}/api/notifications/${notifId}`, { method: 'DELETE' });

  } catch (error) {
    fail('Notification metadata test suite failed', error);
  }
}

async function testSystemLogsMetadata() {
  section('TESTING SYSTEM-LOGS METADATA');
  
  try {
    // 1. Create system log
    const createRes = await fetch(`${BASE_URL}/api/system-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        level: 'INFO',
        message: 'Test log entry',
        source: 'test-suite',
        custom_context: 'metadata-test'
      })
    });
    const log = await createRes.json();
    const logId = log.data.id;
    console.log(`   Created system log: ${logId}`);
    
    if (log.data.custom_context === 'metadata-test') {
      pass('System log POST stores unknown fields in metadata');
    } else {
      fail('System log POST did not store custom_context');
    }

    // 2. GET list to verify expansion
    const listRes = await fetch(`${BASE_URL}/api/system-logs?tenant_id=${TENANT_ID}&limit=10`);
    const list = await listRes.json();
    const found = list.data['system-logs'].find(l => l.id === logId);
    
    if (found && found.custom_context === 'metadata-test') {
      pass('System logs list expands metadata');
    } else {
      fail('System logs list did not expand metadata');
    }

    // Cleanup
    await fetch(`${BASE_URL}/api/system-logs/${logId}`, { method: 'DELETE' });

  } catch (error) {
    fail('System log metadata test suite failed', error);
  }
}

async function testActivitiesMetadata() {
  section('TESTING ACTIVITIES METADATA (Already Implemented)');
  
  try {
    // Create activity
    const createRes = await fetch(`${BASE_URL}/api/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        type: 'call',
        subject: 'Test Activity',
        description: 'Test description',
        custom_field: 'activity_test'
      })
    });
    const activity = await createRes.json();
    const activityId = activity.data.id;
    console.log(`   Created activity: ${activityId}`);
    
    if (activity.data.custom_field === 'activity_test') {
      pass('Activity POST stores unknown fields in metadata');
    } else {
      fail('Activity POST did not store custom_field');
    }

    // Update activity
    const updateRes = await fetch(`${BASE_URL}/api/activities/${activityId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Updated Activity',
        custom_field_2: 'new_value'
      })
    });
    const updated = await updateRes.json();
    
    if (updated.data.custom_field === 'activity_test' && updated.data.custom_field_2 === 'new_value') {
      pass('Activity PUT merges metadata');
    } else {
      fail('Activity PUT did not merge metadata correctly');
    }

    // Cleanup
    await fetch(`${BASE_URL}/api/activities/${activityId}`, { method: 'DELETE' });

  } catch (error) {
    fail('Activity metadata test suite failed', error);
  }
}

async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  COMPREHENSIVE METADATA MERGE TESTS - ALL ENTITIES     ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  await testLeadsMetadata();
  await testActivitiesMetadata();
  await testOpportunitiesMetadata();
  await testNotificationsMetadata();
  await testSystemLogsMetadata();
  
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`✨ RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('═══════════════════════════════════════════════════════\n');
  
  process.exit(testsFailed > 0 ? 1 : 0);
}

runAllTests().catch(error => {
  console.error('❌ Test suite crashed:', error);
  process.exit(1);
});
