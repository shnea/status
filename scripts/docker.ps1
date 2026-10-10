param(
    [Parameter(Mandatory,Position=0)][ValidateSet('pull','up','logs','status','validate')][string]$Action,
    [ValidateSet('local','dev','prod')][string]$Environment='local',
    [string[]]$Service
)
. (Join-Path $PSScriptRoot 'common.ps1')
$envFile = Join-Path $script:ProjectRoot ('.env.' + $Environment)
$values = Read-EnvFile $envFile
Assert-Environment $values $Environment -HostPaths:($Action -in @('up','validate'))
$services = @(Get-SelectedServices $Service @(Get-SettingsList $(if ($Environment -eq 'prod') {'PROD_SERVICES'} else {'DEV_SERVICES'})))
Invoke-ProjectCompose $envFile @('config','--quiet') | Out-Null
switch ($Action) {
    'pull' { Invoke-ProjectCompose $envFile (@('pull') + $services) | Out-Null }
    'up' { Invoke-ProjectCompose $envFile (@('up','-d','--no-build','--wait') + $services) | Out-Null }
    'status' { Invoke-ProjectCompose $envFile (@('ps') + $services) }
    'logs' {
        $lines = Invoke-ProjectCompose $envFile (@('logs','--tail','200','--no-color') + $services)
        foreach ($line in $lines) { Hide-EnvSecrets ([string]$line) $values }
    }
}
if ($Action -notin @('logs','status')) { Write-Output ($Action + ' completed for ' + $Environment + '.') }
