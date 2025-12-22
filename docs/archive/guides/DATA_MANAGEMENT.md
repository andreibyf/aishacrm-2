# Data Management Quick Reference

## Clear All Data (Nuclear Option)

If you need to delete **ALL** data from **ALL** tenants (including orphaned demo-tenant data):

```powershell
# Using the nuclear cleanup endpoint
$body = @{ confirm = "DELETE_ALL_DATA" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/database/nuclear-cleanup" -Method POST -Body $body -ContentType "application/json"
```

This deletes:
- ✅ ALL contacts (regardless of tenant)
- ✅ ALL leads (regardless of tenant)
- ✅ ALL accounts (regardless of tenant)
- ✅ ALL opportunities (regardless of tenant)
- ✅ ALL activities (regardless of tenant)

**Use with extreme caution!** This cannot be undone.

## Clear Data by Tenant

### Keep Tenants, Clear Data (Recommended for testing)
```powershell
.\clear-test-data.ps1 -KeepTenants
```
- ✅ Deletes all contacts, leads, accounts, opportunities, activities
- ✅ Keeps tenant structure intact
- ✅ Ready for fresh data entry

### Clear Specific Tenant
```powershell
.\clear-test-data.ps1 -TenantId "6cb4c008-4847-426a-9a2e-918ad70e7b69" -KeepTenants
```
- ✅ Clears data only for specified tenant
- ✅ Other tenants remain untouched

### Nuclear Option - Fresh Start
```powershell
.\clear-test-data.ps1 -DeleteTenants
```
- ⚠️  Deletes ALL tenants AND their data
- ⚠️  Use only for complete reset
- ⚠️  Requires confirmation

## Current State

After running `.\clear-test-data.ps1 -KeepTenants`:

**Tenants Available:**
- Testing Tenant (`testing-tenant`)
- Local Development Tenant (`6cb4c008-4847-426a-9a2e-918ad70e7b69`)

**Data Counts:**
- Contacts: 0
- Leads: 0
- Accounts: 0
- Opportunities: 0
- Activities: 0

**Status:** ✅ **Ready for fresh data entry!**

## Next Steps for Testing

1. **Login** with admin2025@temp.com
2. **Assign Tenant** in Settings → User Management
3. **Test Data Entry:**
   - Add a Contact
   - Create an Account
   - Add a Lead
   - Create an Opportunity
   - Log an Activity

4. **Verify:**
   - Data appears in lists
   - Filters work correctly
   - Can edit/delete records
   - Auto-restart works when you modify code

## Create New Tenant (Optional)

If you want a completely fresh tenant for testing:

```powershell
$body = @{
    tenant_id = "my-test-tenant"
    name = "My Test Company"
    display_order = 1
    is_active = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://localhost:3001/api/tenants' `
                  -Method POST `
                  -Body $body `
                  -ContentType 'application/json'
```

Then assign it to your user in Settings → User Management.

## Useful Data Entry Tips

### Quick Contact Entry (via API)
```powershell
$body = @{
    tenant_id = "6cb4c008-4847-426a-9a2e-918ad70e7b69"
    first_name = "John"
    last_name = "Doe"
    email = "john.doe@example.com"
    phone = "555-1234"
    company = "Acme Corp"
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://localhost:3001/api/contacts' `
                  -Method POST `
                  -Body $body `
                  -ContentType 'application/json'
```

### Bulk Import from CSV
1. Go to Contacts → Import
2. Upload CSV with columns: first_name, last_name, email, phone, company
3. Map fields
4. Import

### Test Different Scenarios

**Empty State:**
- No data - see empty states in UI

**Single Record:**
- Add one contact - test detail view

**Multiple Records:**
- Add 5-10 records - test pagination, sorting, filters

**Edge Cases:**
- Long names
- Special characters
- Missing optional fields
- Duplicate emails

## Monitoring Data

### Check Data via API
```powershell
# List contacts
Invoke-RestMethod 'http://localhost:3001/api/contacts?tenant_id=6cb4c008-4847-426a-9a2e-918ad70e7b69&limit=10'

# List leads
Invoke-RestMethod 'http://localhost:3001/api/leads?tenant_id=6cb4c008-4847-426a-9a2e-918ad70e7b69&limit=10'

# List accounts
Invoke-RestMethod 'http://localhost:3001/api/accounts?tenant_id=6cb4c008-4847-426a-9a2e-918ad70e7b69&limit=10'
```

### Database Direct Query (if needed)
```sql
-- Count records per tenant
SELECT 
  tenant_id,
  COUNT(*) as contact_count
FROM contacts
GROUP BY tenant_id;
```

## Troubleshooting

### Data Not Appearing
1. Check if tenant is assigned to your user
2. Verify tenant_id matches in data
3. Check browser console for errors
4. Refresh the page

### Can't Delete Records
1. Check if you're a Super Admin (full delete permissions)
2. Verify tenant_id matches
3. Check backend terminal for errors

### Auto-Restart Not Working
1. Ensure backend started with `npm run dev` (not `npm start`)
2. Check if file is in watched directory
3. Verify terminal shows "Restarting..." message

---

**You're all set for clean data entry testing!** 🎉
