# Remove all remaining resolveTenantSlug conversions
$files = @(
  'backend/routes/bizdevsources.js',
  'backend/routes/cashflow.js',
  'backend/routes/contacts.js',
  'backend/routes/activities.js',
  'backend/routes/opportunities.js'
)

foreach ($file in $files) {
  $content = Get-Content $file -Raw
  
  # Remove standard if-block pattern
  $content = $content -replace '(?s)\s+if \(tenant_id && isUUID\(String\(tenant_id\)\)\) \{\s+tenant_id = await resolveTenantSlug\(pgPool, String\(tenant_id\)\);\s+\}', ''
  
  # Remove requestedTenantId variant
  $content = $content -replace '(?s)\s+if \(requestedTenantId && isUUID\(String\(requestedTenantId\)\)\) \{\s+requestedTenantId = await resolveTenantSlug\(pgPool, String\(requestedTenantId\)\);\s+\}', ''
  
  # Remove inline ternary in POST
  $content = $content -replace 'isUUID\(String\(incomingTenantId\)\)\s+\? await resolveTenantSlug\(pgPool, String\(incomingTenantId\)\)\s+:', 'false ?'
  
  # Remove c.tenant_id variant
  $content = $content -replace 'isUUID\(String\(c\.tenant_id\)\)\s+\? await resolveTenantSlug\(pgPool, String\(c\.tenant_id\)\)\s+: c\.tenant_id', 'c.tenant_id'
  
  Set-Content $file $content -NoNewline
  Write-Host "Processed: $file"
}

Write-Host "Done!"
