#!/usr/bin/env node

/**
 * Debug script to check activity linkages and find mismatched related_ids
 * 
 * Run: node backend/debug-activity-links.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function debugActivityLinks() {
  try {
    console.log('\n=== Checking Activity Links ===\n');

    // Check for activities that reference non-existent entities
    const orphanedActivitiesQuery = `
      SELECT 
        a.id as activity_id,
        a.subject,
        a.related_id,
        a.metadata->>'related_to' as related_to,
        a.metadata->>'related_name' as related_name,
        a.tenant_id,
        a.created_at
      FROM activities a
      WHERE a.related_id IS NOT NULL
        AND a.metadata->>'related_to' = 'opportunity'
        AND NOT EXISTS (
          SELECT 1 FROM opportunities o WHERE o.id = a.related_id
        )
      ORDER BY a.created_at DESC
      LIMIT 20;
    `;

    const orphanedResult = await pool.query(orphanedActivitiesQuery);
    console.log(`\nOrphaned Activities (linked to non-existent opportunities): ${orphanedResult.rows.length}`);
    if (orphanedResult.rows.length > 0) {
      console.table(orphanedResult.rows.map(r => ({
        subject: r.subject?.substring(0, 50),
        related_id: r.related_id,
        related_to: r.related_to,
        created: r.created_at?.toISOString().split('T')[0]
      })));
    }

    // Check for ID collisions between leads and opportunities
    const collisionQuery = `
      SELECT 
        l.id,
        'Lead: ' || l.first_name || ' ' || l.last_name as lead_name,
        'Opportunity: ' || o.name as opp_name,
        l.tenant_id as lead_tenant,
        o.tenant_id as opp_tenant
      FROM leads l
      INNER JOIN opportunities o ON l.id = o.id
      LIMIT 10;
    `;

    const collisionResult = await pool.query(collisionQuery);
    console.log(`\nID Collisions between Leads and Opportunities: ${collisionResult.rows.length}`);
    if (collisionResult.rows.length > 0) {
      console.table(collisionResult.rows);
      console.log('\n⚠️  WARNING: Found UUID collisions! This should not happen.\n');
    }

    // Show recent activities with their links
    const recentActivitiesQuery = `
      SELECT 
        a.id as activity_id,
        a.subject,
        a.related_id,
        a.metadata->>'related_to' as related_to,
        a.metadata->>'related_name' as related_name,
        CASE 
          WHEN a.metadata->>'related_to' = 'lead' THEN (SELECT first_name || ' ' || last_name FROM leads WHERE id = a.related_id LIMIT 1)
          WHEN a.metadata->>'related_to' = 'opportunity' THEN (SELECT name FROM opportunities WHERE id = a.related_id LIMIT 1)
          WHEN a.metadata->>'related_to' = 'account' THEN (SELECT name FROM accounts WHERE id = a.related_id LIMIT 1)
          ELSE 'Unknown'
        END as actual_entity_name,
        a.created_at
      FROM activities a
      WHERE a.related_id IS NOT NULL
      ORDER BY a.created_at DESC
      LIMIT 15;
    `;

    const recentResult = await pool.query(recentActivitiesQuery);
    console.log(`\nRecent Activities (last 15):`);
    console.table(recentResult.rows.map(r => ({
      subject: r.subject?.substring(0, 40),
      related_to: r.related_to,
      stored_name: r.related_name?.substring(0, 30),
      actual_name: r.actual_entity_name?.substring(0, 30),
      match: r.related_name === r.actual_entity_name ? '✓' : '✗',
      created: r.created_at?.toISOString().split('T')[0]
    })));

    // Check for activities from BizDev Sources
    const bizdevActivitiesQuery = `
      SELECT 
        a.id as activity_id,
        a.subject,
        a.related_id,
        a.metadata->>'related_to' as related_to,
        a.metadata->>'related_name' as related_name,
        o.name as opportunity_name,
        o.metadata->'origin_bizdev_source_company' as bizdev_company,
        a.created_at
      FROM activities a
      LEFT JOIN opportunities o ON a.related_id = o.id AND a.metadata->>'related_to' = 'opportunity'
      WHERE a.subject ILIKE '%Initial contact:%'
      ORDER BY a.created_at DESC
      LIMIT 10;
    `;

    const bizdevResult = await pool.query(bizdevActivitiesQuery);
    console.log(`\nActivities from BizDev Sources (last 10):`);
    if (bizdevResult.rows.length > 0) {
      console.table(bizdevResult.rows.map(r => ({
        subject: r.subject?.substring(0, 40),
        related_name: r.related_name?.substring(0, 30),
        actual_opp_name: r.opportunity_name?.substring(0, 30),
        bizdev_company: r.bizdev_company,
        created: r.created_at?.toISOString().split('T')[0]
      })));
    } else {
      console.log('No BizDev source activities found.');
    }

    console.log('\n=== Debug Complete ===\n');

  } catch (error) {
    console.error('Error debugging activity links:', error);
  } finally {
    await pool.end();
  }
}

debugActivityLinks();
