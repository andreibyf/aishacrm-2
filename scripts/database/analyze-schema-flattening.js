/**
 * Schema Flattening Analysis
 * Analyzes UI forms and routes to identify fields that should be direct columns
 */

// Fields that should typically be direct columns (commonly queried/filtered)
const COMMON_FLATTENABLE_FIELDS = {
  accounts: ['phone', 'email', 'description', 'annual_revenue', 'employee_count', 'street', 'city', 'state', 'zip', 'country'],
  contacts: ['phone', 'title', 'department', 'description'],
  leads: ['phone', 'title', 'company', 'source', 'description'],
  opportunities: ['description', 'expected_revenue', 'next_step'],
  activities: ['due_date', 'priority', 'assigned_to', 'description'],
  employees: ['phone', 'department'], // Already done!
};

console.log('=== SCHEMA FLATTENING ANALYSIS ===\n');

// Check current schema
console.log('📋 CURRENT SCHEMA (from 001_init.sql):');
console.log('accounts: id, tenant_id, name, industry, website, metadata, created_at');
console.log('contacts: id, tenant_id, first_name, last_name, email, phone, account_id, metadata, created_at');
console.log('leads: id, tenant_id, first_name, last_name, email, company, status, metadata, created_at');
console.log('opportunities: id, tenant_id, name, stage, amount, probability, close_date, account_id, contact_id, metadata, created_at');
console.log('activities: id, tenant_id, type, subject, body, status, related_id, metadata, created_at');
console.log('employees: id, tenant_id, first_name, last_name, email, role, status, phone, department, metadata, created_at ✅');
console.log('');

console.log('🎯 FIELDS TO FLATTEN (move from metadata to direct columns):\n');

Object.entries(COMMON_FLATTENABLE_FIELDS).forEach(([table, fields]) => {
  console.log(`\n${table.toUpperCase()}:`);
  fields.forEach(field => {
    console.log(`  - ${field}`);
  });
});

console.log('\n\n📝 MIGRATION TASKS:\n');

const migrations = [];

// Accounts
migrations.push({
  table: 'accounts',
  columns: [
    { name: 'phone', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
    { name: 'annual_revenue', type: 'DECIMAL(15,2)' },
    { name: 'employee_count', type: 'INTEGER' },
    { name: 'street', type: 'TEXT' },
    { name: 'city', type: 'TEXT' },
    { name: 'state', type: 'TEXT' },
    { name: 'zip', type: 'TEXT' },
    { name: 'country', type: 'TEXT' },
  ],
  indexes: ['phone', 'email', 'city', 'state']
});

// Contacts
migrations.push({
  table: 'contacts',
  columns: [
    { name: 'title', type: 'TEXT' },
    { name: 'department', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
  ],
  indexes: ['title', 'department']
});

// Leads
migrations.push({
  table: 'leads',
  columns: [
    { name: 'phone', type: 'TEXT' },
    { name: 'title', type: 'TEXT' },
    { name: 'source', type: 'TEXT' },
    { name: 'description', type: 'TEXT' },
  ],
  indexes: ['phone', 'source']
});

// Opportunities
migrations.push({
  table: 'opportunities',
  columns: [
    { name: 'description', type: 'TEXT' },
    { name: 'expected_revenue', type: 'DECIMAL(15,2)' },
    { name: 'next_step', type: 'TEXT' },
  ],
  indexes: []
});

// Activities
migrations.push({
  table: 'activities',
  columns: [
    { name: 'due_date', type: 'TIMESTAMPTZ' },
    { name: 'priority', type: 'TEXT' },
    { name: 'assigned_to', type: 'UUID' },
    { name: 'description', type: 'TEXT' },
  ],
  indexes: ['due_date', 'priority', 'assigned_to']
});

migrations.forEach((migration, index) => {
  console.log(`\n--- Migration ${index + 12}: Flatten ${migration.table} ---`);
  console.log(`\nALTER TABLE ${migration.table}`);
  migration.columns.forEach((col, i) => {
    const comma = i < migration.columns.length - 1 ? ',' : ';';
    console.log(`  ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${comma}`);
  });
  
  if (migration.indexes.length > 0) {
    console.log('');
    migration.indexes.forEach(idx => {
      console.log(`CREATE INDEX IF NOT EXISTS idx_${migration.table}_${idx} ON ${migration.table}(${idx}) WHERE ${idx} IS NOT NULL;`);
    });
  }
});

console.log('\n\n🔧 ROUTE UPDATES NEEDED:\n');
migrations.forEach(migration => {
  console.log(`\n${migration.table}.js:`);
  console.log(`  POST /: Extract ${migration.columns.map(c => c.name).join(', ')} from req.body`);
  console.log(`  PUT /:id: Update ${migration.columns.map(c => c.name).join(', ')}`);
  console.log(`  Remove these fields from ...additionalFields spread`);
});

console.log('\n\n✅ BENEFITS:\n');
console.log('  • Direct SQL queries: WHERE phone = ..., WHERE city = ...');
console.log('  • Indexes for fast lookups');
console.log('  • Type safety (no JSON parsing needed)');
console.log('  • NULL vs empty string distinction');
console.log('  • Better analytics/reporting queries');
console.log('  • Metadata reserved for truly unstructured data');

console.log('\n\n📊 SUMMARY:\n');
const totalColumns = migrations.reduce((sum, m) => sum + m.columns.length, 0);
console.log(`  Tables to flatten: ${migrations.length}`);
console.log(`  Total columns to add: ${totalColumns}`);
console.log(`  Already flattened: employees (phone, department) ✅`);
