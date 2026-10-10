$ErrorActionPreference = 'Stop'
$checksDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'infra/checks'
$fixtureSuffix = [guid]::NewGuid().ToString('N')
$networkName = 'status-image-check-' + $fixtureSuffix
$dbName = 'status-image-db-' + $fixtureSuffix
$backendName = 'status-image-backend-' + $fixtureSuffix
$ownedContainers = @()
$networkCreated = $false
$backendId = $null

function Invoke-Docker([string[]]$Arguments) {
    $result = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker image check command failed.' }
    return $result
}

try {
    $postgresImage = (Invoke-Docker @('inspect', 'status-db-1', '--format', '{{.Config.Image}}')).Trim()
    Invoke-Docker @('network', 'create', $networkName) | Out-Null
    $networkCreated = $true
    $dbId = (Invoke-Docker @('run', '-d', '--network', $networkName, '--name', $dbName,
        '-e', 'POSTGRES_DB=status_image_test', '-e', 'POSTGRES_USER=fixture',
        '-e', 'POSTGRES_PASSWORD=image-check-only', $postgresImage)).Trim()
    $ownedContainers += $dbId

    # Entirely synthetic settings and an isolated database. No local ENV or platform key is loaded.
    $arguments = @('run', '-d', '--network', $networkName, '--name', $backendName,
        '-e', 'APP_ENV=prod', '-e', 'APP_PUBLIC_URL=https://image-fixture.example.invalid',
        '-e', ('DATABASE_URL=jdbc:postgresql://' + $dbName + ':5432/status_image_test'),
        '-e', 'DATABASE_USER=fixture', '-e', 'DATABASE_PASSWORD=image-check-only',
        '-e', 'PLATFORM_BASE_URL=https://platform.example.test',
        '-e', 'PLATFORM_PROJECT_ID=11111111-1111-4111-8111-111111111111',
        '-e', 'PLATFORM_ENVIRONMENT_ID=22222222-2222-4222-8222-222222222222',
        '-e', 'PLATFORM_API_KEY=image-check-only',
        '-e', 'PLATFORM_FILE_RETENTION_CODE=영구',
        '-e', 'PLATFORM_OIDC_ISSUER=https://issuer.example.test',
        '-e', 'PLATFORM_OIDC_CLIENT_ID=app',
        '-e', 'PLATFORM_OIDC_REDIRECT_URI=https://image-fixture.example.invalid/callback',
        '-e', 'OIDC_POST_LOGOUT_REDIRECT_URI=https://image-fixture.example.invalid/',
        '-e', 'SESSION_COOKIE_SECURE=true',
        'status-backend:local',
        '--status.ai-worker-enabled=false',
        '--spring.security.oauth2.client.registration.platform.provider=image-fixture',
        '--spring.security.oauth2.client.provider.image-fixture.authorization-uri=https://issuer.example.test/authorize',
        '--spring.security.oauth2.client.provider.image-fixture.token-uri=https://issuer.example.test/token',
        '--spring.security.oauth2.client.provider.image-fixture.jwk-set-uri=https://issuer.example.test/keys',
        '--spring.security.oauth2.client.provider.image-fixture.user-info-uri=https://issuer.example.test/userinfo')
    $backendId = (Invoke-Docker $arguments).Trim()
    $ownedContainers += $backendId
    $backendUser = (Invoke-Docker @('inspect', $backendId, '--format', '{{.Config.User}}')).Trim()
    if ($backendUser -ne '10001:10001') { throw 'Backend image user is incorrect.' }
    Invoke-Docker @('run', '--rm', '--network', $networkName,
        '-e', ('BACKEND_CHECK_ORIGIN=http://' + $backendName + ':8080'),
        '--mount', ('type=bind,source=' + $checksDirectory + ',target=/checks,readonly'),
        '--entrypoint', 'node', 'status-frontend:local', '/checks/backend-image.mjs')

    foreach ($role in @('frontend', 'pdf')) {
        Invoke-Docker @('run', '--rm', '--mount', ('type=bind,source=' + $checksDirectory + ',target=/checks,readonly'),
            '--entrypoint', 'node', ('status-' + $role + ':local'), '/checks/image-runtime.mjs', $role)
    }
    Write-Output 'All three packaged images passed isolated runtime checks.'
} catch {
    if ($backendId) { & docker logs --tail 60 $backendId }
    throw
} finally {
    # Remove only the exact container IDs and private network created by this invocation.
    foreach ($containerId in $ownedContainers) {
        if ($containerId -notmatch '^[a-f0-9]{64}$') { throw 'Unexpected fixture container ID.' }
        & docker rm --force --volumes $containerId | Out-Null
    }
    if ($networkCreated) { & docker network rm $networkName | Out-Null }
}
