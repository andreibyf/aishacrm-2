param(
  [Parameter(Mandatory=$true)][string]$Url,
  [string]$Project = "chromium"
)

# Forward to the canonical script under scripts/
$params = @{}
if ($PSBoundParameters.ContainsKey('Url')) { $params['Url'] = $Url }
if ($PSBoundParameters.ContainsKey('Project')) { $params['Project'] = $Project }

& .\scripts\run-staging-smoke.ps1 @params

exit $LASTEXITCODE
