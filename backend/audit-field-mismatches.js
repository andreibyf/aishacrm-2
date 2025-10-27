/**
 * Comprehensive Field Mismatch Audit
 * Checks all backend routes for metadata handling patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routesDir = path.join(__dirname, 'routes');
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  COMPREHENSIVE BACKEND FIELD MISMATCH AUDIT                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const results = [];

routeFiles.forEach(file => {
  const filepath = path.join(routesDir, file);
  const content = fs.readFileSync(filepath, 'utf8');
  const routeName = file.replace('.js', '');
  
  const analysis = {
    route: routeName,
    hasPutEndpoint: false,
    hasPostEndpoint: false,
    hasMetadataColumn: false,
    hasMetadataMerging: false,
    hasExpandFunction: false,
    extractedFields: [],
    issues: []
  };
  
  // Check for PUT endpoint
  if (content.includes("router.put('/:id'") || content.includes('router.put("/:id"')) {
    analysis.hasPutEndpoint = true;
    
    // Extract fields from req.body destructuring
    const putMatch = content.match(/router\.put\(['"]:\/id['"][\s\S]*?}\s*\);/);
    if (putMatch) {
      const putBlock = putMatch[0];
      const destructureMatch = putBlock.match(/const\s*\{([^}]+)\}\s*=\s*req\.body/);
      if (destructureMatch) {
        analysis.extractedFields = destructureMatch[1]
          .split(',')
          .map(f => f.trim())
          .filter(f => f && !f.includes('//') && !f.includes('/*'));
      }
      
      // Check for metadata handling
      if (putBlock.includes('metadata')) {
        analysis.hasMetadataColumn = true;
      }
      
      if (putBlock.includes('currentMetadata') || putBlock.includes('updatedMetadata') || putBlock.includes('...metadata')) {
        analysis.hasMetadataMerging = true;
      }
    }
  }
  
  // Check for POST endpoint
  if (content.includes("router.post('/'") || content.includes('router.post("/"')) {
    analysis.hasPostEndpoint = true;
  }
  
  // Check for expandMetadata helper function
  if (content.includes('expandMetadata') || content.includes('expandUserMetadata')) {
    analysis.hasExpandFunction = true;
  }
  
  // Identify potential issues
  if (analysis.hasPutEndpoint && analysis.hasMetadataColumn && !analysis.hasMetadataMerging) {
    analysis.issues.push('⚠️  PUT endpoint has metadata field but NO merging logic - fields may be lost!');
  }
  
  if (analysis.hasPutEndpoint && analysis.hasMetadataColumn && !analysis.hasExpandFunction) {
    analysis.issues.push('⚠️  Has metadata but NO expand function - frontend may not receive fields!');
  }
  
  if (analysis.hasPutEndpoint && analysis.extractedFields.length > 0 && !analysis.extractedFields.includes('metadata')) {
    // Check if any extracted fields might need to go into metadata
    const commonMetadataFields = ['tags', 'permissions', 'settings', 'preferences', 'navigation_permissions', 'display_name'];
    const hasMetadataFields = analysis.extractedFields.some(f => 
      commonMetadataFields.some(mf => f.toLowerCase().includes(mf))
    );
    if (hasMetadataFields) {
      analysis.issues.push('⚠️  Extracting metadata-like fields but no metadata column handling');
    }
  }
  
  results.push(analysis);
});

// Display results
console.log('ROUTES WITH PUT ENDPOINTS:\n');
const routesWithPut = results.filter(r => r.hasPutEndpoint);

routesWithPut.forEach(r => {
  const statusIcon = r.issues.length === 0 ? '✅' : '❌';
  console.log(`${statusIcon} ${r.route.toUpperCase()}`);
  
  if (r.extractedFields.length > 0) {
    console.log(`   Fields: ${r.extractedFields.slice(0, 5).join(', ')}${r.extractedFields.length > 5 ? '...' : ''}`);
  }
  
  console.log(`   Metadata column: ${r.hasMetadataColumn ? '✓' : '✗'}`);
  console.log(`   Metadata merging: ${r.hasMetadataMerging ? '✓' : '✗'}`);
  console.log(`   Expand function: ${r.hasExpandFunction ? '✓' : '✗'}`);
  
  if (r.issues.length > 0) {
    r.issues.forEach(issue => console.log(`   ${issue}`));
  }
  console.log();
});

// Summary
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('SUMMARY:\n');
console.log(`Total routes: ${routeFiles.length}`);
console.log(`Routes with PUT: ${routesWithPut.length}`);
console.log(`Routes with issues: ${results.filter(r => r.issues.length > 0).length}`);
console.log(`Routes properly handling metadata: ${results.filter(r => r.hasPutEndpoint && r.hasMetadataMerging && r.hasExpandFunction).length}`);

const problematicRoutes = results.filter(r => r.issues.length > 0);
if (problematicRoutes.length > 0) {
  console.log('\n⚠️  ROUTES NEEDING ATTENTION:\n');
  problematicRoutes.forEach(r => {
    console.log(`   • ${r.route}`);
  });
}

console.log('\n═══════════════════════════════════════════════════════════════\n');
