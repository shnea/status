param(
    [ValidateSet('none','plain','sops')][string]$EnvMode='none',
    [ValidateSet('prod')][string]$Environment='prod'
)
. (Join-Path $PSScriptRoot 'common.ps1')
$files = @(Get-SettingsList 'RUNTIME_FILES')
if ($EnvMode -eq 'plain') {
    Assert-Environment (Read-EnvFile (Join-Path $script:ProjectRoot '.env.prod')) 'prod'
    $files += '.env.prod'
}
if ($EnvMode -eq 'sops') {
    $files += @(Get-SettingsList 'SOPS_RUNTIME_FILES')
    $files += '.env.prod.sops.env'
}
foreach ($relative in $files) {
    $source = [IO.Path]::GetFullPath((Join-Path $script:ProjectRoot $relative))
    if (!$source.StartsWith($script:ProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        !(Test-Path -LiteralPath $source -PathType Leaf)) { throw ('Missing or invalid runtime file: ' + $relative) }
}
$destination = Join-Path $script:ProjectRoot ('.runtime/runtime-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $destination | Out-Null
Set-PrivateFile $destination
foreach ($relative in $files) {
    $target = Join-Path $destination $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    if ($relative -eq '.env.prod') {
        [IO.File]::WriteAllText($target,'',[Text.UTF8Encoding]::new($false))
        Set-PrivateFile $target
        [IO.File]::WriteAllBytes($target,[IO.File]::ReadAllBytes((Join-Path $script:ProjectRoot $relative)))
    } else { Copy-Item -LiteralPath (Join-Path $script:ProjectRoot $relative) -Destination $target }
}
Write-Output ('Runtime files prepared (' + $EnvMode + '): ' + $destination)
Write-Output 'No files were sent and no server was changed.'
