# Run the Naksha Frontend Docker container

Write-Host "Starting Naksha Frontend..." -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

docker-compose -f docker-compose.standalone.yml up -d

Write-Host ""
Write-Host "Frontend is starting..." -ForegroundColor Green
Write-Host "Access at: http://localhost:3000" -ForegroundColor Yellow
Write-Host ""
Write-Host "To view logs: docker logs -f naksha_frontend" -ForegroundColor Gray
Write-Host "To stop: docker-compose -f docker-compose.standalone.yml down" -ForegroundColor Gray
