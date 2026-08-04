# Rebuild and restart the Naksha Frontend

Write-Host "Rebuilding Naksha Frontend..." -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Stop and remove the current container
Write-Host "Stopping current container..." -ForegroundColor Yellow
docker-compose -f docker-compose.standalone.yml down

# Remove the old image
Write-Host "Removing old image..." -ForegroundColor Yellow
docker rmi naksha_frontend:latest -f

# Build new image with no cache
Write-Host "Building new image (no cache)..." -ForegroundColor Yellow
docker build --no-cache -t naksha_frontend:latest .

# Start the new container
Write-Host "Starting new container..." -ForegroundColor Yellow
docker-compose -f docker-compose.standalone.yml up -d

Write-Host ""
Write-Host "Rebuild complete!" -ForegroundColor Green
Write-Host "Access at: http://localhost:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "To view logs: docker logs -f naksha_frontend" -ForegroundColor Gray
