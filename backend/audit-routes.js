import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const routesDir = './routes';
const files = readdirSync(routesDir).filter(f => f.endsWith('.js'));

console.log('\n🔍 Backend Route Implementation Audit\n');
console.log('=' .repeat(70));

const results = [];

files.forEach(file => {
  const content = readFileSync(join(routesDir, file), 'utf-8');
  const category = file.replace('.js', '');
  
  // Check for database operations
  const hasPgPool = content.includes('pgPool');
  const hasQuery = content.includes('.query(');
  const hasInsert = content.includes('INSERT INTO');
  const hasSelect = content.includes('SELECT');
  const hasUpdate = content.includes('UPDATE');
  const hasDelete = content.includes('DELETE FROM');
  
  // Count route definitions
  const routeCount = (content.match(/router\.(get|post|put|delete|patch)/g) || []).length;
  
  // Check for stub/TODO patterns
  const hasStub = content.includes('TODO') || 
                  content.includes('stub') || 
                  content.includes('not implemented') ||
                  content.includes('res.json({ status: \'success\', message:') && !hasQuery;
  
  const status = hasQuery && (hasInsert || hasSelect) ? '✅' : 
                 hasStub ? '⚠️' : 
                 routeCount > 0 ? '❓' : '❌';
  
  results.push({
    category,
    status,
    routeCount,
    hasDB: hasQuery,
    hasCRUD: { insert: hasInsert, select: hasSelect, update: hasUpdate, delete: hasDelete }
  });
});

// Sort by status (✅ last, ❌ first)
results.sort((a, b) => {
  if (a.status === b.status) return 0;
  if (a.status === '❌') return -1;
  if (b.status === '❌') return 1;
  if (a.status === '⚠️') return -1;
  if (b.status === '⚠️') return 1;
  return 0;
});

results.forEach(r => {
  console.log(`\n${r.status} ${r.category.padEnd(25)} (${r.routeCount} routes)`);
  if (r.hasDB) {
    const crud = Object.entries(r.hasCRUD)
      .filter(([_, v]) => v)
      .map(([k]) => k.toUpperCase())
      .join(', ');
    console.log(`   Database ops: ${crud || 'SELECT only'}`);
  } else if (r.status === '⚠️') {
    console.log(`   Status: Stub/Not implemented`);
  }
});

console.log('\n' + '='.repeat(70));
console.log('\nLegend:');
console.log('  ✅ Fully implemented with database operations');
console.log('  ⚠️  Stub/placeholder implementation');
console.log('  ❓ Unknown - needs manual review');
console.log('  ❌ Empty or no routes');

const implemented = results.filter(r => r.status === '✅').length;
const needsWork = results.filter(r => r.status !== '✅').length;

console.log(`\nSummary: ${implemented}/${results.length} categories fully implemented`);
console.log(`Action needed: ${needsWork} categories need implementation\n`);
