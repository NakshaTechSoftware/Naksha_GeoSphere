# REQUIREMENTS — geosphere-globe-workflow

Everything a teammate needs to **download / install / run** the isolated
`3D components/geosphere-globe-workflow` prototype. Follow the steps in order.

> The prototype is a self-contained folder: `3D components/geosphere-globe-workflow/`.
> Nothing outside that folder needs to be installed or touched.

---

## 1. Required tools

| Tool | Version | Why |
| --- | --- | --- |
| **Node.js** | **v20 or newer** (LTS recommended) | Runtime. The project declares `"engines": { "node": ">=20.0.0" }`. |
| **npm** | bundled with Node 20+ | Package manager. **Do not use yarn/pnpm** for this folder — run the documented `npm` commands. |
| **Git** | any recent version | To clone the repository (if not copied as a zip). |
| Browser | Chrome / Edge / Firefox (recent) | To open the dev server. |

Check what you have:

```bash
node --version   # must be >= 20
npm --version
git --version
```

If Node is missing or too old, install it from <https://nodejs.org> (LTS ≥ 20).

---

## 2. Get the code

Either clone the repo, or copy the folder from a zip. The prototype lives at:

```
<repo>/3D components/geosphere-globe-workflow/
```

```bash
git clone <your-repo-url>
cd "3D components/geosphere-globe-workflow"
```

> The path contains a space ("3D components") — always quote it in terminal commands.

---

## 3. Install dependencies

```bash
cd "3D components/geosphere-globe-workflow"
npm install
```

This installs everything the prototype needs (list below). It usually takes
**1–3 minutes** the first time.

### Packages that get installed (for reference)

**Runtime dependencies:**
- `react` / `react-dom` ^18.3.1
- `maplibre-gl` **^6.2.0** (map rendering, native globe projection)
- `gsap` ^3.12.7 (master workflow timeline)
- `@turf/turf` ^7.1.0 (AOI geometry / area / centroid / bbox)
- `lucide-react` ^0.469.0 (icons)

**Dev / test dependencies:**
- `vite` ^6.0.7, `@vitejs/plugin-react` ^4.3.4
- `typescript` ^5.7.2
- `vitest` ^2.1.8, `jsdom`, `@testing-library/*`
- `@playwright/test` ^1.49.1 (e2e)
- `topojson-client`, `world-atlas` (used by the geodata prep script)

---

## 4. Run the prototype

```bash
cd "3D components/geosphere-globe-workflow"
npm run dev
```

Then open **http://localhost:5199** in your browser.

You should see the cinematic loop: globe → India → Karnataka → Bengaluru
(satellite imagery) → Draw AOI → data → export → payment → delivery → reset → repeat.

> The dev server is configured with `strictPort: true`, so it will always try to use
> **5199**. If that port is already in use the server will error instead of switching
> ports — free the port (or change `server.port` in `vite.config.ts`) and retry.

---

## 5. (Optional) Environment variables

Copy the template and edit if you want a custom basemap:

```bash
cp .env.example .env
```

- `VITE_MAP_STYLE_URL=` — optional raster/vector style URL
- `VITE_MAP_ACCESS_TOKEN=` — token for providers that require one

**You can ignore this step** — the prototype works out of the box with a local
pale-blue canvas + **ESRI World Imagery satellite tiles** (no key required) for the
local city stage. See `GEODATA_SOURCES.md` for details.

---

## 6. Useful commands (for the teammate)

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server at http://localhost:5199 |
| `npm run typecheck` | TypeScript check only |
| `npm run build` | Typecheck + production build (`dist/`) |
| `npm run preview` | Serve the production build locally |
| `npm run test` | Run the 24 unit/logic/stability tests (Vitest) |
| `npm run test:e2e` | Run the Playwright end-to-end workflow tests (needs browsers installed, see below) |
| `npm run stress` | 30-loop stability test only |

### First time running Playwright e2e tests

Playwright needs its browser binaries downloaded once:

```bash
npx playwright install chromium
```

---

## 7. Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm install` fails / EACCES | Run without sudo; on Windows close any editor locking `node_modules`, then retry. |
| Port 5199 already in use | The dev server uses `strictPort: true`, so it errors rather than switching. Close the other process using 5199, or edit `server.port` in `vite.config.ts`. |
| Satellite imagery doesn't load | Check network access to `server.arcgisonline.com`; the prototype still works (pale-blue fallback). |
| Blank page | Run `npm run typecheck` — a type error won't block `dev`, but check the browser console for errors and share them. |
| Old globe (flat map) | Ensure `maplibre-gl@6.2.0` is installed (`npm ls maplibre-gl`) — the globe projection requires v6. |

---

## 8. Folder structure (what the teammate gets)

```
3D components/geosphere-globe-workflow/
├── public/geodata/        # real India/Karnataka/world geometry (committed, no download)
├── src/                   # all prototype source code
├── e2e/                   # Playwright tests
├── GEODATA_SOURCES.md     # geography + satellite imagery provenance & licences
├── README.md              # how the loop works
└── REQUIREMENTS.md        # this file
```

No other part of the Naksha GeoSphere repo is required to run this prototype.
