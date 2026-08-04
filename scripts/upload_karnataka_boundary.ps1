# Upload Karnataka State Boundary KMZ files to MinIO

$SourceDir = "E:\KSRSAC files\Karnataka State Boundary\KML Files"
$MinIOEndpoint = "http://localhost:9000"
$AccessKey = "naksha_minio_b0KhJN58nGQ1H6sF3EsqPw"
$SecretKey = "2eKAxZ7G8LxJ4Mtcz7g12Q_minio_secret"
$Bucket = "geosphere-source-data"

Write-Host "Karnataka State Boundary Upload to MinIO" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Gray

# Check if source directory exists
if (-not (Test-Path $SourceDir)) {
    Write-Host "`n✗ Source directory not found: $SourceDir" -ForegroundColor Red
    exit 1
}

# Find KMZ and KML files
$files = Get-ChildItem -Path $SourceDir -Include "*.kmz","*.kml","*.KMZ","*.KML" -File

if ($files.Count -eq 0) {
    Write-Host "`n✗ No KMZ/KML files found in: $SourceDir" -ForegroundColor Red
    exit 1
}

Write-Host "`nFound $($files.Count) file(s) to upload:`n" -ForegroundColor Green
foreach ($file in $files) {
    $sizeKB = [math]::Round($file.Length / 1KB, 2)
    Write-Host "  - $($file.Name) ($sizeKB KB)" -ForegroundColor White
}

# Check if AWS CLI is available
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "`n✗ AWS CLI not found!" -ForegroundColor Red
    Write-Host "  Install from: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    Write-Host "  Or use MinIO Console: http://localhost:9001" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n✓ AWS CLI found" -ForegroundColor Green
Write-Host "`nUploading to MinIO..." -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor Gray

# Set AWS credentials
$env:AWS_ACCESS_KEY_ID = $AccessKey
$env:AWS_SECRET_ACCESS_KEY = $SecretKey

foreach ($file in $files) {
    $s3Key = "india/karnataka/state-boundary/$($file.Name)"
    
    Write-Host "`n📤 Uploading: $($file.Name)" -ForegroundColor Yellow
    Write-Host "   Destination: $s3Key" -ForegroundColor Gray
    
    $contentType = "application/vnd.google-earth.kmz"
    if ($file.Extension -eq ".kml") {
        $contentType = "application/vnd.google-earth.kml+xml"
    }
    
    aws s3 cp $file.FullName "s3://$Bucket/$s3Key" --endpoint-url $MinIOEndpoint --content-type $contentType 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Uploaded successfully!" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Upload failed" -ForegroundColor Red
    }
}

Write-Host "`n$('=' * 70)" -ForegroundColor Gray
Write-Host "✓ Upload complete!" -ForegroundColor Green
Write-Host "`nView in MinIO Console:" -ForegroundColor Cyan
Write-Host "  1. Open: http://localhost:9001" -ForegroundColor White
Write-Host "  2. Navigate to: geosphere-source-data" -ForegroundColor White
Write-Host "  3. Path: india → karnataka → state-boundary`n" -ForegroundColor White

# Cleanup
Remove-Item Env:\AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
Remove-Item Env:\AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
