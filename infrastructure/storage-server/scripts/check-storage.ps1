#Requires -Version 5.1
<#
.SYNOPSIS
    Naksha GeoSphere storage server - health check (Windows PowerShell).

.DESCRIPTION
    Validates ONLY this project's containers (project:
    naksha-geosphere-storage). Never inspects or modifies unrelated
    Docker projects, containers, networks, or volumes on this machine.

    Checks:
      1. PostgreSQL container health
      2. PostgreSQL connection
      3. PostGIS availability
      4. pgcrypto availability
      5. Redis authenticated ping
      6. Object-storage health
      7. All four private buckets
      8. Host-port bindings
      9. Bind-mounted E: drive paths
      10. No unexpected Naksha GeoSphere services are running
#>

$ErrorActionPreference = "Continue"

$StorageDir = Split-Path -Parent $PSScriptRoot
Set-Location $StorageDir

$ProjectName = "naksha-geosphere-storage"
$EnvFile = Join-Path $StorageDir ".env.storage"

if (-not (Test-Path $EnvFile)) {
    Write-Error "ERROR: .env.storage not found at $EnvFile. Run start-storage.ps1 first (or copy .env.storage.example)."
    exit 1
}

# --- Parse .env.storage (KEY=VALUE, ignoring comments/blank lines) ----
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
        $envVars[$Matches[1]] = $Matches[2]
    }
}
function Get-EnvVar {
    param([string]$Name, [string]$Default = "")
    if ($envVars.ContainsKey($Name) -and $envVars[$Name]) { return $envVars[$Name] }
    return $Default
}

$storageIp     = Get-EnvVar "STORAGE_SERVER_IP" "192.168.10.81"
$pgPort        = Get-EnvVar "POSTGRES_HOST_PORT" "5544"
$pgDb          = Get-EnvVar "POSTGRES_DB" "naksha_geosphere"
$pgUser        = Get-EnvVar "POSTGRES_USER" "geosphere_app"
$redisPort     = Get-EnvVar "REDIS_HOST_PORT" "6390"
$redisPassword = Get-EnvVar "REDIS_PASSWORD"
$s3ApiPort     = Get-EnvVar "S3_API_HOST_PORT" "9010"
$s3ConsolePort = Get-EnvVar "S3_CONSOLE_HOST_PORT" "9011"
$s3AccessKey   = Get-EnvVar "S3_ACCESS_KEY"
$s3SecretKey   = Get-EnvVar "S3_SECRET_KEY"
$bucketSource  = Get-EnvVar "S3_SOURCE_BUCKET" "geosphere-source-data"
$bucketPreview = Get-EnvVar "S3_PREVIEW_BUCKET" "geosphere-preview-data"
$bucketOrder   = Get-EnvVar "S3_ORDER_BUCKET" "geosphere-order-output"
$bucketTemp    = Get-EnvVar "S3_TEMPORARY_BUCKET" "geosphere-temporary-data"

$composeArgs = @("-p", $ProjectName, "--env-file", ".env.storage", "-f", "compose.storage.yaml")

$pass = 0
$fail = 0

function Invoke-Check {
    param([string]$Name, [scriptblock]$Action)
    $label = $Name.PadRight(46)
    Write-Host -NoNewline "  $label"
    try {
        & $Action
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            Write-Host "OK" -ForegroundColor Green
            $script:pass++
        } else {
            Write-Host "FAIL" -ForegroundColor Red
            $script:fail++
        }
    } catch {
        Write-Host "FAIL ($($_.Exception.Message))" -ForegroundColor Red
        $script:fail++
    }
}

Write-Host "==> Naksha GeoSphere storage server health check (project: $ProjectName)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Container status:"
docker compose @composeArgs ps
Write-Host ""
Write-Host "Checks:"

# 1. PostgreSQL container health
Invoke-Check "1. PostgreSQL container health" {
    $health = docker inspect --format '{{.State.Health.Status}}' naksha-geosphere-storage-postgres 2>$null
    if ($health -ne "healthy") { throw "status: $health" }
}

# 2. PostgreSQL connection
Invoke-Check "2. PostgreSQL connection" {
    docker compose @composeArgs exec -T postgres pg_isready -U $pgUser -d $pgDb
    if ($LASTEXITCODE -ne 0) { throw "pg_isready failed" }
}

# 3. PostGIS availability
Invoke-Check "3. PostGIS availability" {
    docker compose @composeArgs exec -T postgres psql -U $pgUser -d $pgDb -tAc "SELECT PostGIS_Version();"
    if ($LASTEXITCODE -ne 0) { throw "PostGIS query failed" }
}

# 4. pgcrypto availability
Invoke-Check "4. pgcrypto availability" {
    $result = docker compose @composeArgs exec -T postgres psql -U $pgUser -d $pgDb -tAc "SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';"
    if ($LASTEXITCODE -ne 0 -or -not ($result -match "pgcrypto")) { throw "pgcrypto extension not found" }
}

# 5. Redis authenticated ping
Invoke-Check "5. Redis authenticated ping" {
    $result = docker compose @composeArgs exec -T redis redis-cli --no-auth-warning -a $redisPassword ping
    if ($LASTEXITCODE -ne 0 -or -not ($result -match "PONG")) { throw "redis ping failed" }
}

# 6. Object-storage health
Invoke-Check "6. Object-storage health" {
    Invoke-WebRequest -Uri "http://${storageIp}:${s3ApiPort}/minio/health/live" -UseBasicParsing -TimeoutSec 5 | Out-Null
}

# 7. All four private buckets
Invoke-Check "7. Required private buckets exist" {
    docker compose @composeArgs exec -T minio mc alias set local http://localhost:9000 $s3AccessKey $s3SecretKey
    if ($LASTEXITCODE -ne 0) { throw "mc alias set failed" }
    foreach ($bucket in @($bucketSource, $bucketPreview, $bucketOrder, $bucketTemp)) {
        docker compose @composeArgs exec -T minio mc ls "local/$bucket"
        if ($LASTEXITCODE -ne 0) { throw "bucket $bucket missing" }
    }
}

# 8. Host-port bindings
Invoke-Check "8. Host-port bindings (IP-scoped, not 0.0.0.0)" {
    $ports = docker compose @composeArgs ps --format json | ConvertFrom-Json
    $bound = docker port naksha-geosphere-storage-postgres 2>$null
    if (-not $bound -or -not ($bound -match [regex]::Escape($storageIp))) {
        throw "postgres is not bound to $storageIp"
    }
}

# 9. Bind-mounted E: drive paths
Invoke-Check "9. Bind-mounted E: drive paths exist" {
    $paths = @(
        "E:\Naksha_GeoSphere_Storage\data\postgres",
        "E:\Naksha_GeoSphere_Storage\data\redis",
        "E:\Naksha_GeoSphere_Storage\data\object-storage",
        "E:\Naksha_GeoSphere_Storage\backups",
        "E:\Naksha_GeoSphere_Storage\logs"
    )
    foreach ($p in $paths) {
        if (-not (Test-Path $p)) { throw "missing: $p" }
    }
}

# 10. No unexpected Naksha GeoSphere services are running
Invoke-Check "10. No unexpected services running" {
    $expected = @("naksha-geosphere-storage-postgres", "naksha-geosphere-storage-redis", "naksha-geosphere-storage-minio")
    $running = docker ps --filter "label=com.docker.compose.project=$ProjectName" --format "{{.Names}}"
    $unexpected = $running | Where-Object { $_ -and ($expected -notcontains $_) -and ($_ -ne "naksha-geosphere-storage-minio-init") }
    if ($unexpected) { throw "unexpected containers running: $($unexpected -join ', ')" }
    foreach ($svc in $expected) {
        if ($running -notcontains $svc) { throw "expected service not running: $svc" }
    }
}

Write-Host ""
Write-Host "==> $pass passed, $fail failed"

if ($fail -gt 0) {
    exit 1
}
