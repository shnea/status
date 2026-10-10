# Windows orchestration checks with synthetic ENV and temporary keys.
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$fixtureBase = Join-Path ([IO.Path]::GetTempPath()) ('status-env-check-' + [guid]::NewGuid().ToString('N'))
$fixtureRoot = Join-Path $fixtureBase 'project'
$previousKey = $env:SOPS_AGE_KEY_FILE
$passed = 0
$global:FixtureCalls = [Collections.Generic.List[object]]::new()
$global:FixtureFailure = ''
$global:FixtureImage = 'registry.example.invalid/status-app:release-test'
function global:docker {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$ComposeArgs)
    $global:LASTEXITCODE = 0
    if (($ComposeArgs -join ' ') -eq 'compose version') { return }
    $global:FixtureCalls.Add(@($ComposeArgs))
    if ($global:FixtureFailure -and $ComposeArgs -contains $global:FixtureFailure) { $global:LASTEXITCODE=1; return }
    if ($ComposeArgs -contains '--format') {
        @{ services=@{
            'backend-image'=@{image=$global:FixtureImage}
            'frontend-image'=@{image=$global:FixtureImage}
            'pdf-image'=@{image=$global:FixtureImage}
        }} | ConvertTo-Json -Depth 5 -Compress
    }
    if ($ComposeArgs -contains 'logs') { 'fixture-password[$] fixture-api-key' }
}
function Assert-Check([bool]$Condition,[string]$Message) {
    if (!$Condition) { throw $Message }
    $script:passed++
}
function Expect-Failure([scriptblock]$Command) {
    $failed = $false
    try { & $Command | Out-Null } catch { $failed = $true }
    Assert-Check $failed 'Expected command rejection.'
}
function Write-Fixture {
    $text = ($values.GetEnumerator() | ForEach-Object { $_.Key + '=' + $_.Value }) -join "`n"
    [IO.File]::WriteAllText((Join-Path $fixtureRoot '.env.prod'),$text+"`n",[Text.UTF8Encoding]::new($false))
}
try {
    New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'scripts') -Destination $fixtureRoot -Recurse
    foreach ($relative in @('compose.yml','infra/nginx/default.conf','infra/postgres/backup.sh','infra/postgres/restore-check.sh','backend/Dockerfile','frontend/Dockerfile','infra/pdf/Dockerfile')) {
        $target = Join-Path $fixtureRoot $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $sourceRoot $relative) -Destination $target
    }
    $db = Join-Path $fixtureBase 'database'
    $backups = Join-Path $fixtureBase 'backups'
    New-Item -ItemType Directory -Path $db,$backups | Out-Null
    $values = [ordered]@{
        APP_ENV='prod'; COMPOSE_PROFILES='runtime'; APP_PORT='30165'; DB_PORT='30166'
        APP_BIND_ADDRESS='127.0.0.1'; APP_PUBLIC_URL='https://example.invalid'; SESSION_COOKIE_SECURE='true'
        DB_DATA_DIR=$db; BACKUP_DIR=$backups; POSTGRES_DB='fixture'; POSTGRES_USER='fixture'
        POSTGRES_PASSWORD="'fixture-password[$]'"; POSTGRES_IMAGE='postgres:17'; NGINX_IMAGE='nginx:stable-alpine'
        PLATFORM_BASE_URL='https://platform.example.invalid'
        PLATFORM_PROJECT_ID='11111111-1111-1111-1111-111111111111'
        PLATFORM_ENVIRONMENT_ID='22222222-2222-2222-2222-222222222222'
        PLATFORM_API_KEY='fixture-api-key'; PLATFORM_FILE_RETENTION_CODE='fixture'
        PLATFORM_OIDC_ISSUER='https://platform.example.invalid/realm'; PLATFORM_OIDC_CLIENT_ID='app'
        PLATFORM_OIDC_REDIRECT_URI='https://example.invalid/callback'; OIDC_POST_LOGOUT_REDIRECT_URI='https://example.invalid/'
        ADMIN_OIDC_ISSUER=''; ADMIN_OIDC_SUBJECT=''
        BACKEND_APP_IMAGE='registry.example.invalid/status-backend:release-test'
        FRONTEND_APP_IMAGE='registry.example.invalid/status-frontend:release-test'
        PDF_APP_IMAGE='registry.example.invalid/status-pdf:release-test'
    }
    Write-Fixture
    $sops = Join-Path $sourceRoot '.runtime/tools/sops.exe'
    $keygen = Join-Path $sourceRoot '.runtime/tools/age-release/age/age-keygen.exe'
    $key = Join-Path $fixtureBase 'key.agekey'
    & $keygen -o $key 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Fixture key generation failed.' }
    $publicKey = ((Get-Content -LiteralPath $key | Where-Object { $_ -like '# public key:*' }) -split ': ',2)[1]
    $policy = "creation_rules:`n  - path_regex: ^\.env\.prod\.sops\.env$`n    age: " + $publicKey + "`n"
    [IO.File]::WriteAllText((Join-Path $fixtureRoot '.sops.yaml'),$policy)
    $env:SOPS_AGE_KEY_FILE = $key
    $scripts = Join-Path $fixtureRoot 'scripts'
    $plain = Join-Path $fixtureRoot '.env.prod'
    $cipher = $plain + '.sops.env'
    & (Join-Path $scripts 'env.ps1') encrypt -Environment prod -Sops $sops | Out-Null
    Assert-Check (!(Get-Content -LiteralPath $cipher -Raw).Contains('fixture-api-key')) 'ENV was not encrypted.'
    & (Join-Path $scripts 'env.ps1') decrypt -Environment prod -Sops $sops | Out-Null
    Assert-Check ((Get-Content -LiteralPath $plain -Raw).Contains('fixture-api-key')) 'ENV roundtrip failed.'
    Assert-Check (Get-Acl -LiteralPath $plain).AreAccessRulesProtected 'Plain ENV ACL must be restricted.'
    $before = (Get-FileHash -LiteralPath $plain).Hash
    $wrong = Join-Path $fixtureBase 'wrong.agekey'
    & $keygen -o $wrong 2>&1 | Out-Null
    $env:SOPS_AGE_KEY_FILE = $wrong
    Expect-Failure { & (Join-Path $scripts 'env.ps1') decrypt -Environment prod -Sops $sops }
    Assert-Check ((Get-FileHash -LiteralPath $plain).Hash -eq $before) 'Failed decrypt modified existing ENV.'
    $env:SOPS_AGE_KEY_FILE = $key
    $values['ADMIN_OIDC_ISSUER']='https://example.invalid/realm'; Write-Fixture
    $beforeCipher = (Get-FileHash -LiteralPath $cipher).Hash
    Expect-Failure { & (Join-Path $scripts 'env.ps1') encrypt -Environment prod -Sops $sops }
    Assert-Check ((Get-FileHash -LiteralPath $cipher).Hash -eq $beforeCipher) 'Invalid ENV replaced cipher.'
    $values['ADMIN_OIDC_ISSUER']=''; Write-Fixture
    $global:FixtureCalls.Clear(); $global:FixtureFailure='build'
    Expect-Failure { & (Join-Path $scripts 'build.ps1') build-push -Environment prod }
    Assert-Check (@($global:FixtureCalls | Where-Object { $_ -contains 'build' }).Count -eq 1) 'Build was not attempted.'
    Assert-Check (@($global:FixtureCalls | Where-Object { $_ -contains 'push' }).Count -eq 0) 'Push followed a failed build.'
    $global:FixtureFailure=''; $global:FixtureCalls.Clear()
    & (Join-Path $scripts 'build.ps1') build-push -Environment prod | Out-Null
    $actions = @($global:FixtureCalls | Where-Object { $_ -contains 'build' -or $_ -contains 'push' })
    Assert-Check ($actions.Count -eq 2 -and $actions[0] -contains 'build' -and $actions[1] -contains 'push') 'Build/Push order changed.'
    & (Join-Path $scripts 'docker.ps1') up -Environment prod -Service backend-runtime | Out-Null
    $up = @($global:FixtureCalls | Where-Object { $_ -contains 'up' })[0]
    Assert-Check ($up -contains '--no-build' -and $up -contains '--wait' -and $up[-1] -eq 'backend-runtime') 'Runtime Up/service selection changed.'
    Expect-Failure { & (Join-Path $scripts 'docker.ps1') up -Environment prod -Service backend-image }
    $logs = (& (Join-Path $scripts 'docker.ps1') logs -Environment prod) -join "`n"
    Assert-Check ($logs.Contains('[REDACTED]') -and !$logs.Contains('fixture-api-key') -and !$logs.Contains('fixture-password[$]')) 'Log secrets were exposed.'
    $env:APP_PORT='9999'
    Expect-Failure { & (Join-Path $scripts 'docker.ps1') validate -Environment prod }
    Remove-Item Env:APP_PORT
    foreach ($mode in @('none','plain','sops')) {
        & (Join-Path $scripts 'export-runtime.ps1') -EnvMode $mode | Out-Null
        $bundle = Get-ChildItem -LiteralPath (Join-Path $fixtureRoot '.runtime') -Directory | Sort-Object CreationTimeUtc -Descending | Select-Object -First 1
        Assert-Check (!(Test-Path (Join-Path $bundle.FullName 'scripts/build.ps1'))) 'Build script entered server bundle.'
        Assert-Check ((Test-Path (Join-Path $bundle.FullName '.env.prod')) -eq ($mode -eq 'plain')) 'Plain ENV export mode changed.'
        Assert-Check ((Test-Path (Join-Path $bundle.FullName '.env.prod.sops.env')) -eq ($mode -eq 'sops')) 'SOPS export mode changed.'
    }
    $errors = @()
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'scripts') -Filter '*.ps1') {
        $tokens=$null; $parseErrors=$null
        [Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$parseErrors) | Out-Null
        $errors += $parseErrors
    }
    Assert-Check ($errors.Count -eq 0) 'PowerShell syntax errors.'
    Write-Output ("Windows script checks passed: " + $passed)
} finally {
    $env:SOPS_AGE_KEY_FILE = $previousKey
    Remove-Item Function:docker -ErrorAction SilentlyContinue
    Remove-Variable FixtureCalls,FixtureFailure,FixtureImage -Scope Global -ErrorAction SilentlyContinue
    # Only this generated temporary test tree is removed.
    $resolved = [IO.Path]::GetFullPath($fixtureBase)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolved).StartsWith('status-env-check-')) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
