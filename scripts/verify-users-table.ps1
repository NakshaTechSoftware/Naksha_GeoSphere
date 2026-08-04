# Script to verify if users table exists in the database

Write-Host "Checking for users table in database..." -ForegroundColor Cyan

# Set PostgreSQL password environment variable
$env:PGPASSWORD = "a63ac6ead5e44a838d6e0b562b37272c2a73b04cc1e74b38"

# Try to connect and list tables
$query = @"
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
"@

Write-Host "`nAttempting to connect to:" -ForegroundColor Yellow
Write-Host "  Host: 192.168.10.81" -ForegroundColor White
Write-Host "  Port: 5544" -ForegroundColor White
Write-Host "  Database: naksha_geosphere" -ForegroundColor White
Write-Host "  User: geosphere_app`n" -ForegroundColor White

try {
    # Try using psql if available
    $result = psql -h 192.168.10.81 -p 5544 -U geosphere_app -d naksha_geosphere -c $query -t 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Successfully connected to database!" -ForegroundColor Green
        Write-Host "`nTables found:" -ForegroundColor Cyan
        Write-Host $result
        
        if ($result -match "users") {
            Write-Host "`n✓ USERS TABLE EXISTS!" -ForegroundColor Green
        } else {
            Write-Host "`n✗ USERS TABLE NOT FOUND!" -ForegroundColor Red
            Write-Host "You need to run migrations first." -ForegroundColor Yellow
        }
    } else {
        throw "Failed to connect"
    }
} catch {
    Write-Host "`n✗ Could not connect using psql" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "`nPossible reasons:" -ForegroundColor Yellow
    Write-Host "  1. psql is not installed (install PostgreSQL client tools)" -ForegroundColor White
    Write-Host "  2. Database server is not running at 192.168.10.81:5544" -ForegroundColor White
    Write-Host "  3. Firewall blocking the connection" -ForegroundColor White
    Write-Host "  4. Wrong credentials" -ForegroundColor White
}

# Clear password from environment
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
