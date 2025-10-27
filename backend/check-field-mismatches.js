/**
 * Check for field mismatches between frontend and backend
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n=== Checking Backend PUT/POST Endpoints for Field Handling ===\n');

// Read the users.js route file
const usersRouteFile = path.join(__dirname, 'routes', 'users.js');
const usersContent = fs.readFileSync(usersRouteFile, 'utf8');

// Check PUT /api/users/:id
console.log('PUT /api/users/:id:');
const putMatch = usersContent.match(/router\.put\('\/:id'[\s\S]*?}\s*\);/);
if (putMatch) {
  const putBlock = putMatch[0];
  
  // Extract destructured fields from req.body
  const destructureMatch = putBlock.match(/const\s*\{([^}]+)\}\s*=\s*req\.body/);
  if (destructureMatch) {
    const fields = destructureMatch[1]
      .split(',')
      .map(f => f.trim())
      .filter(f => f && !f.includes('//'));
    
    console.log('  Fields extracted from req.body:');
    fields.forEach(f => console.log(`    - ${f}`));
  }
  
  // Check if metadata merging is happening
  if (putBlock.includes('currentMetadata') || putBlock.includes('updatedMetadata')) {
    console.log('  ✓ Metadata merging logic detected');
  } else {
    console.log('  ✗ No metadata merging detected');
  }
  
  // Check if expandUserMetadata is used
  if (putBlock.includes('expandUserMetadata')) {
    console.log('  ✓ Response uses expandUserMetadata');
  } else {
    console.log('  ✗ Response does not expand metadata');
  }
}

console.log('\n=== Checking Frontend User.update() Calls ===\n');

// Check common update patterns in frontend
const frontendPatterns = [
  {
    file: 'src/components/settings/EnhancedUserManagement.jsx',
    name: 'EnhancedUserManagement'
  },
  {
    file: 'src/components/settings/UserPermissions.jsx',
    name: 'UserPermissions'
  },
  {
    file: 'src/components/settings/NavigationPermissions.jsx',
    name: 'NavigationPermissions'
  },
  {
    file: 'src/components/settings/UserDetailPanel.jsx',
    name: 'UserDetailPanel'
  }
];

frontendPatterns.forEach(({ file, name }) => {
  const fullPath = path.join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Find User.update calls
    const updateCalls = content.match(/User\.update\([^)]+,\s*\{[\s\S]*?\}\s*\)/g);
    if (updateCalls && updateCalls.length > 0) {
      console.log(`${name}:`);
      updateCalls.forEach((call, idx) => {
        // Extract the object being passed
        const objMatch = call.match(/\{[\s\S]*\}/);
        if (objMatch) {
          const obj = objMatch[0];
          // Extract top-level keys
          const keys = [...obj.matchAll(/(\w+):/g)].map(m => m[1]);
          console.log(`  Call ${idx + 1} fields: ${keys.join(', ')}`);
        }
      });
    }
  }
});

console.log('\n=== Summary ===\n');
console.log('The backend PUT endpoint should handle ALL fields that the frontend sends.');
console.log('Fields should be merged into metadata JSONB column for persistence.');
console.log('GET endpoints should expand metadata back to top-level fields.');
console.log();
