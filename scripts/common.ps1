# Shared helpers within this project; copied with each project's own scripts.
$ErrorActionPreference = 'Stop'
$script:ProjectRoot = Split-Path -Parent $PSScriptRoot

function Read-EnvFile([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        if (!$line.Trim() -or $line.Trim().StartsWith('#')) { continue }
        if ($line -notmatch '^([A-Z][A-Z0-9_]*)=(.*)$') { throw 'Unsupported ENV line. Use KEY=value.' }
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        if ($values.ContainsKey($name)) { throw ('Duplicate ENV variable: ' + $name) }
        if ($value.StartsWith("'") -or $value.StartsWith('"')) {
            $quote = $value.Substring(0,1)
            $last = $value.LastIndexOf($quote)
            if ($last -lt 1 -or ($value.Substring($last + 1).Trim() -and !$value.Substring($last + 1).Trim().StartsWith('#'))) {
                throw ('Invalid quoted ENV variable: ' + $name)
            }
            $value = $value.Substring(1, $last - 1)
            if ($quote -eq '"' -and $value -match '[\\$]') { throw ('Use single quotes for literal backslash or dollar: ' + $name) }
        } else {
            $value = ($value -split '\s+#', 2)[0].TrimEnd()
            if ($value.Contains('$')) { throw ('Use single quotes for literal dollar: ' + $name) }
        }
        $values[$name] = $value
    }
    return $values
}

$script:ProjectSettings = Read-EnvFile (Join-Path $PSScriptRoot 'project.conf')

function Get-SettingsList([string]$Name) {
    return @($script:ProjectSettings[$Name] -split '\s+' | Where-Object { $_ })
}

function Set-PrivateFile([string]$Path) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl = if (Test-Path -LiteralPath $Path -PathType Container) {
        [Security.AccessControl.DirectorySecurity]::new()
    } else { [Security.AccessControl.FileSecurity]::new() }
    $acl.SetAccessRuleProtection($true,$false)
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Assert-Environment([hashtable]$Values, [string]$EnvironmentName, [switch]$HostPaths) {
    foreach ($name in $Values.Keys) {
        if (Test-Path ('Env:' + $name)) { throw ('Shell variable overrides ENV file: ' + $name) }
    }
    $required = @(Get-SettingsList 'REQUIRED_ENV')
    $required += @(Get-SettingsList $(if ($EnvironmentName -eq 'prod') {'PROD_REQUIRED_ENV'} else {'NONPROD_REQUIRED_ENV'}))
    foreach ($name in $required) {
        if ([string]::IsNullOrWhiteSpace($Values[$name])) { throw ('Required ENV variable: ' + $name) }
    }
    if ($Values['APP_ENV'] -ne $EnvironmentName) { throw 'APP_ENV does not match the selected environment.' }
    $profile = $script:ProjectSettings[$(if ($EnvironmentName -eq 'prod') {'PROD_PROFILE'} else {'DEV_PROFILE'})]
    if ($Values['COMPOSE_PROFILES'] -ne $profile) { throw 'COMPOSE_PROFILES does not match APP_ENV.' }
    if ([string]::IsNullOrWhiteSpace($Values['ADMIN_OIDC_ISSUER']) -ne [string]::IsNullOrWhiteSpace($Values['ADMIN_OIDC_SUBJECT'])) {
        throw 'Both ADMIN_OIDC values must be set together.'
    }
    foreach ($name in @('PLATFORM_PROJECT_ID','PLATFORM_ENVIRONMENT_ID')) {
        $parsed = [guid]::Empty
        if (![guid]::TryParse($Values[$name], [ref]$parsed)) { throw ('Invalid UUID: ' + $name) }
    }
    foreach ($name in @('APP_PORT','DB_PORT')) {
        $port = 0
        if (![int]::TryParse($Values[$name], [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw ('Invalid port: ' + $name) }
    }
    $origin = [uri]$Values['APP_PUBLIC_URL']
    if (!$origin.IsAbsoluteUri -or $origin.Scheme -notin @('http','https') -or $origin.UserInfo -or $origin.AbsolutePath -notin @('','/') -or $origin.Query -or $origin.Fragment) { throw 'Invalid APP_PUBLIC_URL.' }
    foreach ($name in @('PLATFORM_OIDC_REDIRECT_URI','OIDC_POST_LOGOUT_REDIRECT_URI')) {
        $redirect = [uri]$Values[$name]
        if (!$redirect.IsAbsoluteUri -or $redirect.Scheme -ne $origin.Scheme -or $redirect.Authority -ne $origin.Authority -or $redirect.UserInfo -or $redirect.Query -or $redirect.Fragment) {
            throw ('Redirect origin must match APP_PUBLIC_URL: ' + $name)
        }
    }
    if (([uri]$Values['PLATFORM_OIDC_REDIRECT_URI']).AbsolutePath -ne '/callback') { throw 'Callback must use /callback.' }
    if ($Values['SESSION_COOKIE_SECURE'] -notin @('true','false')) { throw 'Invalid SESSION_COOKIE_SECURE.' }
    if (($origin.Scheme -eq 'https' -and $Values['SESSION_COOKIE_SECURE'] -ne 'true') -or ($EnvironmentName -eq 'prod' -and $origin.Scheme -ne 'https')) {
        throw 'HTTPS and secure session cookies are required together.'
    }
    if ($EnvironmentName -eq 'prod') {
        foreach ($name in @('BACKEND_APP_IMAGE','FRONTEND_APP_IMAGE','PDF_APP_IMAGE')) {
            if ($Values[$name] -notmatch '.+/.+(:[^/]+|@sha256:[a-f0-9]+)$' -or $Values[$name] -match ':(local|latest)$') {
                throw ('Production requires a release registry image: ' + $name)
            }
        }
    }
    if ($HostPaths) {
        $directories = @(Get-SettingsList 'BASE_DIRECTORIES')
        $directories += @(Get-SettingsList $(if ($EnvironmentName -eq 'prod') {'PROD_DIRECTORIES'} else {'NONPROD_DIRECTORIES'}))
        if ($Values['BACKUP_DIR'] -and $directories -notcontains 'BACKUP_DIR') { $directories += 'BACKUP_DIR' }
        foreach ($name in $directories) {
            if (![IO.Path]::IsPathFullyQualified($Values[$name]) -or !(Test-Path -LiteralPath $Values[$name] -PathType Container)) {
                throw ('Existing absolute directory required: ' + $name)
            }
        }
        if ($Values['BACKUP_DIR']) {
            $dataPath = [IO.Path]::GetFullPath($Values['DB_DATA_DIR']).TrimEnd('\','/')
            $backupPath = [IO.Path]::GetFullPath($Values['BACKUP_DIR']).TrimEnd('\','/')
            if ($backupPath -eq $dataPath -or $backupPath.StartsWith($dataPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
                throw 'BACKUP_DIR must be outside DB_DATA_DIR.'
            }
        }
    }
}

function Invoke-ProjectCompose([string]$EnvFile, [string[]]$Arguments, [string]$Profile) {
    Push-Location $script:ProjectRoot
    try {
        $compose = @('compose')
        & docker compose version 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required.' }
        $compose += @('--env-file',$EnvFile,'-f',$script:ProjectSettings['COMPOSE_FILE'])
        if ($Profile) { $compose += @('--profile',$Profile) }
        $result = & docker @compose @Arguments 2>&1
        if ($LASTEXITCODE -ne 0) { throw ('Compose ' + $Arguments[0] + ' failed. Raw output was withheld to protect ENV values.') }
        return $result
    } finally { Pop-Location }
}

function Get-SelectedServices([string[]]$Requested, [string[]]$Allowed) {
    if (!$Requested) { return $Allowed }
    foreach ($name in $Requested) {
        if ($Allowed -notcontains $name) { throw ('Unknown service: ' + $name) }
    }
    return $Requested
}

function Hide-EnvSecrets([string]$Text, [hashtable]$Values) {
    foreach ($name in $Values.Keys) {
        if ($name -match 'PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|SUBJECT' -and $Values[$name]) {
            $Text = $Text.Replace($Values[$name], '[REDACTED]')
        }
    }
    return $Text
}
