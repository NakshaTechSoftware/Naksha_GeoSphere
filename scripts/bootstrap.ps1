#Requires -Version 5.1
<#
.SYNOPSIS
    Naksha GeoSphere - local development bootstrap (Windows PowerShell).

.DESCRIPTION
    - Verifies Git, Docker, and Docker Compose are installed.
    - Creates .env from .env.example (only if .env does not already exist -
      an existing .env is never touched).
    - Generates random local-only secrets and writes them into the new .env.
    - Creates local working directories the stack expects.

    Secrets are written directly to .env and are never printed to the console.
#>

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==> Naksha GeoSphere bootstrap" -ForegroundColor Cyan

function Test-CommandExists {
    param([Parameter(Mandatory)][string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Host "--> Checking required tools..."
foreach ($tool in @("git", "docker")) {
    if (-not (Test-CommandExists $tool)) {
        Write-Error "Required tool '$tool' was not found on PATH."
        exit 1
    }
}

try {
    docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "docker compose exited with code $LASTEXITCODE" }
} catch {
    Write-Error "'docker compose' (the Compose v2 plugin) is required."
    exit 1
}
Write-Host "    git, docker, docker compose: OK"

function New-LocalSecret {
    param([int]$Bytes = 24)
    $buffer = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    $encoded = [Convert]::ToBase64String($buffer) -replace '[+/=]', ''
    if ($encoded.Length -gt 32) { $encoded = $encoded.Substring(0, 32) }
    return $encoded
}

$envPath = Join-Path $RootDir ".env"
$envExamplePath = Join-Path $RootDir ".env.example"

if (Test-Path $envPath) {
    Write-Host "--> .env already exists - leaving it untouched."
} else {
    Write-Host "--> Creating .env from .env.example..."
    Copy-Item $envExamplePath $envPath

    Write-Host "--> Generating local-only random secrets (values are not printed)..."
    $postgresPw  = New-LocalSecret -Bytes 24
    $minioAccess = "naksha_" + (New-LocalSecret -Bytes 12)
    $minioSecret = New-LocalSecret -Bytes 24
    $appSecret   = New-LocalSecret -Bytes 32

    $content = Get-Content $envPath -Raw
    $content = $content -replace 'POSTGRES_PASSWORD=REPLACE_WITH_LOCAL_DEV_SECRET', "POSTGRES_PASSWORD=$postgresPw"
    $content = $content -replace 'DATABASE_URL=postgresql\+asyncpg://naksha_app:REPLACE_WITH_LOCAL_DEV_SECRET@postgres:5432/naksha_geosphere', "DATABASE_URL=postgresql+asyncpg://naksha_app:$postgresPw@postgres:5432/naksha_geosphere"
    $content = $content -replace 'MINIO_ACCESS_KEY=REPLACE_WITH_LOCAL_ACCESS_KEY', "MINIO_ACCESS_KEY=$minioAccess"
    $content = $content -replace 'MINIO_SECRET_KEY=REPLACE_WITH_LOCAL_SECRET_KEY', "MINIO_SECRET_KEY=$minioSecret"
    $content = $content -replace 'SECRET_KEY=REPLACE_WITH_GENERATED_SECRET', "SECRET_KEY=$appSecret"
    Set-Content -Path $envPath -Value $content -Encoding utf8 -NoNewline

    Write-Host "    .env created with locally generated secrets."
}

Write-Host "--> Ensuring local working directories exist..."
New-Item -ItemType Directory -Force -Path (Join-Path $RootDir "infrastructure\docker\data") | Out-Null

Write-Host ""
Write-Host "==> Bootstrap complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml up --build -d"
Write-Host "  docker compose -f compose.yaml -f compose.local-storage.yaml -f compose.local-storage.dev.yaml -f compose.dev.yaml exec api alembic upgrade head"
Write-Host "  .\scripts\check-health.ps1"
