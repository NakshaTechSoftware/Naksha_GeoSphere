# Ramanagara District Setup Guide

## Actual MinIO Structure for Ramanagara

The Ramanagara district data is located at `india/karnataka/29_Ramanagara/` in MinIO:

```
geosphere-source-data/
└── india/
    └── karnataka/
        ├── KARNATAKA/
        │   └── KARNATAKA_DISTRICTS.geojson        # All districts including Ramanagara
        └── 29_Ramanagara/                         # ✓ Confirmed folder structure
            ├── Ramanagara_subdistrict_boundary.geojson   # ✓ Taluk boundaries
            └── Sub_Districts/                     # ✓ Note: underscore version
                ├── [Taluk_1_Folder]/              # e.g., "2901_Ramanagara_Taluk"
                │   └── hobli_boundaries.geojson
                ├── [Taluk_2_Folder]/              # e.g., "2902_Magadi_Taluk"
                │   └── hobli_boundaries.geojson
                ├── [Taluk_3_Folder]/              # e.g., "2903_Channapatna_Taluk"
                │   └── hobli_boundaries.geojson
                └── [Taluk_4_Folder]/              # e.g., "2904_Kanakapura_Taluk"
                    └── hobli_boundaries.geojson
```

**Note:** The folder is named `Sub_Districts/` (with underscore) not `SubDistricts/`. The API has been updated to handle both naming conventions.

## Required GeoJSON Properties

### 1. KARNATAKA_DISTRICTS.geojson
Each district feature must have these properties:
```json
{
  "type": "Feature",
  "properties": {
    "dtname": "Ramanagara",        // Required: Used for district name display
    "stname": "Karnataka",          // Required: Used for API queries
    "dt_code": "584",               // Optional: District code
    "st_nm": "Karnataka"            // Optional: Alternate state name
  },
  "geometry": { ... }
}
```

### 2. subdistrict_boundaries.geojson
Each taluk feature must have at least one of these name properties:
```json
{
  "type": "Feature",
  "properties": {
    "KGISTalukName": "Ramanagara",  // Preferred property name
    "subdist_nm": "Ramanagara",     // Fallback option 1
    "name": "Ramanagara"            // Fallback option 2
  },
  "geometry": { ... }
}
```

### 3. hobli_boundaries.geojson
Each hobli feature can have any properties, but typically:
```json
{
  "type": "Feature",
  "properties": {
    "hobli_name": "Example Hobli",
    "name": "Example"
  },
  "geometry": { ... }
}
```

## Folder Naming Convention

The system uses fuzzy name matching for district and taluk folders. For Ramanagara:
- District folder: `29_Ramanagara` ✓
- Taluk boundaries file: `Ramanagara_subdistrict_boundary.geojson` ✓  
- Sub-districts folder: `Sub_Districts/` ✓ (API supports both `SubDistricts/` and `Sub_Districts/`)

The folder can have various formats and the system will match them:
- `29_Ramanagara` ✓ (your current setup)
- `29-Ramanagara`  
- `Ramanagara`
- Any number prefix followed by underscore or hyphen

## How the System Works

### Step 1: Click on Karnataka State
- Loads districts from `india/karnataka/KARNATAKA/KARNATAKA_DISTRICTS.geojson`
- Displays all district boundaries including Ramanagara

### Step 2: Click on Ramanagara District
- API call: `/api/datasets/district-taluks?district=Ramanagara&state=Karnataka`
- Searches for folder matching "Ramanagara" in `india/karnataka/`
- Loads `subdistrict_boundaries.geojson` from that folder
- Displays taluk boundaries with yellow/purple highlight
- **NO POPUP LABEL** is shown (removed as per your request)

### Step 3: Click on a Taluk (e.g., Ramanagara Taluk)
- API call: `/api/datasets/taluk-hoblies?taluk=Ramanagara&district=Ramanagara&state=Karnataka`
- Searches for folder matching the taluk name in `SubDistricts/`
- Loads `hobli_boundaries.geojson` from that folder
- Displays hobli boundaries
- **NO POPUP LABEL** is shown (removed as per your request)

## Verification Steps

### 1. Check MinIO Structure
Run the Python script to verify folder structure:
```bash
python check_minio_structure.py
```

### 2. Test API Endpoints Manually

Test district taluks:
```
http://localhost:3000/api/datasets/district-taluks?district=Ramanagara&state=Karnataka
```

Test hobli boundaries (replace with actual taluk name):
```
http://localhost:3000/api/datasets/taluk-hoblies?taluk=Ramanagara&district=Ramanagara&state=Karnataka
```

### 3. Check Browser Console
Open browser DevTools and look for these logs when clicking Ramanagara:
```
=== DISTRICT CLICK EVENT ===
District: Ramanagara, Already loaded: false, Selected ID: null, Feature ID: X
Loading taluks automatically for Ramanagara, Karnataka
Loading taluks for district: Ramanagara, state: Karnataka
Fetching taluks from: /api/datasets/district-taluks?district=Ramanagara&state=Karnataka
Taluk fetch response status: 200
Taluk data loaded, features count: X
```

## Troubleshooting

### Issue: Taluks don't load when clicking Ramanagara
**Possible causes:**
1. District folder doesn't exist or is named differently
2. `subdistrict_boundaries.geojson` file is missing or named incorrectly
3. GeoJSON file is malformed or empty
4. MinIO access credentials are incorrect

**Check:**
- Folder exists: `india/karnataka/[something_with_Ramanagara]/`
- File exists: `subdistrict_boundaries.geojson` (exact name, case-sensitive)
- Test API directly in browser
- Check console for error messages

### Issue: Hoblies don't load when clicking a taluk
**Possible causes:**
1. `SubDistricts/` folder doesn't exist in the district folder
2. Taluk subfolder doesn't exist or is named differently
3. `hobli_boundaries.geojson` file is missing

**Check:**
- Folder exists: `india/karnataka/[ramanagara_folder]/SubDistricts/[taluk_folder]/`
- File exists: `hobli_boundaries.geojson` (contains "hobli" in lowercase)
- Check console logs for the exact folder being searched

### Issue: Wrong district/taluk is highlighted
**Possible causes:**
1. GeoJSON properties don't match expected names
2. Multiple features with same name

**Check:**
- District GeoJSON has `dtname` property
- Taluk GeoJSON has `KGISTalukName`, `subdist_nm`, or `name` property
- No duplicate feature names

## File Naming Requirements

**File names that work with Ramanagara:**
- District boundaries: `KARNATAKA_DISTRICTS.geojson` in the KARNATAKA folder ✓
- Taluk boundaries: `Ramanagara_subdistrict_boundary.geojson` ✓ (contains `subdistrict_boundary`)
- Hobli boundaries: Must contain `hobli` (lowercase) and end with `.geojson`

**Supported variations:**
- Taluk file can be named: 
  - `*subdistrict_boundary*.geojson` ✓ (your current file)
  - `*subdistrict_boundaries*.geojson`
- Folder can be named:
  - `Sub_Districts/` ✓ (your current folder - now supported!)
  - `SubDistricts/` (also supported)

**Note:** File names are case-insensitive in the search, but the actual file system may be case-sensitive.

## Recent Code Changes

### 1. Removed Taluk Label Popup ✓
The code has been modified to **NOT show a popup label** when clicking on a taluk. Previously, clicking on "Bangalore-North" taluk would show a popup with the taluk name. This has been removed while keeping the functionality to:
- Highlight the selected taluk
- Zoom to the taluk boundary
- Automatically load hobli boundaries

**Location:** `frontend/src/components/explore/IndiaMapViewer.tsx` (lines 1180-1207 removed)

### 2. Added Support for Sub_Districts Folder ✓
The API now checks for both folder naming conventions:
- `SubDistricts/` (original)
- `Sub_Districts/` (with underscore - used by Ramanagara)

This ensures Ramanagara's hobli boundaries will load correctly when clicking on a taluk.

**Location:** `frontend/src/app/api/datasets/taluk-hoblies/route.ts` (lines 60-76 updated)
