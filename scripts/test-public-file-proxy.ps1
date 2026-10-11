$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$checksDirectory = Join-Path $projectRoot 'infra/checks'
$nginxConfig = Join-Path $projectRoot 'infra/nginx/default.conf'
$networkName = 'status-public-file-check-' + [guid]::NewGuid().ToString('N')
$ownedContainers = @()
$networkCreated = $false

function Invoke-Docker([string[]]$Arguments) {
    $result = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Public file proxy check failed.' }
    return $result
}

try {
    $nodeImage = (Invoke-Docker @('inspect', 'status-frontend-1', '--format', '{{.Config.Image}}')).Trim()
    $nginxImage = (Invoke-Docker @('inspect', 'status-nginx-1', '--format', '{{.Config.Image}}')).Trim()
    Invoke-Docker @('network', 'create', $networkName) | Out-Null
    $networkCreated = $true
    # Synthetic cookies and isolated HTTP stubs; no project ENV or real account is used.
    $upstreamId = (Invoke-Docker @('run', '-d', '--network', $networkName,
        '--network-alias', 'backend', '--network-alias', 'frontend',
        '--mount', ('type=bind,source=' + $checksDirectory + ',target=/checks,readonly'),
        $nodeImage, 'node', '/checks/public-file-proxy.mjs', 'upstream')).Trim()
    $ownedContainers += $upstreamId
    $nginxId = (Invoke-Docker @('run', '-d', '--network', $networkName,
        '--network-alias', 'proxy',
        '--mount', ('type=bind,source=' + $nginxConfig + ',target=/etc/nginx/conf.d/default.conf,readonly'),
        $nginxImage)).Trim()
    $ownedContainers += $nginxId
    Invoke-Docker @('exec', $nginxId, 'nginx', '-t') | Out-Null
    Invoke-Docker @('run', '--rm', '--network', $networkName,
        '--mount', ('type=bind,source=' + $checksDirectory + ',target=/checks,readonly'),
        $nodeImage, 'node', '/checks/public-file-proxy.mjs', 'check', 'http://proxy')
} finally {
    foreach ($containerId in $ownedContainers) {
        if ($containerId -notmatch '^[a-f0-9]{64}$') { throw 'Unexpected fixture container ID.' }
        & docker rm --force $containerId | Out-Null
    }
    if ($networkCreated) { & docker network rm $networkName | Out-Null }
}
