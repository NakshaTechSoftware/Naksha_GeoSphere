# Check if users table exists using Docker API container

Write-Host "Checking users table via Docker API container..." -ForegroundColor Cyan

# Check if Docker is running
try {
    $dockerRunning = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Docker is not running!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Docker is not available!" -ForegroundColor Red
    exit 1
}

# Try to find the API container
Write-Host "`nLooking for API container..." -ForegroundColor Yellow
$apiContainer = docker ps --format "{{.Names}}" | Select-String -Pattern "api"

if (-not $apiContainer) {
    Write-Host "✗ API container is not running!" -ForegroundColor Red
    Write-Host "`nAvailable containers:" -ForegroundColor Yellow
    docker ps --format "table {{.Names}}\t{{.Status}}"
    Write-Host "`nStart containers with:" -ForegroundColor Cyan
    Write-Host "docker compose -f compose.yaml -f compose.dev.yaml -f compose.remote-storage.yaml up -d" -ForegroundColor White
    exit 1
}

$containerName = $apiContainer[0].ToString()
Write-Host "✓ Found API container: $containerName" -ForegroundColor Green

# Check tables using Alembic
Write-Host "`nChecking database tables..." -ForegroundColor Yellow

$checkTablesScript = @'
import sys
import asyncio
from sqlalchemy import text
from app.database.session import get_engine

async def check_tables():
    engine = get_engine()
    async with engine.begin() as conn:
        result = await conn.execute(text(
            """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """
        ))
        tables = [row[0] for row in result]
        
        print('\nTables in database:')
        for table in tables:
            print(f'  - {table}')
        
        if 'users' in tables:
            print('\n✓ USERS TABLE EXISTS!')
            
            # Check if it has data
            count_result = await conn.execute(text('SELECT COUNT(*) FROM users'))
            count = count_result.scalar()
            print(f'  Number of users: {count}')
        else:
            print('\n✗ USERS TABLE NOT FOUND!')
            print('Run migrations with: docker compose exec api alembic upgrade head')
    
    await engine.dispose()

asyncio.run(check_tables())
'@

# Save the script to a temp file
$tempScript = "check_tables_temp.py"
$checkTablesScript | Out-File -FilePath $tempScript -Encoding UTF8

# Copy to container and run
docker cp $tempScript "${containerName}:/app/$tempScript"
docker exec $containerName python $tempScript

# Cleanup
Remove-Item $tempScript -ErrorAction SilentlyContinue
docker exec $containerName rm -f "/app/$tempScript" 2>$null

Write-Host "`n" -NoNewline
