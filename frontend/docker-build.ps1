# Build the frontend Docker image with no cache

Write-Host "Building Naksha Frontend Docker Image..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

docker build --no-cache -t naksha_frontend:latest .

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "To run: docker-compose -f docker-compose.standalone.yml up -d" -ForegroundColor Yellow
