#Requires -Version 5.1
<#
.SYNOPSIS
    Naksha GeoSphere - DESTRUCTIVE local reset (Windows PowerShell).

.DESCRIPTION
    Stops the local stack and deletes ONLY this project's named Docker
    volumes (postgres-data, minio-data) and locally built images. Never
    touches any other Docker project, container, image, or volume, and
    never touches anything outside this repository. Requires typed
    confirmation and never runs unattended.
#>

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "================================================================" -ForegroundColor Yellow
Write-Host " WARNING: Naksha GeoSphere local reset" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "This will:"
Write-Host "  - Stop all Naksha GeoSphere containers (compose project: naksha_geosphere)"
Write-Host "  - Permanently DELETE the local PostgreSQL data volume"
Write-Host "  - Permanently DELETE the local MinIO data volume"
Write-Host "  - Remove locally built Naksha GeoSphere images for this project"
Write-Host ""
Write-Host "It will NOT touch:"
Write-Host "  - Any other Docker project, container, image, or volume on this machine"
Write-Host "  - Anything outside this repository"
Write-Host ""
Write-Host "This action cannot be undone. Local database contents and locally"
Write-Host "uploaded/staged objects will be lost."
Write-Host "================================================================" -ForegroundColor Yellow

$confirm = Read-Host "Type RESET (all caps) to continue, anything else cancels"
if ($confirm -ne "RESET") {
    Write-Host "Aborted - nothing was changed."
    exit 1
}

Write-Host "--> Stopping stack and removing this project's volumes and local images..."
docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml down --volumes --remove-orphans --rmi local

Write-Host ""
Write-Host "--> Reset complete."
Write-Host "    Run scripts\bootstrap.ps1 if you need a fresh .env, then:"
Write-Host "    docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d"
