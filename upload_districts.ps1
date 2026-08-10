# Upload KARNATAKA_DISTRICTS.geojson to MinIO using AWS CLI

$env:AWS_ACCESS_KEY_ID = "geosphere_storage"
$env:AWS_SECRET_ACCESS_KEY = "706f803f67c143c884305e7085b59210ffb29ac69e724a70"

$endpoint = "http://192.168.10.81:9010"
$bucket = "geosphere-source-data"
$key = "india/karnataka/KARNATAKA/KARNATAKA_DISTRICTS.geojson"
$sourceFile = "E:\Datasets routes\KARNATAKA_DISTRICTS.geojson"

Write-Host "Uploading $sourceFile to MinIO..." -ForegroundColor Cyan

aws s3 cp "$sourceFile" "s3://$bucket/$key" --endpoint-url $endpoint

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Upload successful!" -ForegroundColor Green
    
    Write-Host "`nVerifying file..." -ForegroundColor Cyan
    aws s3 ls "s3://$bucket/$key" --endpoint-url $endpoint
} else {
    Write-Host "✗ Upload failed!" -ForegroundColor Red
}

Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
