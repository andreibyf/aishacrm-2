param(
  [Parameter(Mandatory=$true)][string]$Url,
  [string]$Project = "chromium",
  [string]$Email,
  [string]$Password
)

# Forward to the canonical script under scripts/
$params = @{}
if ($PSBoundParameters.ContainsKey('Url')) { $params['Url'] = $Url }
if ($PSBoundParameters.ContainsKey('Project')) { $params['Project'] = $Project }
if ($PSBoundParameters.ContainsKey('Email')) { $params['Email'] = $Email }
if ($PSBoundParameters.ContainsKey('Password')) { $params['Password'] = $Password }

& .\scripts\run-staging-smoke.ps1 @params

exit $LASTEXITCODE
