# Database Migration Required: Rename cash_flow.type to transaction_type

## Status: ⚠️ PENDING - Manual Execution Required

The backend code has been updated to use `transaction_type` instead of `type` for better code clarity and following naming best practices.

## SQL to Execute in Supabase Dashboard

Navigate to: **Supabase Dashboard → SQL Editor** and run:

```sql
-- Rename column from 'type' to 'transaction_type'
ALTER TABLE cash_flow 
  RENAME COLUMN type TO transaction_type;

-- Add helpful comment
COMMENT ON COLUMN cash_flow.transaction_type IS 'Type of transaction: income or expense';
```

## Verification Query

After running the migration, verify it worked:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'cash_flow' 
AND column_name IN ('type', 'transaction_type');
```

Expected result: Only `transaction_type` should be returned (not `type`).

## What This Fixes

### Before (❌ Unclear naming):
- Column: `type` 
- Too generic, could mean many things

### After (✅ Clear naming):
- Column: `transaction_type`
- Clearly indicates this is the transaction type field (income/expense)

## Code Changes Already Applied

✅ **Backend** (`backend/routes/cashflow.js`):
- Changed all references from `type` to `transaction_type`
- Updated validation messages
- Updated INSERT/UPDATE queries

✅ **Frontend** (`src/components/cashflow/CashFlowForm.jsx`):
- Removed field mapping hack
- Form now sends `transaction_type` directly

✅ **Frontend** (`src/pages/CashFlow.jsx`):
- Updated filter to use `transaction_type`

✅ **Frontend** (`src/components/cashflow/CashFlowChart.jsx`):
- Already using `transaction_type` for data display

## Testing After Migration

1. Navigate to Cash Flow page: `http://localhost:4000/cashflow`
2. Click "Add Transaction"
3. Fill out form with:
   - Transaction Type: Income
   - Category: Sales Revenue
   - Amount: 100.00
   - Date: Today
   - Description: Test transaction
4. Click "Save Transaction"
5. Verify transaction appears in list
6. Verify chart updates with data

## If Migration Fails

If the column doesn't exist or is already renamed:

```sql
-- Check current structure
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'cash_flow' 
ORDER BY ordinal_position;
```

Common scenarios:
- **Column already renamed**: Migration already done! ✅
- **Neither column exists**: Check if table schema is different
- **Both columns exist**: Drop the old one after verifying data

## Docker Containers

✅ Both containers have been rebuilt with the code changes:
- Frontend: Updated to use `transaction_type`
- Backend: Updated API to expect `transaction_type`

**Note**: Hard refresh browser after migration: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
