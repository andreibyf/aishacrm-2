Param(
  [string]$BaseUrl = "http://localhost:4001",
  [string]$TenantId = "test-tenant-001",
  [string]$OutFile = "endpoint-test-results.ps1.json"
)

Write-Host "Starting comprehensive API endpoint testing against $BaseUrl" -ForegroundColor Cyan

# Endpoint definitions (Method, Path, Description, Optional Body)
$endpoints = @(
  @{ Method = 'GET'; Path = '/'; Description = 'Root API info' }
  @{ Method = 'GET'; Path = '/health'; Description = 'Health check' }
  @{ Method = 'GET'; Path = '/api/status'; Description = 'API status' }
  @{ Method = 'GET'; Path = '/api/system/status'; Description = 'System status' }
  @{ Method = 'GET'; Path = '/api/system/runtime'; Description = 'Runtime diagnostics' }
  @{ Method = 'GET'; Path = "/api/system/logs?tenant_id=$TenantId"; Description = 'System logs' }
  @{ Method = 'GET'; Path = "/api/reports/dashboard-stats?tenant_id=$TenantId"; Description = 'Dashboard stats' }
  @{ Method = 'GET'; Path = "/api/accounts?tenant_id=$TenantId"; Description = 'List accounts' }
  @{ Method = 'POST'; Path = '/api/accounts'; Description = 'Create account (empty)'; Body = @{ tenant_id = $TenantId; name = 'Test Account PS' } }
  @{ Method = 'GET'; Path = "/api/contacts?tenant_id=$TenantId"; Description = 'List contacts' }
  @{ Method = 'GET'; Path = "/api/leads?tenant_id=$TenantId"; Description = 'List leads' }
  @{ Method = 'GET'; Path = "/api/opportunities?tenant_id=$TenantId"; Description = 'List opportunities' }
  @{ Method = 'GET'; Path = "/api/activities?tenant_id=$TenantId"; Description = 'List activities' }
  @{ Method = 'GET'; Path = "/api/notes?tenant_id=$TenantId"; Description = 'List notes' }
  @{ Method = 'GET'; Path = "/api/users?tenant_id=$TenantId"; Description = 'List users' }
  @{ Method = 'GET'; Path = "/api/employees?tenant_id=$TenantId"; Description = 'List employees' }
  @{ Method = 'GET'; Path = '/api/tenants'; Description = 'List tenants' }
  @{ Method = 'GET'; Path = "/api/aicampaigns?tenant_id=$TenantId"; Description = 'List AI campaigns' }
  @{ Method = 'GET'; Path = "/api/workflows?tenant_id=$TenantId"; Description = 'List workflows' }
  @{ Method = 'GET'; Path = "/api/cashflow?tenant_id=$TenantId"; Description = 'List cashflow' }
  @{ Method = 'GET'; Path = "/api/bizdev?tenant_id=$TenantId"; Description = 'List bizdev' }
  @{ Method = 'GET'; Path = "/api/bizdevsources?tenant_id=$TenantId"; Description = 'List bizdev sources' }
  @{ Method = 'GET'; Path = "/api/permissions?tenant_id=$TenantId"; Description = 'List permissions' }
  @{ Method = 'GET'; Path = "/api/modulesettings?tenant_id=$TenantId"; Description = 'List module settings' }
  @{ Method = 'GET'; Path = '/api/systembrandings'; Description = 'List system brandings' }
  @{ Method = 'GET'; Path = "/api/integrations?tenant_id=$TenantId"; Description = 'List integrations' }
  @{ Method = 'GET'; Path = "/api/tenantintegrations?tenant_id=$TenantId"; Description = 'List tenant integrations' }
  @{ Method = 'GET'; Path = "/api/system-logs?tenant_id=$TenantId"; Description = 'List system logs' }
  @{ Method = 'GET'; Path = "/api/audit-logs?tenant_id=$TenantId"; Description = 'List audit logs' }
  @{ Method = 'GET'; Path = "/api/metrics/performance?tenant_id=$TenantId"; Description = 'Performance metrics' }
  @{ Method = 'GET'; Path = "/api/synchealths?tenant_id=$TenantId"; Description = 'Sync healths' }
  @{ Method = 'GET'; Path = '/api/storage/bucket'; Description = 'Get bucket info' }
  @{ Method = 'GET'; Path = "/api/documents?tenant_id=$TenantId"; Description = 'List documents' }
  @{ Method = 'GET'; Path = "/api/documentationfiles?tenant_id=$TenantId"; Description = 'List documentation files' }
  @{ Method = 'GET'; Path = "/api/notifications?tenant_id=$TenantId"; Description = 'List notifications' }
  @{ Method = 'GET'; Path = "/api/announcements?tenant_id=$TenantId"; Description = 'List announcements' }
  @{ Method = 'GET'; Path = '/api/testing/ping'; Description = 'Ping test' }
  @{ Method = 'GET'; Path = '/api/utils/health'; Description = 'Utils health' }
  @{ Method = 'GET'; Path = "/api/webhooks?tenant_id=$TenantId"; Description = 'List webhooks' }
  @{ Method = 'GET'; Path = '/api/cron/jobs'; Description = 'List cron jobs' }
  @{ Method = 'GET'; Path = "/api/apikeys?tenant_id=$TenantId"; Description = 'List API keys' }
)

$results = @()
$pass = 0; $fail = 0; $total = $endpoints.Count

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
# Optional: add auth header if required (e.g., bearer token)
$authToken = $env:AISHA_API_TOKEN
if ($authToken) { $session.Headers['Authorization'] = "Bearer $authToken" }

foreach ($ep in $endpoints) {
  $url = "$BaseUrl$($ep.Path)"
  $method = $ep.Method.ToUpper()
  $bodyJson = $null
  if ($ep.Body) { $bodyJson = ($ep.Body | ConvertTo-Json -Depth 6) }

  try {
    if ($method -in @('GET','DELETE')) {
      $resp = Invoke-WebRequest -Uri $url -Method $method -WebSession $session -ErrorAction Stop
    } else {
      $resp = Invoke-WebRequest -Uri $url -Method $method -Body $bodyJson -ContentType 'application/json' -WebSession $session -ErrorAction Stop
    }
    $code = [int]$resp.StatusCode
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  }

  $ok = ($code -ge 200 -and $code -lt 500)
  if ($ok) { $pass++ } else { $fail++ }

  $results += [PSCustomObject]@{
    method = $method
    path = $ep.Path
    url = $url
    status = $code
    description = $ep.Description
    result = if ($ok) { 'PASS' } else { 'FAIL' }
  }

  Write-Host ("{0,-6} {1,-55} {2,3} {3}" -f $method, $ep.Path, $code, (if ($ok) { 'PASS' } else { 'FAIL' }))
}

$payload = [PSCustomObject]@{
  timestamp = (Get-Date).ToUniversalTime().ToString('o')
  base_url = $BaseUrl
  tenant_id = $TenantId
  summary = @{ total = $total; passed = $pass; failed = $fail }
  results = $results
}

$payload | ConvertTo-Json -Depth 6 | Out-File -Encoding UTF8 $OutFile
Write-Host "\nCompleted. Results saved to $OutFile" -ForegroundColor Green
Write-Host "Total: $total  Passed: $pass  Failed: $fail" -ForegroundColor Yellow
