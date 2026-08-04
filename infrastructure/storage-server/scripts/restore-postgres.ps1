#Requires -Version 5.1
<#
.SYNOPSIS
    Naksha GeoSphere storage server - PostgreSQL restore (Windows PowerShell).

.DESCRIPTION
    DESTRUCTIVE: restores a pg_dump backup into the current database,
    dropping and recreating existing objects. Requires an explicit typed
    confirmation. Only ever touches the naksha_geosphere database inside
    the naksha-geosphere-storage project - never any other project.

.PARAMETER BackupFile
    Filename (not full path) of a .dump file under
    E:\Naksha_GeoSphere_Storage\backups\, e.g. naksha_geosphere_20260803_120000.dump
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"

$StorageDir = Split-Path -Parent $PSScriptRoot
Set-Location $StorageDir

$ProjectName = "naksha-geosphere-storage"
$EnvFile = Join-Path $StorageDir ".env.storage"

if (-not (Test-Path $EnvFile)) {
    Write-Error "ERROR: .env.storage not found at $EnvFile."
    exit 1
}

$hostPath = "E:\Naksha_GeoSphere_Storage\backups\$BackupFile"
if (-not (Test-Path $hostPath)) {
    Write-Error "ERROR: backup file not found: $hostPath"
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

Write-Host "================================================================" -ForegroundColor Yellow
Write-Host " WARNING: Naksha GeoSphere storage server - PostgreSQL restore" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "This will DROP and RECREATE objects in database '$pgDb'"
Write-Host "using backup file: $BackupFile"
Write-Host ""
Write-Host "All current data in '$pgDb' not present in the backup will be lost."
Write-Host "This does not affect any other database, project, or container."
Write-Host "================================================================" -ForegroundColor Yellow

$confirm = Read-Host "Type RESTORE (all caps) to continue, anything else cancels"
if ($confirm -ne "RESTORE") {
    Write-Host "Aborted - nothing was changed."
    exit 1
}

$composeArgs = @("-p", $ProjectName, "--env-file", ".env.storage", "-f", "compose.storage.yaml")
$containerPath = "/backups/$BackupFile"

Write-Host "--> Restoring..."
docker compose @composeArgs exec -T postgres pg_restore --clean --if-exists -U $pgUser -d $pgDb $containerPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_restore reported an error - review the output above."
    exit 1
}

Write-Host ""
Write-Host "==> Restore complete." -ForegroundColor Green
