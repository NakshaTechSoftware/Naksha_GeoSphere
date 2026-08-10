@echo off
REM Upload KARNATAKA_DISTRICTS.geojson to MinIO

echo Configuring MinIO client...
mc alias set myminio http://192.168.10.81:9010 geosphere_storage 706f803f67c143c884305e7085b59210ffb29ac69e724a70

echo.
echo Uploading KARNATAKA_DISTRICTS.geojson...
mc cp "E:\Datasets routes\KARNATAKA_DISTRICTS.geojson" myminio/geosphere-source-data/india/karnataka/KARNATAKA/KARNATAKA_DISTRICTS.geojson

echo.
echo Verifying upload...
mc ls myminio/geosphere-source-data/india/karnataka/KARNATAKA/

echo.
echo Done! Press any key to exit...
pause >nul
