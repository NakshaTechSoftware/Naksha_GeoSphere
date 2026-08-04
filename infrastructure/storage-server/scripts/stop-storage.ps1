#Requires -Version 5.1
<#
.SYNOPSIS
    Naksha GeoSphere storage server - stop (Windows PowerShell).

.DESCRIPTION
    Stops ONLY this project's containers (project: naksha-geosphere-storage).
    Does NOT remove volumes/data (no `-v`), and never touches any other
    Docker project, container, network, or volume on this machine.
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

Write-Host "==> Stopping Naksha GeoSphere storage server (project: $ProjectName)" -ForegroundColor Cyan
Write-Host "    Data under E:\Naksha_GeoSphere_Storage is left untouched." -ForegroundColor Cyan

docker compose -p $ProjectName --env-file .env.storage -f compose.storage.yaml down

Write-Host ""
Write-Host "==> Stopped." -ForegroundColor Green
