#Requires -Version 5.1
<#
.SYNOPSIS
    Naksha GeoSphere storage server - start (Windows PowerShell).

.DESCRIPTION
    Starts ONLY this project's PostgreSQL/PostGIS, Redis, and object
    storage containers, under the fixed Compose project name
    "naksha-geosphere-storage". Never touches any other Docker project
    on this machine.
#>

$ErrorActionPreference = "Stop"

$StorageDir = Split-Path -Parent $PSScriptRoot
Set-Location $StorageDir

$ProjectName = "naksha-geosphere-storage"
$EnvFile = Join-Path $StorageDir ".env.storage"

if (-not (Test-Path $EnvFile)) {
    Write-Error "ERROR: .env.storage not found at $EnvFile. Copy .env.storage.example to .env.storage and fill in real values first."
    exit 1
}

Write-Host "==> Starting Naksha GeoSphere storage server (project: $ProjectName)" -ForegroundColor Cyan

docker compose -p $ProjectName --env-file .env.storage -f compose.storage.yaml up -d
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose up failed."
    exit 1
}

Write-Host ""
Write-Host "==> Started. Container status:" -ForegroundColor Green
docker compose -p $ProjectName --env-file .env.storage -f compose.storage.yaml ps

Write-Host ""
Write-Host "Run .\scripts\check-storage.ps1 to validate the stack."
