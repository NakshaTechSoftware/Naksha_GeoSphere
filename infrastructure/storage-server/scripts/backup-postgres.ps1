#Requires -Version 5.1
<#
.SYNOPSIS
    Naksha GeoSphere storage server - PostgreSQL backup (Windows PowerShell).

.DESCRIPTION
    Runs pg_dump (custom format, compressed) inside the running postgres
    container for project naksha-geosphere-storage, writing the result to
    E:\Naksha_GeoSphere_Storage\backups\ with a timestamped filename.
    Read-only against the database - does not touch any other project.
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

$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
        $envVars[$Matches[1]] = $Matches[2]
    }
}
$pgDb   = if ($envVars.ContainsKey("POSTGRES_DB") -and $envVars["POSTGRES_DB"]) { $envVars["POSTGRES_DB"] } else { "naksha_geosphere" }
$pgUser = if ($envVars.ContainsKey("POSTGRES_USER") -and $envVars["POSTGRES_USER"]) { $envVars["POSTGRES_USER"] } else { "geosphere_app" }

$composeArgs = @("-p", $ProjectName, "--env-file", ".env.storage", "-f", "compose.storage.yaml")

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "naksha_geosphere_${timestamp}.dump"
$containerPath = "/backups/$backupFile"
$hostPath = "E:\Naksha_GeoSphere_Storage\backups\$backupFile"

Write-Host "==> Backing up database '$pgDb' to $hostPath" -ForegroundColor Cyan

docker compose @composeArgs exec -T postgres pg_dump -U $pgUser -d $pgDb -F c -f $containerPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump failed."
    exit 1
}

if (Test-Path $hostPath) {
    $size = (Get-Item $hostPath).Length
    Write-Host "==> Backup complete: $hostPath ($size bytes)" -ForegroundColor Green
} else {
    Write-Error "pg_dump reported success but the expected output file was not found at $hostPath."
    exit 1
}

Write-Host ""
Write-Host "To restore this backup:"
Write-Host "  .\scripts\restore-postgres.ps1 -BackupFile $backupFile"
