# Supabase Client API Migration Guide

## 🎯 Goal
Migrate backend routes from the SQL adapter (`pgPool.query()`) to the direct Supabase Client API for better reliability, security, and maintainability.

---

## ⚠️ Why Migrate?

### Problems with SQL Adapter (`pgPool.query()`)
- **SQL Parsing Issues:** The adapter (`lib/supabase-db.js`) emulates PostgreSQL by parsing SQL, causing unpredictable behavior
- **Limited SQL Support:** Features like `ON CONFLICT`, complex JOINs, and certain WHERE clauses don't work reliably
- **Error Messages:** Cryptic errors like "UPDATE requires a WHERE clause" even when WHERE is present
- **Maintenance Burden:** Custom adapter code adds complexity and edge cases

### Benefits of Supabase Client API
- ✅ **Direct & Predictable:** Native methods work exactly as documented
- ✅ **Type Safety:** Better TypeScript support and clearer error messages
- ✅ **Security:** Built-in RLS (Row Level Security) enforcement
- ✅ **Simpler Code:** No SQL parsing, clearer intent
- ✅ **Better Performance:** Direct API calls without parsing overhead
- ✅ **Maintainability:** One consistent pattern across all routes

---

## 📋 Migration Strategy

### Current Status
- **New Standard:** All new routes MUST use Supabase Client API
- **Legacy Code:** Existing routes using `pgPool.query()` can remain until they need updates
- **When to Migrate:** When fixing bugs, adding features, or refactoring existing routes

### Priority Order
1. **High Priority:** Routes with known SQL adapter issues (system-settings ✅ already migrated)
2. **Medium Priority:** Frequently-used routes (users, accounts, leads, opportunities)
3. **Low Priority:** Admin/reporting routes (audit logs, metrics, system logs)

---

## 🔄 Migration Patterns

### Pattern 1: Simple SELECT

**BEFORE (SQL Adapter):**
```javascript
const { rows } = await pgPool.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);
const user = rows[0];
```

**AFTER (Supabase Client):**
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: user, error } = await supabase
  .from('users')
  .select('*')
  .eq('email', email)
  .single();

if (error && error.code !== 'PGRST116') { // PGRST116 = not found
  throw error;
}
```

### Pattern 2: INSERT

**BEFORE (SQL Adapter):**
```javascript
const { rows } = await pgPool.query(
  'INSERT INTO accounts (name, tenant_id) VALUES ($1, $2) RETURNING *',
  [name, tenantId]
);
const account = rows[0];
```

**AFTER (Supabase Client):**
```javascript
const { data: account, error } = await supabase
  .from('accounts')
  .insert({ name, tenant_id: tenantId })
  .select()
  .single();

if (error) {
  throw error;
}
```

### Pattern 3: UPDATE

**BEFORE (SQL Adapter):**
```javascript
const { rows } = await pgPool.query(
  'UPDATE accounts SET name = $1 WHERE id = $2 RETURNING *',
  [name, id]
);
const account = rows[0];
```

**AFTER (Supabase Client):**
```javascript
const { data: account, error } = await supabase
  .from('accounts')
  .update({ name })
  .eq('id', id)
  .select()
  .single();

if (error) {
  throw error;
}
```

### Pattern 4: UPSERT (INSERT or UPDATE)

**BEFORE (SQL Adapter - Often Broken):**
```javascript
// ❌ ON CONFLICT doesn't work reliably in adapter
const { rows } = await pgPool.query(
  'INSERT INTO settings (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
  [id, data]
);
```

**AFTER (Supabase Client):**
```javascript
const { data, error } = await supabase
  .from('settings')
  .upsert({ id, data }, { onConflict: 'id' })
  .select()
  .single();

if (error) {
  throw error;
}
```

### Pattern 5: DELETE

**BEFORE (SQL Adapter):**
```javascript
await pgPool.query('DELETE FROM accounts WHERE id = $1', [id]);
```

**AFTER (Supabase Client):**
```javascript
const { error } = await supabase
  .from('accounts')
  .delete()
  .eq('id', id);

if (error) {
  throw error;
}
```

### Pattern 6: Complex Queries with Filters

**BEFORE (SQL Adapter):**
```javascript
const { rows } = await pgPool.query(
  'SELECT * FROM accounts WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3',
  [tenantId, status, limit]
);
```

**AFTER (Supabase Client):**
```javascript
const { data: rows, error } = await supabase
  .from('accounts')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('status', status)
  .order('created_at', { ascending: false })
  .limit(limit);

if (error) {
  throw error;
}
```

### Pattern 7: Joins (Relations)

**BEFORE (SQL Adapter):**
```javascript
const { rows } = await pgPool.query(
  'SELECT a.*, c.name as contact_name FROM accounts a LEFT JOIN contacts c ON a.id = c.account_id WHERE a.id = $1',
  [id]
);
```

**AFTER (Supabase Client):**
```javascript
const { data, error } = await supabase
  .from('accounts')
  .select(`
    *,
    contacts (
      name
    )
  `)
  .eq('id', id)
  .single();

if (error) {
  throw error;
}
```

---

## 🏗️ Route Structure Template

```javascript
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

export default function createMyRoutes(_pgPool) {
  const router = Router();
  
  // Initialize Supabase client
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // GET /api/myroute
  router.get('/', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('my_table')
        .select('*');

      if (error) {
        throw error;
      }

      res.json({ status: 'success', data: { items: data } });
    } catch (error) {
      console.error('[MyRoute] Error fetching items:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/myroute
  router.post('/', async (req, res) => {
    try {
      const { name, tenant_id } = req.body;

      const { data, error } = await supabase
        .from('my_table')
        .insert({ name, tenant_id })
        .select()
        .single();

      if (error) {
        throw error;
      }

      res.status(201).json({ status: 'success', data });
    } catch (error) {
      console.error('[MyRoute] Error creating item:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
```

---

## 🔍 Error Handling

### Common Supabase Error Codes
- `PGRST116` - Row not found (not an error for optional lookups)
- `23505` - Unique constraint violation (duplicate key)
- `23503` - Foreign key constraint violation
- `42P01` - Table does not exist
- `42703` - Column does not exist

### Error Handling Pattern
```javascript
const { data, error } = await supabase
  .from('table')
  .select('*')
  .eq('id', id)
  .single();

// Ignore "not found" errors for optional queries
if (error && error.code !== 'PGRST116') {
  console.error('[Route] Error:', error);
  return res.status(500).json({ 
    status: 'error', 
    message: error.message,
    code: error.code 
  });
}

// Handle not found case
if (!data) {
  return res.status(404).json({ 
    status: 'error', 
    message: 'Resource not found' 
  });
}
```

---

## 📚 Supabase Client API Reference

### Common Methods
- `.select()` - Query data
- `.insert()` - Insert new rows
- `.update()` - Update existing rows
- `.upsert()` - Insert or update (ON CONFLICT)
- `.delete()` - Delete rows

### Common Filters
- `.eq('column', value)` - Equals
- `.neq('column', value)` - Not equals
- `.gt('column', value)` - Greater than
- `.gte('column', value)` - Greater than or equal
- `.lt('column', value)` - Less than
- `.lte('column', value)` - Less than or equal
- `.like('column', pattern)` - Pattern matching
- `.ilike('column', pattern)` - Case-insensitive pattern matching
- `.in('column', [values])` - In list
- `.is('column', null)` - Is null
- `.not('column', 'is', null)` - Is not null

### Common Modifiers
- `.order('column', { ascending: false })` - Sort results
- `.limit(n)` - Limit results
- `.range(from, to)` - Pagination
- `.single()` - Return single row (error if multiple)
- `.maybeSingle()` - Return single row or null

---

## ✅ Example: Completed Migration

**File:** `backend/routes/system-settings.js` ✅

This route was successfully migrated from SQL adapter to Supabase Client API. Use it as a reference:

```javascript
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

export default function createSystemSettingsRoutes(_pgPool) {
  const router = Router();
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // GET /api/system-settings
  router.get('/', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('settings')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      res.json({ success: true, data: data?.settings || {} });
    } catch (error) {
      console.error('Error fetching system settings:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch system settings' });
    }
  });

  // POST /api/system-settings
  router.post('/', async (req, res) => {
    const { system_openai_settings } = req.body;

    if (!system_openai_settings) {
      return res.status(400).json({ success: false, error: 'system_openai_settings is required' });
    }

    try {
      const { data: currentData } = await supabase
        .from('system_settings')
        .select('settings')
        .eq('id', 1)
        .single();

      const currentSettings = currentData?.settings || {};
      const newSettings = { ...currentSettings, system_openai_settings };

      const { error } = await supabase
        .from('system_settings')
        .upsert({ id: 1, settings: newSettings }, { onConflict: 'id' });

      if (error) {
        throw error;
      }

      res.json({ success: true, data: newSettings });
    } catch (error) {
      console.error('Error updating system settings:', error);
      res.status(500).json({ success: false, error: 'Failed to update system settings' });
    }
  });

  return router;
}
```

---

## 📝 Checklist for Migration

When migrating a route, follow this checklist:

- [ ] Replace `pgPool.query()` with Supabase client methods
- [ ] Add proper error handling with error codes
- [ ] Test all CRUD operations (Create, Read, Update, Delete)
- [ ] Verify RLS policies work correctly
- [ ] Update any related tests
- [ ] Document any special cases or gotchas
- [ ] Add console logs for debugging (with route prefix)
- [ ] Verify response format matches API conventions

---

## 🚫 What NOT to Migrate Yet

**Keep these using SQL adapter for now:**
- Routes with complex raw SQL that would be difficult to translate
- Routes that are working perfectly and aren't causing issues
- Routes that use database features not available in Supabase client (e.g., CTEs, window functions)

**When in doubt:** Leave it alone until there's a reason to change it.

---

## 📞 Getting Help

- **Supabase Docs:** https://supabase.com/docs/reference/javascript
- **Example Route:** `backend/routes/system-settings.js`
- **Questions:** Ask in code reviews or create an issue

---

**Remember:** This is a gradual migration. Don't break what's working. Migrate opportunistically when touching existing code or creating new routes.
