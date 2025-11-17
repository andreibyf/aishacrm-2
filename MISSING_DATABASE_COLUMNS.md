# Missing Database Columns Report

Generated: 2025-11-12

## Summary

The following fields are referenced in code/UI but **DO NOT EXIST** in the database (neither as direct columns nor in the metadata JSONB field):

## Critical Missing Fields

### accounts table
- ❌ **owner_id** - Referenced in AI snapshot, Braid types, UI forms
- ❌ **phone** - Listed as AccountMetadata type in Braid
- ❌ **num_employees** - Listed as AccountMetadata type in Braid

### contacts table  
- ❌ **owner_id** - Referenced in Braid functions, AI snapshot
- ✅ **phone** - EXISTS as direct column
- ✅ **job_title** - EXISTS in metadata JSONB

### leads table
- ❌ **owner_id** - Referenced in Braid functions
- ✅ **phone** - EXISTS as direct column

### opportunities table
- ❌ **owner_id** - Referenced in Braid functions, AI snapshot

### activities table
- ❌ **owner_id** - Referenced in Braid functions, AI snapshot
- ❌ **related_to_type** - Referenced in Braid functions
- ❌ **related_to_id** - Referenced in Braid functions

## Impact

### Immediate Issues
1. **AI Snapshot Endpoint** - Fails when trying to select `owner_id` from accounts/contacts/etc
2. **Braid Tool Schemas** - Reference non-existent fields causing parse/execution errors
3. **Frontend Forms** - May be trying to save data to fields that don't exist

### Where These Fields Are Referenced

#### owner_id
- `backend/routes/ai.js` - AI snapshot endpoint SELECT statements
- `braid-llm-kit/examples/assistant/*.braid` - All CRUD tool functions
- `braid-llm-kit/spec/types.braid` - Type definitions for Account, Contact, Lead, Opportunity, Activity

#### phone (accounts only)
- `braid-llm-kit/spec/types.braid` - AccountMetadata type

#### num_employees (accounts)
- `braid-llm-kit/spec/types.braid` - AccountMetadata type

#### related_to_type / related_to_id (activities)
- `braid-llm-kit/examples/assistant/activities.braid` - createActivity function

## Recommended Actions

### Option 1: Add Missing Columns (Preferred)
Add these columns to the database schema via migrations:

```sql
-- Add owner_id to core tables
ALTER TABLE accounts ADD COLUMN owner_id UUID REFERENCES users(id);
ALTER TABLE contacts ADD COLUMN owner_id UUID REFERENCES users(id);
ALTER TABLE leads ADD COLUMN owner_id UUID REFERENCES users(id);
ALTER TABLE opportunities ADD COLUMN owner_id UUID REFERENCES users(id);
ALTER TABLE activities ADD COLUMN owner_id UUID REFERENCES users(id);

-- Add relationship tracking to activities
ALTER TABLE activities ADD COLUMN related_to_type TEXT;
ALTER TABLE activities ADD COLUMN related_to_id UUID;

-- Add phone to accounts if needed as direct column
-- (currently using metadata.phone per AccountMetadata type)
```

### Option 2: Update Code to Remove References
Remove all references to `owner_id` and related fields from:
- AI snapshot queries
- Braid type definitions
- Braid tool functions
- Frontend forms

### Option 3: Move to Metadata (Not Recommended)
Moving `owner_id` to metadata JSONB would complicate queries and foreign key relationships.

## Current Workaround Applied

Temporarily removed problematic fields from AI snapshot SELECT statements:
- Removed `owner_id` from accounts query
- Removed `owner_id`, `job_title`, `phone` from contacts query (keeping `phone` and `job_title` accessible via metadata where present)

**Status**: Partial fix - AI snapshot now works but tool schemas and UI may still reference missing fields.

## Validation Script

Run `backend/check-field-locations.js` to regenerate this report with current database state.
