#!/usr/bin/env node
/**
 * Apply metadata merge pattern to all routes with metadata columns
 * Routes to update: leads, activities, opportunities, notifications, system-logs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROUTES_TO_UPDATE = [
  'leads',
  'activities',
  'opportunities',
  'notifications',
  'system-logs'
];

const EXPAND_FUNCTION = `
  // Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata,
      metadata,
    };
  };
`.trim();

console.log('Updating routes with metadata merge pattern...\n');

ROUTES_TO_UPDATE.forEach(routeName => {
  const filePath = path.join(__dirname, 'routes', `${routeName}.js`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${routeName}.js not found`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if already has expandMetadata
  if (content.includes('expandMetadata')) {
    console.log(`⏭️  ${routeName}.js already has expandMetadata`);
    return;
  }
  
  // Add expandMetadata function after router declaration
  const routerMatch = content.match(/(const router = express\.Router\(\);)/);
  if (routerMatch) {
    content = content.replace(
      routerMatch[0],
      `${routerMatch[0]}\n\n${EXPAND_FUNCTION}`
    );
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${routeName}.js - Added expandMetadata helper`);
  } else {
    console.log(`❌ ${routeName}.js - Could not find router declaration`);
  }
});

console.log('\n✨ Done! Now manually update GET and PUT routes to use expandMetadata.');
console.log('   - GET lists: result.rows.map(expandMetadata)');
console.log('   - GET single: expandMetadata(result.rows[0])');
console.log('   - PUT: Merge metadata, then expandMetadata(result.rows[0])');
