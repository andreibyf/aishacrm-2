#!/usr/bin/env node
/**
 * Fix Orphaned Relationships Script
 * 
 * This script retroactively links orphaned notes, activities, and opportunities
 * to their related entities by analyzing metadata and other clues.
 * 
 * Usage:
 *   node scripts/fix-orphaned-relationships.js [--dry-run] [--tenant <uuid>]
 * 
 * Options:
 *   --dry-run    Show what would be fixed without making changes
 *   --tenant     Process only a specific tenant
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend folder
dotenv.config({ path: join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tenantIdx = args.indexOf('--tenant');
const tenantFilter = tenantIdx !== -1 ? args[tenantIdx + 1] : null;

console.log('='.repeat(60));
console.log('Fix Orphaned Relationships Script');
console.log('='.repeat(60));
console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will make changes)'}`);
if (tenantFilter) console.log(`Tenant filter: ${tenantFilter}`);
console.log('');

// Stats tracking
const stats = {
  notes: { checked: 0, fixed: 0, errors: 0 },
  activities: { checked: 0, fixed: 0, errors: 0 },
  opportunities: { checked: 0, fixed: 0, errors: 0 }
};

/**
 * Note: The note table uses 'related_type' and 'related_id' correctly.
 * No legacy 'related_to' field migration needed.
 * This function now just reports orphaned notes that could be linked via metadata clues.
 */
async function fixNotesMissingRelatedType() {
  console.log('\n--- Checking Notes for orphaned records ---');
  console.log('  (Note table correctly uses related_type/related_id columns)');
  // Skip - no related_to column in notes table
}

/**
 * Try to match orphaned notes to entities by content analysis
 */
async function matchOrphanedNotesToEntities() {
  console.log('\n--- Matching Orphaned Notes to Entities ---');
  
  let query = supabase
    .from('note')
    .select('id, tenant_id, title, content, metadata, created_at')
    .is('related_type', null)
    .is('related_id', null);
  
  if (tenantFilter) {
    query = query.eq('tenant_id', tenantFilter);
  }
  
  const { data: orphanedNotes, error } = await query.limit(100);
  
  if (error) {
    console.error('Error fetching orphaned notes:', error.message);
    return;
  }
  
  console.log(`Found ${orphanedNotes?.length || 0} orphaned notes (no related_type or related_id)`);
  
  for (const note of orphanedNotes || []) {
    stats.notes.checked++;
    
    // Check if metadata has clues (e.g., source_activity_id)
    if (note.metadata?.source_activity_id) {
      // Look up the source activity
      const { data: activity } = await supabase
        .from('activities')
        .select('related_to, related_id')
        .eq('id', note.metadata.source_activity_id)
        .single();
      
      if (activity?.related_to && activity?.related_id) {
        console.log(`  Note ${note.id}: Linking via source_activity → ${activity.related_to}:${activity.related_id}`);
        
        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('note')
            .update({ 
              related_type: activity.related_to, 
              related_id: activity.related_id 
            })
            .eq('id', note.id);
          
          if (updateError) {
            console.error(`    Error: ${updateError.message}`);
            stats.notes.errors++;
          } else {
            stats.notes.fixed++;
          }
        } else {
          stats.notes.fixed++;
        }
      }
    }
    
    // Additional matching strategies could be added here:
    // - Match by name/email mentioned in note content
    // - Match by timestamp proximity to entity creation
  }
}

/**
 * Fix activities with missing related_name/related_email (denormalization)
 */
async function fixActivitiesMissingDenormalizedFields() {
  console.log('\n--- Fixing Activities: Populating related_name/related_email ---');
  
  let query = supabase
    .from('activities')
    .select('id, tenant_id, related_to, related_id, related_name, related_email')
    .not('related_id', 'is', null)
    .is('related_name', null);
  
  if (tenantFilter) {
    query = query.eq('tenant_id', tenantFilter);
  }
  
  const { data: activities, error } = await query.limit(500);
  
  if (error) {
    console.error('Error fetching activities:', error.message);
    return;
  }
  
  console.log(`Found ${activities?.length || 0} activities with related_id but missing related_name`);
  
  for (const activity of activities || []) {
    stats.activities.checked++;
    
    if (!activity.related_to || !activity.related_id) continue;
    
    // Look up the related entity
    let tableName, nameField, emailField;
    switch (activity.related_to) {
      case 'lead':
        tableName = 'leads';
        nameField = ['first_name', 'last_name'];
        emailField = 'email';
        break;
      case 'contact':
        tableName = 'contacts';
        nameField = ['first_name', 'last_name'];
        emailField = 'email';
        break;
      case 'account':
        tableName = 'accounts';
        nameField = ['name'];
        emailField = 'email';
        break;
      case 'opportunity':
        tableName = 'opportunities';
        nameField = ['name'];
        emailField = null;
        break;
      default:
        continue;
    }
    
    const selectFields = [...nameField, emailField].filter(Boolean).join(', ');
    const { data: entity } = await supabase
      .from(tableName)
      .select(selectFields)
      .eq('id', activity.related_id)
      .single();
    
    if (entity) {
      const relatedName = nameField.length === 2 
        ? `${entity[nameField[0]] || ''} ${entity[nameField[1]] || ''}`.trim()
        : entity[nameField[0]] || '';
      const relatedEmail = emailField ? entity[emailField] : null;
      
      if (relatedName) {
        console.log(`  Activity ${activity.id}: Setting related_name = '${relatedName}'`);
        
        if (!dryRun) {
          const updateData = { related_name: relatedName };
          if (relatedEmail) updateData.related_email = relatedEmail;
          
          const { error: updateError } = await supabase
            .from('activities')
            .update(updateData)
            .eq('id', activity.id);
          
          if (updateError) {
            console.error(`    Error: ${updateError.message}`);
            stats.activities.errors++;
          } else {
            stats.activities.fixed++;
          }
        } else {
          stats.activities.fixed++;
        }
      }
    }
  }
}

/**
 * Fix opportunities with contact but missing contact_name (denormalization)
 */
async function fixOpportunitiesMissingContactName() {
  console.log('\n--- Fixing Opportunities: Populating contact_name ---');
  
  let query = supabase
    .from('opportunities')
    .select('id, tenant_id, contact_id, contact_name')
    .not('contact_id', 'is', null)
    .is('contact_name', null);
  
  if (tenantFilter) {
    query = query.eq('tenant_id', tenantFilter);
  }
  
  const { data: opportunities, error } = await query.limit(500);
  
  if (error) {
    console.error('Error fetching opportunities:', error.message);
    return;
  }
  
  console.log(`Found ${opportunities?.length || 0} opportunities with contact_id but missing contact_name`);
  
  for (const opp of opportunities || []) {
    stats.opportunities.checked++;
    
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, email')
      .eq('id', opp.contact_id)
      .single();
    
    if (contact) {
      const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
      
      if (contactName) {
        console.log(`  Opportunity ${opp.id}: Setting contact_name = '${contactName}'`);
        
        if (!dryRun) {
          const updateData = { contact_name: contactName };
          if (contact.email) updateData.contact_email = contact.email;
          
          const { error: updateError } = await supabase
            .from('opportunities')
            .update(updateData)
            .eq('id', opp.id);
          
          if (updateError) {
            console.error(`    Error: ${updateError.message}`);
            stats.opportunities.errors++;
          } else {
            stats.opportunities.fixed++;
          }
        } else {
          stats.opportunities.fixed++;
        }
      }
    }
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    // Run all fix functions
    await fixNotesMissingRelatedType();
    await matchOrphanedNotesToEntities();
    await fixActivitiesMissingDenormalizedFields();
    await fixOpportunitiesMissingContactName();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Notes:         ${stats.notes.checked} checked, ${stats.notes.fixed} ${dryRun ? 'would be' : ''} fixed, ${stats.notes.errors} errors`);
    console.log(`Activities:    ${stats.activities.checked} checked, ${stats.activities.fixed} ${dryRun ? 'would be' : ''} fixed, ${stats.activities.errors} errors`);
    console.log(`Opportunities: ${stats.opportunities.checked} checked, ${stats.opportunities.fixed} ${dryRun ? 'would be' : ''} fixed, ${stats.opportunities.errors} errors`);
    
    if (dryRun) {
      console.log('\nThis was a DRY RUN. Run without --dry-run to apply changes.');
    }
    
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
