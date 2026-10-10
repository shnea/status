param(
    [Parameter(Mandatory, Position=0)][ValidateSet('encrypt','decrypt','check')][string]$Action,
    [ValidateSet('local','dev','prod')][string]$Environment='local',
    [string]$Sops
)
. (Join-Path $PSScriptRoot 'common.ps1')
$plain = Join-Path $script:ProjectRoot ('.env.' + $Environment)
$cipher = $plain + '.sops.env'
if ($Action -eq 'check') {
    Assert-Environment (Read-EnvFile $plain) $Environment -HostPaths
    Invoke-ProjectCompose $plain @('config','--quiet') | Out-Null
    Write-Output ('Validated ' + $Environment + ' ENV and host paths.')
    exit 0
}
if (!$Sops) {
    $command = Get-Command sops -ErrorAction SilentlyContinue
    $Sops = if ($command) { $command.Source } else { Join-Path $script:ProjectRoot '.runtime/tools/sops.exe' }
}
if (!(Test-Path -LiteralPath $Sops -PathType Leaf)) { throw 'SOPS is required. Use PATH or -Sops.' }
$keyFile = $env:SOPS_AGE_KEY_FILE
if (!$keyFile) {
    $pointerName = if ($Environment -eq 'local') {'key-location.txt'} else {$Environment + '-key-location.txt'}
    $pointer = Join-Path $script:ProjectRoot ('.runtime/' + $pointerName)
    if (Test-Path -LiteralPath $pointer) { $keyFile = (Get-Content -LiteralPath $pointer -Raw).Trim() }
}
$previousKey = $env:SOPS_AGE_KEY_FILE
if ($keyFile) {
    $keyPath = [IO.Path]::GetFullPath($keyFile)
    if (!(Test-Path -LiteralPath $keyPath -PathType Leaf) -or (Get-Item -LiteralPath $keyPath).LinkType -or $keyPath.StartsWith($script:ProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Use an existing age private key outside the project.'
    }
    $env:SOPS_AGE_KEY_FILE = $keyPath
}
$source = if ($Action -eq 'encrypt') {$plain} else {$cipher}
$target = if ($Action -eq 'encrypt') {$cipher} else {$plain}
$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$temporary = $plain + '.pending-' + [guid]::NewGuid().ToString('N')
try {
    [IO.File]::WriteAllText($temporary,'',[Text.UTF8Encoding]::new($false))
    Set-PrivateFile $temporary
    if ($Action -eq 'encrypt') { Assert-Environment (Read-EnvFile $plain) $Environment }
    $arguments = @($Action,'--input-type','dotenv','--output-type','dotenv','--output',$temporary)
    if ($Action -eq 'encrypt') { $arguments += @('--filename-override',[IO.Path]::GetFileName($cipher)) }
    Push-Location $script:ProjectRoot
    try {
        & $Sops @arguments $source 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'SOPS failed. Existing files were preserved.' }
    } finally { Pop-Location }
    if ($Action -eq 'decrypt') {
        Assert-Environment (Read-EnvFile $temporary) $Environment
        Set-PrivateFile $temporary
    } else {
        $encrypted = [IO.File]::ReadAllText($temporary)
        $values = Read-EnvFile $plain
        foreach ($name in $values.Keys) {
            if ($values[$name] -and $encrypted -notmatch ('(?m)^' + [regex]::Escape($name) + '=ENC\[')) {
                throw ('SOPS did not encrypt ENV variable: ' + $name)
            }
        }
    }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $hash) { throw 'ENV changed during processing. Existing files were preserved.' }
    [IO.File]::Move($temporary,$target,$true)
    Write-Output ($Action + ' completed for ' + $Environment + '.')
} finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    $env:SOPS_AGE_KEY_FILE = $previousKey
}
