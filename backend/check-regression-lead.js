#!/usr/bin/env node

/**
 * Check the Regression Test lead and its activities
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkRegressionLead() {
  try {
    // Find the Regression Test lead
    const leadQuery = `
      SELECT id, first_name, last_name, email, tenant_id, created_at
      FROM leads 
      WHERE first_name ILIKE '%regression%' OR last_name ILIKE '%regression%' OR email ILIKE '%regression%'
      ORDER BY created_at DESC
      LIMIT 5;
    `;
    
    const leadResult = await pool.query(leadQuery);
    console.log('\nLeads matching "Regression":');
    console.table(leadResult.rows);

    if (leadResult.rows.length === 0) {
      console.log('No leads found matching "Regression"');
      return;
    }

    const leadId = leadResult.rows[0].id;
    console.log(`\nChecking activities for lead ID: ${leadId}`);

    // Check activities linked to this lead
    const activityQuery = `
      SELECT 
        a.id,
        a.subject,
        a.related_id,
        a.metadata->>'related_to' as related_to,
        a.metadata->>'related_name' as related_name,
        a.created_at
      FROM activities a
      WHERE a.related_id = $1
      ORDER BY a.created_at DESC;
    `;

    const activityResult = await pool.query(activityQuery, [leadId]);
    console.log(`\nActivities with related_id = ${leadId}: ${activityResult.rows.length}`);
    if (activityResult.rows.length > 0) {
      console.table(activityResult.rows);
    }

    // Also check if there are opportunities with the same ID (collision check)
    const oppQuery = `
      SELECT id, name, stage, tenant_id
      FROM opportunities
      WHERE id = $1;
    `;

    const oppResult = await pool.query(oppQuery, [leadId]);
    if (oppResult.rows.length > 0) {
      console.log('\n⚠️  WARNING: Found opportunity with same ID as lead!');
      console.table(oppResult.rows);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkRegressionLead();
