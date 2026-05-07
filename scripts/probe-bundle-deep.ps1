$ErrorActionPreference = 'Continue'

$r = Invoke-WebRequest -Uri 'https://staging-app.aishacrm.com' -UseBasicParsing -TimeoutSec 10
# Extract all script tags + asset references
$assets = [regex]::Matches($r.Content, '/assets/[A-Za-z0-9_-]+\.js') | ForEach-Object { $_.Value } | Select-Object -Unique
Write-Host "=== Bundle asset URLs in index.html ==="
$assets | ForEach-Object { Write-Host "  $_" }

# Also fetch the asset manifest if present (Vite emits one)
Write-Host ''
Write-Host '=== Probe modulepreload chunks (route-split) ==='
$preload = [regex]::Matches($r.Content, 'href="(/assets/[A-Za-z0-9_-]+\.js)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
$preload | ForEach-Object { Write-Host "  $_" }

# Strategy: fetch entry bundle and look for the chunk filenames it imports
# Then fetch any chunk whose name contains LeadDetailPanel/AccountDetailPanel/OpportunityDetailPanel
$entryUrl = "https://staging-app.aishacrm.com" + ($assets | Where-Object { $_ -match 'entry-' } | Select-Object -First 1)
Write-Host ''
Write-Host "=== Fetching entry: $entryUrl ==="
$entry = (Invoke-WebRequest -Uri $entryUrl -UseBasicParsing -TimeoutSec 30).Content

# Search for chunk references in entry
$chunks = [regex]::Matches($entry, '"/assets/([A-Za-z0-9_-]+\.js)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
Write-Host "  entry references $($chunks.Count) lazy chunks (sample):"
$chunks | Select-Object -First 8 | ForEach-Object { Write-Host "    $_" }

# Look for the specific panel chunks. Vite names chunks after the file.
$leadChunk = $chunks | Where-Object { $_ -match '(?i)LeadDetailPanel' } | Select-Object -First 1
$accChunk  = $chunks | Where-Object { $_ -match '(?i)AccountDetailPanel' } | Select-Object -First 1
$oppChunk  = $chunks | Where-Object { $_ -match '(?i)OpportunityDetailPanel' } | Select-Object -First 1

Write-Host ''
Write-Host '=== Detail panel chunks ==='
Write-Host "  LeadDetailPanel:        $leadChunk"
Write-Host "  AccountDetailPanel:     $accChunk"
Write-Host "  OpportunityDetailPanel: $oppChunk"

# Or: chunks named for routes (Leads, Accounts, Opportunities)
$leadsRoute = $chunks | Where-Object { $_ -match '(?i)^Leads-' } | Select-Object -First 1
$accountsRoute = $chunks | Where-Object { $_ -match '(?i)^Accounts-' } | Select-Object -First 1
$oppRoute = $chunks | Where-Object { $_ -match '(?i)^Opportunities-' } | Select-Object -First 1

Write-Host ''
Write-Host '=== Route-page chunks ==='
Write-Host "  Leads route:        $leadsRoute"
Write-Host "  Accounts route:     $accountsRoute"
Write-Host "  Opportunities route: $oppRoute"

# Fetch each route chunk (they likely contain the panel code) and search for FileSignature/Send Document
$probes = @($leadChunk, $accChunk, $oppChunk, $leadsRoute, $accountsRoute, $oppRoute) | Where-Object { $_ } | Select-Object -Unique
foreach ($chunk in $probes) {
    $url = "https://staging-app.aishacrm.com/assets/$chunk"
    try {
        $body = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15).Content
        $hasFS = $body.Contains('FileSignature')
        $hasSD = $body.Contains('Send Document')
        $hasUO = $body.Contains('docuseal/submissions') -or $body.Contains('docuseal-submissions')
        Write-Host ("  {0,-50}  size={1,7}  FileSig={2}  SendDoc={3}  docuseal-API={4}" -f $chunk, $body.Length, $hasFS, $hasSD, $hasUO)
    } catch {
        Write-Host "  $chunk  FAIL: $($_.Exception.Message)"
    }
}
