# Kanakatte Hobli - Village Boundaries Loading Test Guide

## Updated: 2026-08-06

## Critical Fix Applied ✅

**Issue**: The folder was named "**Hoblis**" (with an 'i'), not "Hoblies" (with 'ie')

**Fix**: Updated the hobli-villages route to try multiple folder name variants:
1. `Hoblis/` (PRIMARY - matches your MinIO structure)
2. `Hoblies/`
3. `hoblies/`
4. `hoblis/`

---

## Verified MinIO Structure

Based on your screenshots, the exact structure is:

```
geosphere-source-data/
└── Administrative Boundaries/
    └── india/
        └── karnataka/
            └── 23_Hassan/
                └── SubDistricts/
                    └── 2303_Arsikere/
                        └── Hoblis/  ← Note: "Hoblis" not "Hoblies"
                            └── 230308_Kanakatte/
                                └── Kanakatte_villages_boundary.geojson
```

**File Details**:
- **Folder**: `230308_Kanakatte` (with numeric prefix)
- **File**: `Kanakatte_villages_boundary.geojson`
- **Keywords**: Contains "villages" and "_boundary"

---

## Testing Steps for Kanakatte

### Step 1: Clear Browser Cache
```
Press Ctrl + Shift + R (hard refresh)
or
Clear cache completely: Ctrl + Shift + Delete
```

### Step 2: Navigate to Kanakatte
1. Open the map viewer
2. Click **Karnataka** state
3. Click **Hassan** district
4. Click **Arsikere** taluk
5. Click **Kanakatte** hobli

### Step 3: Expected Result
✅ **GREEN village boundaries** should appear on the map  
✅ Village boundary lines should be visible with color `#00ff00`  
✅ Console should show success logs

---

## What the Console Logs Should Show

### Success Path:
```
[hobli-villages] ========================================
[hobli-villages] NEW REQUEST RECEIVED
[hobli-villages] Params: hobli="Kanakatte", taluk="Arsikere", district="Hassan", state="Karnataka"
[hobli-villages] ========================================

[hobli-villages] ✓ Taluk folder: "Administrative Boundaries/india/karnataka/23_Hassan/SubDistricts/2303_Arsikere/"
[hobli-villages] Looking for hobli="Kanakatte" in Hoblis prefix="...2303_Arsikere/Hoblis/"
[hobli-villages] Available hobli folders: ["...230308_Kanakatte/", "...230306_Kasaba/", ...]
[hobli-villages] >>> Comparing: folderName="230308_Kanakatte"
[hobli-villages] >>> After cleanFolderName: cleaned="kanakatte"
[hobli-villages] >>> Search term: hobli="Kanakatte", hobliCleaned="kanakatte"
[hobli-villages] >>> namesMatch result: true
[hobli-villages] ✓ Matched hobli folder: "...230308_Kanakatte/"
[hobli-villages] Files in hobli folder: ["...Kanakatte_villages_boundary.geojson"]
[hobli-villages] File check: "...Kanakatte_villages_boundary.geojson" -> match=true
[hobli-villages] ✓✓✓ FINAL SELECTION: Will load village file "...Kanakatte_villages_boundary.geojson"
[hobli-villages] SUCCESS: Returning village file "...Kanakatte_villages_boundary.geojson" (XXXX bytes)
```

### If It Still Fails:
Look for these specific error messages:

**Error 1: "Hoblies folder not found or empty"**
- The folder isn't named "Hoblis", "Hoblies", "hoblies", or "hoblis"
- Check console for "Available folders in taluk:" to see actual folder name

**Error 2: "Hobli folder not found for Kanakatte"**
- The folder "230308_Kanakatte" wasn't matched
- Check if folder name has different numeric prefix or spelling

**Error 3: "No village boundaries file found for hobli Kanakatte"**
- The file doesn't contain "village" or "villages" in its name
- Check console for "Files in hobli folder:" to see actual file name

---

## Key Changes Made

### File: `frontend/src/app/api/datasets/hobli-villages/route.ts`

**Before**: Only tried "Hoblies" and "hoblies"
```typescript
let hobliesPrefix = `${talukFolder.Prefix}Hoblies/`;
```

**After**: Tries "Hoblis" first, then fallbacks
```typescript
let hobliesPrefix = `${talukFolder.Prefix}Hoblis/`;  // PRIMARY
// Then tries: Hoblies/, hoblies/, hoblis/
```

**File Matching**: Already correct
```typescript
fileName.includes('village') || fileName.includes('villages')
// This will match: Kanakatte_villages_boundary.geojson ✅
```

---

## Color Reference

When Kanakatte hobli is clicked and villages load successfully:

- **YELLOW** (#ffff00): Kanakatte hobli boundary (already visible)
- **GREEN** (#00ff00): Village boundaries inside Kanakatte (should appear)

The green boundaries should overlay on top of the yellow hobli boundary.

---

## Other Hoblies in Arsikere

The same logic applies to these other hoblies (per your screenshot):

1. ✅ **230306_Kasaba** → `Kasaba_villages_boundary.geojson`
2. ✅ **230307_Javagal** → `Javagal_villages_boundary.geojson`
3. ✅ **230308_Kanakatte** → `Kanakatte_villages_boundary.geojson`
4. ✅ **230309_Gandasi** → `Gandasi_villages_boundary.geojson`
5. ✅ **230310_Banavara** → `Banavara_villages_boundary.geojson`

All should work with the same fix applied.

---

## If Villages Still Don't Load

1. **Open Browser DevTools** (F12)
2. **Go to Network tab**
3. **Click Kanakatte hobli**
4. **Find the request**: `GET /api/datasets/hobli-villages?hobli=Kanakatte&taluk=Arsikere...`
5. **Check response**:
   - Status 200 = Success ✅
   - Status 404 = Not found ❌
   - Status 500 = Server error ❌

6. **In Server Console**:
   - Look for all `[hobli-villages]` logs
   - Share the complete log output

7. **Verify in MinIO**:
   - Confirm path: `Administrative Boundaries/india/karnataka/23_Hassan/SubDistricts/2303_Arsikere/Hoblis/230308_Kanakatte/`
   - Confirm file exists: `Kanakatte_villages_boundary.geojson`
   - Confirm file is valid GeoJSON (can open in QGIS)

---

## Summary

✅ Fixed primary issue: Now tries "**Hoblis/**" folder name  
✅ File matching already correct: Matches "villages_boundary" pattern  
✅ Folder matching already correct: Handles "230308_Kanakatte" → "Kanakatte"  
✅ No TypeScript errors

**Next**: Test with hard refresh and check console logs!
