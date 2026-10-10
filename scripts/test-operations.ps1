$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$suffix = [guid]::NewGuid().ToString('N')
$project = 'status-ops-check-' + $suffix
$fixture = Join-Path $root ('.runtime/ops-check-' + $suffix)
$backups = Join-Path $fixture 'backups'
$runtimeDirectory = Join-Path $fixture 'runtime'
$dataPlaceholder = Join-Path $fixture 'database-placeholder'
$environmentFile = Join-Path $fixture 'fixture.env'
$overrideFile = Join-Path $fixture 'fixture.yml'
$utf8 = [Text.UTF8Encoding]::new($false)
$started = $false
$arguments = @('compose', '--project-name', $project, '--env-file', $environmentFile,
    '-f', (Join-Path $runtimeDirectory 'compose.yml'), '-f', $overrideFile)

function Invoke-Compose([string[]]$Command) {
    $output = & docker @arguments @Command
    if ($LASTEXITCODE -ne 0) { throw 'Isolated operations check failed.' }
    return $output
}

[IO.Directory]::CreateDirectory($backups) | Out-Null
[IO.Directory]::CreateDirectory($dataPlaceholder) | Out-Null
# Deploy only the runtime files; the fixture contains no backend/frontend/PDF sources.
foreach ($relative in @('compose.yml', 'infra/nginx/default.conf', 'infra/postgres/backup.sh', 'infra/postgres/restore-check.sh')) {
    $destination = Join-Path $runtimeDirectory $relative
    [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
    Copy-Item -LiteralPath (Join-Path $root $relative) -Destination $destination
}
$postgresImage = (& docker inspect status-db-1 --format '{{.Config.Image}}').Trim()
if ($LASTEXITCODE -ne 0) { throw 'The checked PostgreSQL image is required.' }
$nginxImage = (& docker inspect status-nginx-1 --format '{{.Config.Image}}').Trim()
if ($LASTEXITCODE -ne 0) { throw 'The checked Nginx image is required.' }
# Entirely synthetic settings. Do not load or copy the real ENV.
$backupPath = $backups.Replace('\','/')
$dataPath = $dataPlaceholder.Replace('\','/')
$environment = @"
APP_ENV=prod
COMPOSE_PROFILES=runtime
APP_PORT=30165
APP_BIND_ADDRESS=127.0.0.1
APP_PUBLIC_URL=https://ops-fixture.example.invalid
SESSION_COOKIE_SECURE=true
DB_DATA_DIR='$dataPath'
DB_PORT=30166
POSTGRES_DB=status_ops_fixture
POSTGRES_USER=fixture
POSTGRES_PASSWORD=ops-check-only
POSTGRES_IMAGE=$postgresImage
NGINX_IMAGE=$nginxImage
BACKEND_APP_IMAGE=status-backend:local
FRONTEND_APP_IMAGE=status-frontend:local
PDF_APP_IMAGE=status-pdf:local
BACKUP_DIR='$backupPath'
PLATFORM_BASE_URL=https://platform.example.test
PLATFORM_PROJECT_ID=11111111-1111-4111-8111-111111111111
PLATFORM_ENVIRONMENT_ID=22222222-2222-4222-8222-222222222222
PLATFORM_API_KEY=ops-check-only
PLATFORM_FILE_RETENTION_CODE=영구
PLATFORM_OIDC_ISSUER=https://issuer.example.test
PLATFORM_OIDC_CLIENT_ID=app
PLATFORM_OIDC_REDIRECT_URI=https://ops-fixture.example.invalid/callback
OIDC_POST_LOGOUT_REDIRECT_URI=https://ops-fixture.example.invalid/
"@
[IO.File]::WriteAllText($environmentFile, $environment, $utf8)
$checks = (Join-Path $root 'infra/checks').Replace('\','/').Replace("'", "''")
$override = @"
services:
  db:
    ports: !reset []
    volumes: !override
      - fixture-database:/var/lib/postgresql/data
  backend-runtime:
    command:
      - --status.ai-worker-enabled=false
      - --status.file-cleanup-enabled=false
      - --spring.security.oauth2.client.registration.platform.provider=ops-fixture
      - --spring.security.oauth2.client.provider.ops-fixture.authorization-uri=https://issuer.example.test/authorize
      - --spring.security.oauth2.client.provider.ops-fixture.token-uri=https://issuer.example.test/token
      - --spring.security.oauth2.client.provider.ops-fixture.jwk-set-uri=https://issuer.example.test/keys
      - --spring.security.oauth2.client.provider.ops-fixture.user-info-uri=https://issuer.example.test/userinfo
  nginx-runtime:
    ports: !reset []
  db-restore-check:
    volumes:
      - '$checks/restore-fixture.sql:/checks/restore-fixture.sql:ro'
volumes:
  fixture-database:
"@
[IO.File]::WriteAllText($overrideFile, $override, $utf8)

try {
    $configuration = (Invoke-Compose @('config', '--format', 'json')) -join "`n" | ConvertFrom-Json
    $services = @($configuration.services.PSObject.Properties.Name | Sort-Object)
    if (($services -join ',') -ne 'backend-runtime,db,frontend-runtime,nginx-runtime,pdf-runtime') {
        throw 'Runtime must select exactly the five production services.'
    }
    foreach ($role in @('backend-runtime','frontend-runtime','pdf-runtime')) {
        if ($configuration.services.$role.volumes) { throw 'Runtime app must not mount source or development caches.' }
        if ($configuration.services.$role.environment.TEST_DATABASE_URL) { throw 'Runtime must not contain test settings.' }
    }
    $started = $true
    Invoke-Compose @('up', '-d', '--wait', '--wait-timeout', '180') | Out-Null
    & docker run --rm --network ($project + '_default') --mount ('type=bind,source=' + (Join-Path $root 'infra/checks') + ',target=/checks,readonly') --entrypoint node status-frontend:local /checks/ops-runtime.mjs
    if ($LASTEXITCODE -ne 0) { throw 'The packaged runtime proxy failed.' }
    Invoke-Compose @('stop', 'backend-runtime') | Out-Null
    Get-Content -Raw -LiteralPath (Join-Path $root 'infra/checks/backup-fixture.sql') |
        & docker @arguments exec -T db psql -X -v ON_ERROR_STOP=1 -U fixture -d status_ops_fixture | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic backup fixtures failed.' }

    foreach ($attempt in 1..2) {
        Invoke-Compose @('--profile', 'ops', 'run', '--rm', '--no-deps', 'db-backup')
    }
    $archives = @(Get-ChildItem -LiteralPath $backups -Filter '*.dump')
    if ($archives.Count -ne 2) { throw 'Successive backups must be distinct.' }
    $archive = $archives[0].Name
    foreach ($file in $archives) {
        if (!(Test-Path -LiteralPath ($file.FullName + '.sha256'))) { throw 'A completed backup requires its checksum.' }
    }
    Invoke-Compose @('--profile', 'ops', 'run', '--rm', '--no-deps', '-e', ('BACKUP_FILE=' + $archive), 'db-restore-check')
    $badName = 'status-corrupt.dump'
    $badPath = Join-Path $backups $badName
    [IO.File]::WriteAllText($badPath, 'corrupted-check-only', $utf8)
    Copy-Item -LiteralPath (Join-Path $backups ($archive + '.sha256')) -Destination ($badPath + '.sha256')
    $failure = & docker @arguments --profile ops run --rm --no-deps -e ('BACKUP_FILE=' + $badName) db-restore-check 2>&1
    if ($LASTEXITCODE -eq 0 -or ($failure -join "`n") -notmatch 'Backup checksum mismatch') {
        throw 'Corrupt backups must be refused before the restore DB starts.'
    }
    Write-Output 'Corrupted archive was refused.'
    $sourceCount = (Invoke-Compose @('exec', '-T', 'db', 'psql', '-X', '-A', '-t', '-U', 'fixture', '-d', 'status_ops_fixture', '-c', 'SELECT count(*) FROM members')).Trim()
    if ($sourceCount -ne '1') { throw 'Restore check changed its source database.' }
    $configuration = (Invoke-Compose @('--profile', 'ops', 'config', '--format', 'json')) -join "`n" | ConvertFrom-Json
    if ($configuration.services.'db-restore-check'.network_mode -ne 'none' -or $configuration.services.'db-restore-check'.ports) {
        throw 'Restore check must be offline with no host ports.'
    }
    if ($configuration.services.'db-restore-check'.volumes | Where-Object { $_.target -eq '/var/lib/postgresql/data' }) {
        throw 'Restore check must not mount persistent database data.'
    }
    Write-Output 'Runtime Compose, independent backups, offline restore, hidden data and corruption rejection passed.'
} finally {
    if ($started) {
        # Only this invocation's randomly named synthetic project and its fixture volume.
        if ($project -notmatch '^status-ops-check-[a-f0-9]{32}$') { throw 'Unexpected fixture project.' }
        & docker @arguments --profile runtime --profile ops down --volumes --remove-orphans | Out-Null
    }
}
