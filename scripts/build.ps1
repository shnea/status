param(
    [Parameter(Mandatory,Position=0)][ValidateSet('build','push','build-push')][string]$Action,
    [ValidateSet('local','dev','prod')][string]$Environment='local',
    [string[]]$Service
)
. (Join-Path $PSScriptRoot 'common.ps1')
# This local-only script is deliberately excluded from the production bundle.
foreach ($relative in Get-SettingsList 'BUILD_SOURCES') {
    if (!(Test-Path -LiteralPath (Join-Path $script:ProjectRoot $relative) -PathType Leaf)) {
        throw 'Build/Push requires the local source checkout. This script must not run on the production server.'
    }
}
$envFile = Join-Path $script:ProjectRoot ('.env.' + $Environment)
Assert-Environment (Read-EnvFile $envFile) $Environment
$services = @(Get-SelectedServices $Service @(Get-SettingsList 'BUILD_SERVICES'))
$profile = $script:ProjectSettings['BUILD_PROFILE']
$config = (Invoke-ProjectCompose $envFile @('config','--format','json') $profile) -join "`n" | ConvertFrom-Json
if ($Action -in @('push','build-push')) {
    foreach ($name in $services) {
        $image = $config.services.$name.image
        if ($image -notmatch '.+/.+(:[^/]+|@sha256:[a-f0-9]+)$' -or $image -match ':(local|latest)$') {
            throw ('Push requires a registry image with a release tag or digest: ' + $name)
        }
    }
}
if ($Action -in @('build','build-push')) { Invoke-ProjectCompose $envFile (@('build') + $services) $profile | Out-Null }
if ($Action -in @('push','build-push')) { Invoke-ProjectCompose $envFile (@('push') + $services) $profile | Out-Null }
Write-Output ($Action + ' completed. No server was changed.')
