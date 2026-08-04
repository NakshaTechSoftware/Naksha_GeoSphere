#Requires -Version 5.1
<#
.SYNOPSIS
    Naksha GeoSphere - automated local health check (Windows PowerShell).

.DESCRIPTION
    Assumes the dev stack is already running:
      docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d
#>

$ErrorActionPreference = "Continue"

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

$envPath = Join-Path $RootDir ".env"
if (-not (Test-Path $envPath)) {
    Write-Error "ERROR: .env not found. Run scripts\bootstrap.ps1 first."
    exit 1
}

$envVars = @{}
Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
        $envVars[$Matches[1]] = $Matches[2]
    }
}

function Get-EnvVar {
    param([string]$Name, [string]$Default)
    if ($envVars.ContainsKey($Name) -and $envVars[$Name]) { return $envVars[$Name] }
    return $Default
}

$composeArgs = @("-f", "compose.yaml", "-f", "compose.local-storage.yaml", "-f", "compose.local-storage.dev.yaml", "-f", "compose.dev.yaml")
$webPort = Get-EnvVar "WEB_HOST_PORT" "3000"
$apiPort = Get-EnvVar "API_HOST_PORT" "8000"
$minioPort = Get-EnvVar "MINIO_API_HOST_PORT" "9000"
$mailpitPort = Get-EnvVar "MAILPIT_UI_HOST_PORT" "8025"
$postgresUser = Get-EnvVar "POSTGRES_USER" "naksha_app"
$postgresDb = Get-EnvVar "POSTGRES_DB" "naksha_geosphere"
$minioAccessKey = Get-EnvVar "MINIO_ACCESS_KEY" ""
$minioSecretKey = Get-EnvVar "MINIO_SECRET_KEY" ""
$bucketSource = Get-EnvVar "S3_BUCKET_SOURCE_DATA" "geosphere-source-data"
$bucketPreview = Get-EnvVar "S3_BUCKET_PREVIEW_DATA" "geosphere-preview-data"
$bucketOutput = Get-EnvVar "S3_BUCKET_ORDER_OUTPUT" "geosphere-order-output"
$bucketTemp = Get-EnvVar "S3_BUCKET_TEMPORARY_DATA" "geosphere-temporary-data"

$pass = 0
$fail = 0

function Invoke-Check {
    param(
        [string]$Name,
        [scriptblock]$Action
    )
    $label = $Name.PadRight(48)
    Write-Host -NoNewline "  $label"
    try {
        & $Action *> $env:TEMP\naksha-health-check.log
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            Write-Host "OK" -ForegroundColor Green
            $script:pass++
        } else {
            Write-Host "FAIL" -ForegroundColor Red
            $script:fail++
        }
    } catch {
        Write-Host "FAIL" -ForegroundColor Red
        $script:fail++
    }
}

Write-Host "==> Naksha GeoSphere health check" -ForegroundColor Cyan
Write-Host ""
Write-Host "Container status:"
docker compose @composeArgs ps
Write-Host ""
Write-Host "Checks:"

Invoke-Check "Frontend reachable (:$webPort)" {
    Invoke-WebRequest -Uri "http://localhost:$webPort" -UseBasicParsing -TimeoutSec 5 | Out-Null
}

Invoke-Check "API root (:$apiPort/)" {
    Invoke-WebRequest -Uri "http://localhost:$apiPort/" -UseBasicParsing -TimeoutSec 5 | Out-Null
}

Invoke-Check "API liveness (/api/v1/health/live)" {
    Invoke-WebRequest -Uri "http://localhost:$apiPort/api/v1/health/live" -UseBasicParsing -TimeoutSec 5 | Out-Null
}

Invoke-Check "API readiness (/api/v1/health/ready)" {
    Invoke-WebRequest -Uri "http://localhost:$apiPort/api/v1/health/ready" -UseBasicParsing -TimeoutSec 5 -SkipHttpErrorCheck | Out-Null
}

Invoke-Check "PostgreSQL accepts connections" {
    docker compose @composeArgs exec -T postgres pg_isready -U $postgresUser -d $postgresDb
    if ($LASTEXITCODE -ne 0) { throw "pg_isready failed" }
}

Invoke-Check "PostGIS extension enabled" {
    docker compose @composeArgs exec -T postgres psql -U $postgresUser -d $postgresDb -c "SELECT PostGIS_Version();"
    if ($LASTEXITCODE -ne 0) { throw "PostGIS query failed" }
}

Invoke-Check "Redis responds to PING" {
    docker compose @composeArgs exec -T redis redis-cli ping
    if ($LASTEXITCODE -ne 0) { throw "redis-cli ping failed" }
}

Invoke-Check "MinIO liveness endpoint" {
    Invoke-WebRequest -Uri "http://localhost:$minioPort/minio/health/live" -UseBasicParsing -TimeoutSec 5 | Out-Null
}

Invoke-Check "Required MinIO buckets exist" {
    docker compose @composeArgs exec -T minio mc alias set local http://localhost:9000 $minioAccessKey $minioSecretKey
    if ($LASTEXITCODE -ne 0) { throw "mc alias set failed" }
    foreach ($bucket in @($bucketSource, $bucketPreview, $bucketOutput, $bucketTemp)) {
        docker compose @composeArgs exec -T minio mc ls "local/$bucket"
        if ($LASTEXITCODE -ne 0) { throw "bucket $bucket missing" }
    }
}

Invoke-Check "Celery worker responds to ping" {
    docker compose @composeArgs exec -T worker celery -A worker.main inspect ping
    if ($LASTEXITCODE -ne 0) { throw "celery inspect ping failed" }
}

Invoke-Check "Mailpit UI reachable (:$mailpitPort)" {
    Invoke-WebRequest -Uri "http://localhost:$mailpitPort" -UseBasicParsing -TimeoutSec 5 | Out-Null
}

Write-Host ""
Write-Host "==> $pass passed, $fail failed"

if ($fail -gt 0) {
    exit 1
}
