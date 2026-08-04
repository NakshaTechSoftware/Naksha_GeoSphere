#Requires -Version 5.1
<#
.SYNOPSIS
    Naksha GeoSphere storage server - restart (Windows PowerShell).

.DESCRIPTION
    Restarts ONLY this project's containers in place (project:
    naksha-geosphere-storage) via `docker compose restart` - does not
    recreate containers, does not touch volumes, does not touch any
    other Docker project.
#>

$ErrorActionPreference = "Stop"

$StorageDir = Split-Path -Parent $PSScriptRoot
Set-Location $StorageDir

$ProjectName = "naksha-geosphere-storage"
$EnvFile = Join-Path $StorageDir ".env.storage"

if (-not (Test-Path $EnvFile)) {
    Write-Error "ERROR: .env.storage not found at $EnvFile."
    exit 1
}

Write-Host "==> Restarting Naksha GeoSphere storage server (project: $ProjectName)" -ForegroundColor Cyan

docker compose -p $ProjectName --env-file .env.storage -f compose.storage.yaml restart

Write-Host ""
Write-Host "==> Restarted. Container status:" -ForegroundColor Green
docker compose -p $ProjectName --env-file .env.storage -f compose.storage.yaml ps
