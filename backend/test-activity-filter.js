#!/usr/bin/env node

/**
 * Test the activity filter fix
 */

import dotenv from 'dotenv';
dotenv.config();

const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';

async function testActivityFilter() {
  try {
    console.log('\n=== Testing Activity Filter Fix ===\n');

    // Get the Regression Test lead ID
    const leadResponse = await fetch(
      `${BACKEND_URL}/api/leads?tenant_id=labor-depot&first_name=Regression`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const leadData = await leadResponse.json();
    
    if (!leadData.data?.leads || leadData.data.leads.length === 0) {
      console.log('No Regression Test lead found');
      return;
    }

    const lead = leadData.data.leads[0];
    console.log(`Found lead: ${lead.first_name} ${lead.last_name} (ID: ${lead.id})`);

    // Test 1: Get activities WITHOUT filters (should return ALL activities for tenant)
    const allActivitiesResponse = await fetch(
      `${BACKEND_URL}/api/activities?tenant_id=labor-depot`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const allActivitiesData = await allActivitiesResponse.json();
    console.log(`\nAll activities for tenant: ${allActivitiesData.data?.activities?.length || 0}`);
    
    if (allActivitiesData.data?.activities?.length > 0) {
      console.log('\nSample activities:');
      allActivitiesData.data.activities.slice(0, 3).forEach(a => {
        console.log(`  - ${a.subject} (related_to: ${a.related_to}, related_id: ${a.related_id?.slice(0, 8)}...)`);
      });
    }

    // Test 2: Get activities WITH related_to and related_id filters
    const filteredActivitiesResponse = await fetch(
      `${BACKEND_URL}/api/activities?tenant_id=labor-depot&related_to=lead&related_id=${lead.id}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const filteredActivitiesData = await filteredActivitiesResponse.json();
    console.log(`\nFiltered activities for lead ${lead.id}: ${filteredActivitiesData.data?.activities?.length || 0}`);

    if (filteredActivitiesData.data?.activities?.length > 0) {
      console.log('\nFiltered activities:');
      filteredActivitiesData.data.activities.forEach(a => {
        console.log(`  - ${a.subject} (related_to: ${a.related_to}, related_id: ${a.related_id?.slice(0, 8)}...)`);
      });
    } else {
      console.log('✅ SUCCESS: No activities returned for this lead (as expected)');
    }

    // Test 3: Get activities for an opportunity
    const oppActivitiesResponse = await fetch(
      `${BACKEND_URL}/api/activities?tenant_id=labor-depot&related_to=opportunity`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const oppActivitiesData = await oppActivitiesResponse.json();
    console.log(`\nActivities linked to opportunities: ${oppActivitiesData.data?.activities?.length || 0}`);
    
    if (oppActivitiesData.data?.activities?.length > 0) {
      console.log('\nSample opportunity activities:');
      oppActivitiesData.data.activities.slice(0, 3).forEach(a => {
        console.log(`  - ${a.subject} (related_name: ${a.related_name})`);
      });
    }

    console.log('\n=== Test Complete ===\n');

  } catch (error) {
    console.error('Error testing activity filter:', error.message);
  }
}

// Wait a moment for the backend to restart
setTimeout(testActivityFilter, 3000);
