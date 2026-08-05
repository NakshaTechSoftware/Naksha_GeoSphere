# Upload Karnataka district subfolders to MinIO
# Skips 17_Chikkamagaluru which is already uploaded

$sourceDir = "E:\Datasets routes\KGIS_District_SubDistrict_Combined"
$minioEndpoint = "192.168.10.81:9010"
$minioAccessKey = "geosphere_storage"
$minioSecretKey = "706f803f67c143c884305e7085b59210ffb29ac69e724a70"
$bucketName = "geosphere-source-data"
$targetPrefix = "india/karnataka"

# Configure AWS CLI for MinIO
$env:AWS_ACCESS_KEY_ID = $minioAccessKey
$env:AWS_SECRET_ACCESS_KEY = $minioSecretKey
$env:AWS_ENDPOINT_URL = "http://$minioEndpoint"

Write-Host "Starting upload of Karnataka district folders..." -ForegroundColor Green
Write-Host "Source: $sourceDir" -ForegroundColor Cyan
Write-Host "Target: s3://$bucketName/$targetPrefix" -ForegroundColor Cyan
Write-Host ""

# Get all district folders
$allFolders = Get-ChildItem -Path $sourceDir -Directory | Where-Object { $_.Name -match '^\d+_' }

$totalFolders = $allFolders.Count
$skippedCount = 0
$uploadedCount = 0
$errorCount = 0

Write-Host "Found $totalFolders district folders" -ForegroundColor Yellow
Write-Host ""

foreach ($folder in $allFolders) {
    $folderName = $folder.Name
    
    # Skip the already uploaded folder
    if ($folderName -eq "17_Chikkamagaluru") {
        Write-Host "[$skippedCount/$totalFolders] SKIPPING: $folderName (already uploaded)" -ForegroundColor Yellow
        $skippedCount++
        continue
    }
    
    $currentNum = $uploadedCount + $skippedCount + 1
    Write-Host "[$currentNum/$totalFolders] Uploading: $folderName" -ForegroundColor Cyan
    
    try {
        # Upload the entire folder recursively
        $s3Path = "s3://$bucketName/$targetPrefix/$folderName/"
        $localPath = $folder.FullName
        
        # Use AWS CLI to sync the folder
        $result = aws s3 sync "$localPath" "$s3Path" --endpoint-url "http://$minioEndpoint" --only-show-errors 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Successfully uploaded $folderName" -ForegroundColor Green
            $uploadedCount++
        } else {
            Write-Host "  ✗ Error uploading $folderName" -ForegroundColor Red
            Write-Host "    Error: $result" -ForegroundColor Red
            $errorCount++
        }
    }
    catch {
        Write-Host "  ✗ Exception uploading $folderName" -ForegroundColor Red
        Write-Host "    Error: $_" -ForegroundColor Red
        $errorCount++
    }
    
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "Upload Complete!" -ForegroundColor Green
Write-Host "Total folders: $totalFolders" -ForegroundColor White
Write-Host "Uploaded: $uploadedCount" -ForegroundColor Green
Write-Host "Skipped: $skippedCount" -ForegroundColor Yellow
Write-Host "Errors: $errorCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Green
