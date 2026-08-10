# Sakleshpura Taluk - Village Boundaries Structure

## Location
**District**: Hassan (23_Hassan)  
**Taluk**: Sakleshpura (2301_Sakleshpura)

## MinIO Path
```
geosphere-source-data/Administrative Boundaries/india/karnataka/23_Hassan/SubDistricts/2301_Sakleshpura/Hoblis/
```

## Hoblies in Sakleshpura

### 1. Kasaba (230111_Kasaba)
**Path**: `...2301_Sakleshpura/Hoblis/230111_Kasaba/`  
**Expected file**: `Kasaba_villages_boundary.geojson` or similar with "villages" keyword

### 2. Belagodu (230112_Belagodu)
**Path**: `...2301_Sakleshpura/Hoblis/230112_Belagodu/`  
**Expected file**: `Belagodu_villages_boundary.geojson` or similar

### 3. Hetturu (230113_Hetturu)
**Path**: `...2301_Sakleshpura/Hoblis/230113_Hetturu/`  
**Expected file**: `Hetturu_villages_boundary.geojson` or similar

### 4. Yasaluru (230114_Yasaluru)
**Path**: `...2301_Sakleshpura/Hoblis/230114_Yasaluru/`  
**Expected file**: `Yasaluru_villages_boundary.geojson` or similar

### 5. Hanubalu (230115_Hanubalu)
**Path**: `...2301_Sakleshpura/Hoblis/230115_Hanubalu/`  
**Expected file**: `Hanubalu_villages_boundary.geojson` or similar

---

## File Naming Pattern

All village boundary files should:
- ✅ Contain the keyword **"villages"** in the filename
- ✅ End with **.geojson** extension
- ✅ Examples:
  - `Kasaba_villages_boundary.geojson`
  - `Belagodu_villages_boundary.geojson`
  - `Hetturu_villages_boundary.geojson`
  - etc.

---

## How It Works

The existing code automatically handles Sakleshpura:

### 1. District Matching
```typescript
// Matches "23_Hassan" folder
cleanFolderName("23_Hassan") → "hassan"
namesMatch("hassan", "Hassan") → true ✅
```

### 2. Taluk Matching
```typescript
// Matches "2301_Sakleshpura" folder
cleanFolderName("2301_Sakleshpura") → "sakleshpura"
namesMatch("sakleshpura", "Sakleshpura") → true ✅
```

### 3. Hobli Folder Discovery
```typescript
// Looks in "Hoblis/" folder (fixed in previous update)
prefix = "...2301_Sakleshpura/Hoblis/"
// Finds: 230111_Kasaba, 230112_Belagodu, etc.
```

### 4. Hobli Matching
```typescript
// Example: Matching "Kasaba" hobli
cleanFolderName("230111_Kasaba") → "kasaba"
namesMatch("kasaba", "Kasaba") → true ✅
```

### 5. Village File Discovery
```typescript
// Looks for files containing "villages" in hobli folder
fileName.includes("village") || fileName.includes("villages")
// Matches: Kasaba_villages_boundary.geojson ✅
```

---

## Testing Sakleshpura Hoblies

### Test Path 1: Kasaba
1. Navigate: Karnataka → Hassan → **Sakleshpura** → **Kasaba**
2. Expected: **NEON RED** village boundaries appear
3. Console: `[hobli-villages] SUCCESS: Returning village file "...Kasaba_villages_boundary.geojson"`

### Test Path 2: Belagodu
1. Navigate: Karnataka → Hassan → **Sakleshpura** → **Belagodu**
2. Expected: **NEON RED** village boundaries appear
3. Console: Success log with Belagodu file

### Test Path 3: Hetturu
1. Navigate: Karnataka → Hassan → **Sakleshpura** → **Hetturu**
2. Expected: **NEON RED** village boundaries appear
3. Console: Success log with Hetturu file

### Test Path 4: Yasaluru
1. Navigate: Karnataka → Hassan → **Sakleshpura** → **Yasaluru**
2. Expected: **NEON RED** village boundaries appear
3. Console: Success log with Yasaluru file

### Test Path 5: Hanubalu
1. Navigate: Karnataka → Hassan → **Sakleshpura** → **Hanubalu**
2. Expected: **NEON RED** village boundaries appear
3. Console: Success log with Hanubalu file

---

## Color Scheme for Sakleshpura

When viewing Sakleshpura taluk with its hoblies and villages:

- **CYAN** (#04D9FF): Karnataka state boundary
- **ORANGE** (#f97316): Hassan district boundary
- **PURPLE** (#8b5cf6): Sakleshpura taluk boundary
- **YELLOW** (#ffff00): Individual hobli boundaries (Kasaba, Belagodu, etc.)
- **NEON RED** (#ff073a): Village boundaries within selected hobli 🔴

---

## Verification Checklist

For each hobli folder in MinIO, verify:

- [ ] Folder exists: `230111_Kasaba/`
- [ ] Contains GeoJSON file with "villages" keyword
- [ ] File is valid GeoJSON (opens in QGIS)
- [ ] File name pattern: `{HobliName}_villages_boundary.geojson`

Repeat for all 5 hoblies.

---

## No Code Changes Required! ✅

The existing implementation already supports Sakleshpura because:

1. ✅ District/Taluk matching uses fuzzy logic
2. ✅ "Hoblis" folder name is now supported
3. ✅ Numeric prefixes are handled by `cleanFolderName()`
4. ✅ File matching works with "villages" keyword
5. ✅ Village boundaries display in neon red

**Just test it!** Navigate to Hassan → Sakleshpura → Click any hobli → Villages should load automatically.

---

## If Any Hobli Fails

Check console logs for:
```
[hobli-villages] Params: hobli="Kasaba", taluk="Sakleshpura", district="Hassan"
[hobli-villages] Available hobli folders: [...]
[hobli-villages] Matched hobli folder: "...230111_Kasaba/"
[hobli-villages] Files in hobli folder: [...]
```

Common issues:
- **404**: Village boundary file missing or named differently
- **Empty render**: File exists but has no/invalid features
- **Wrong color**: Browser cache (hard refresh needed)
