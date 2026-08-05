# Geosphere Workflow Prototype

An isolated, cinematic, looping prototype of the full Naksha GeoSphere
customer journey — search → navigate → select AOI → discover data →
add to cart → secure purchase → download → reset — built to be reviewed
independently before it is integrated into the main application.

## 1. Folder isolation

This prototype lives entirely under the repository's top-level
`3D components/geosphere-workflow-prototype/` folder (note the space in
`3D components` — quote the path in terminal commands). It has:

- its own `package.json`, lockfile, and `node_modules`
- its own Vite, TypeScript, Vitest and Playwright configuration
- its own `src/`, `public/`, `.env.example` and tests

It is **not** wired into `apps/web` or `frontend/`, does not import from
either, and nothing in the main application was modified to build it. The
main application's welcome page, sign-up/sign-in pages, home page, Explore
Data page, shared components, routing, package configuration, backend,
Postgres/Redis/MinIO and Docker infrastructure are all untouched.

## 2. Package manager

The repository root uses **pnpm** (`pnpm-workspace.yaml`), while the
actively-developed `frontend/` app uses **npm** (its own
`package-lock.json`). This prototype is outside both the pnpm workspace
globs (`apps/*`, `packages/*`) and the `frontend/` app, so it uses **npm**
to stay maximally isolated and to match `frontend/`'s tooling. Any package
manager would work here since the folder is self-contained — npm was
chosen for consistency with the app most likely to receive this component.

## 3. Installation & running

```bash
cd "3D components/geosphere-workflow-prototype"
npm install
npm run dev
```

The dev server starts on **http://localhost:5183** (falls back to the next
free port if 5183 is taken — check the terminal output).

Other commands:

```bash
npm run lint        # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright end-to-end tests (starts its own dev server)
npm run build        # typecheck + production build to dist/
npm run preview      # serve the production build locally
```

## 4. Environment configuration

Copy `.env.example` to `.env` and optionally set:

```bash
VITE_MAP_STYLE_URL=          # a MapLibre style JSON URL you are licensed to use
VITE_MAP_ACCESS_TOKEN=       # optional token appended to the style URL
```

If `VITE_MAP_STYLE_URL` is left empty, the prototype falls back to the free
MapLibre demo tiles (`https://demotiles.maplibre.org/style.json`). **This
fallback is for development demonstration only and is not suitable for
commercial or production use.** No provider token is ever hard-coded in
source; both values are read once, in `src/map/mapConfig.ts`, the single
module in this codebase allowed to touch Vite's `import.meta.env`.

## 5. Component architecture

```
src/
├── app/                 Standalone review harness (App.tsx) — not shipped
├── components/
│   ├── workflow/         GeoWorkflowDemo and its subcomponents
│   └── controls/         PrototypeControls (review-only)
├── animation/             GSAP master timeline, stage/duration constants, React hook
├── map/                   MapLibre config, layers, AOI geometry (Turf.js), camera, fallback
├── data/                  Typed deterministic mock datasets & workflow content
├── hooks/                 useReducedMotion, useVisibilityPause, useElementSize
├── styles/                tokens.css (brand palette), globals.css, animations.css
└── tests/                 Vitest unit tests
e2e/                       Playwright specs
```

**Single source of truth for sequencing:** `src/animation/workflowStages.ts`
defines the 12-stage order; `src/animation/workflowDurations.ts` defines
timing; `src/animation/workflowTimeline.ts` builds one GSAP master timeline
with labels at each stage and drives every visual side-effect through typed
callbacks (`WorkflowTimelineHandlers`) — there is no scattered
`setTimeout`-based animation anywhere in the component tree.
`useWorkflowTimeline.ts` turns those callbacks into React state and exposes
`play/pause/togglePlay/replay/seekToStage/stepStage`.

**Vite isolation:** only `src/map/mapConfig.ts` touches
`import.meta.env`. Every other module receives configuration as plain
values/props, so the workflow components can be ported to a Next.js host
by swapping that one adapter file.

## 6. Workflow stages (one loop ≈ 22.5s + ~0.7s reset pause)

| Stage | Window (s) | What happens |
|---|---|---|
| INITIALIZE | 0.0 | Component mounts, nothing visible yet |
| MAP_BUILD | 0.0–1.8 | Polar Pearl shell → blue grid → map sharpens → panels slide in |
| SEARCH | 1.8–3.0 | Simulated cursor types "Bengaluru, Karnataka", suggestion selected |
| CAMERA_FLY | 3.0–5.5 | MapLibre `flyTo` from wide Karnataka view into central Bengaluru |
| AOI_DRAW | 5.5–8.5 | 7-vertex irregular AOI drawn vertex-by-vertex, fill fades in, area label |
| DATA_DISCOVERY | 8.5–10.5 | Selected Data panel populates from the finalized AOI |
| DATA_SELECTION | 10.5–12.3 | Imagery then Elevation selected on the dataset switcher |
| ADD_TO_CART | 12.3–13.8 | Cart click, badge 0→2, button label changes |
| SECURE_PROCESSING | 13.8–16.4 | 5-step frosted overlay (validate → prepare → package → secure → confirm) |
| PURCHASE_COMPLETE | 16.4–18.0 | Order reference, formats, AOI size, secure-delivery chip |
| DOWNLOAD_READY | 18.0–20.5 | Package card, "Download Securely" click, "Download Started" |
| RESET | 20.5–22.5 | Every piece of state returns to its exact initial value |

## 7. Playback controls (review-only)

Rendered only when `showPrototypeControls` is `true` (the default in this
harness): Play/Pause, Replay, Previous/Next stage, playback speed
(0.5×/1×/1.5×/2×), Loop on/off, a reduced-motion preview toggle, the current
stage label, and elapsed timeline seconds.

Keyboard shortcuts (ignored while typing in an input): `Space` play/pause,
`R` replay, `←`/`→` previous/next stage.

## 8. Reduced-motion behaviour

`prefers-reduced-motion: reduce` (or the review-only toggle) removes the
long camera flight (a short crossfade is used instead), removes all
simulated-cursor travel, and hides the cursor entirely — every other stage
transition, the AOI reveal and the informational panels remain, so the
workflow is still fully understandable.

## 9. Map failure / WebGL fallback

`src/map/mapFallback.ts` detects WebGL availability up front; a style/tile
`error` event also engages the fallback. In fallback mode the component
shows the static pale-blue grid (`public/assets/map-fallback-grid.svg`) and
draws the AOI as a lightweight SVG overlay instead of MapLibre GeoJSON
layers — the rest of the UI and animation continue unchanged. No error is
ever surfaced to the end user; a single concise `console.warn` is logged
in development.

## 10. Pricing

`src/data/mockDatasets.ts` defines a typed `DatasetProduct[]` catalogue
(price per km²) and `calculateTotalPrice(datasetIds, areaSqKm)`. The AOI
area comes from `@turf/turf`'s `turf.area()` on the real demo polygon
(`src/map/aoiGeometry.ts`), not a hard-coded number. All prices are
formatted with `Intl.NumberFormat("en-IN", { style: "currency", currency:
"INR" })`.

## 11. Test mode

Appending `?testMode=true` to the URL (`src/map/mapConfig.ts`,
`IS_TEST_MODE`) divides every timeline duration by
`TEST_MODE_SPEED_MULTIPLIER` (see `workflowDurations.ts`) for fast,
deterministic tests, while preserving the exact same stage sequence. Both
the Vitest and Playwright suites use it.

## 12. Future integration

This component is designed to be dropped into the main app later with
minimal changes:

1. Copy `src/components/workflow/`, `src/components/controls/`,
   `src/animation/`, `src/map/`, `src/data/`, `src/hooks/` and
   `src/styles/tokens.css` into the target project.
2. Install `@turf/turf`, `gsap`, `lucide-react`, `maplibre-gl`.
3. Provide `VITE_MAP_STYLE_URL` (or an equivalent env adapter — swap
   `src/map/mapConfig.ts` for a Next.js-appropriate version) and
   `VITE_MAP_ACCESS_TOKEN`.
4. `import { GeoWorkflowDemo } from ".../workflow/GeoWorkflowDemo";`
5. Replace the current static hero map panel with
   `<GeoWorkflowDemo showPrototypeControls={false} />`.

This prototype does **not** perform that integration — it is review-only
until approved.

## 13. Known limitations

- The AOI polygon fallback shape (used only when WebGL is unavailable) is
  a fixed on-screen approximation, not a geographic reprojection of the
  real coordinates — the real MapLibre-rendered AOI (`geosphere-aoi-*`
  layers) is geographically accurate.
- 3D building extrusion only appears if the active MapLibre style exposes
  a `building` source-layer; the bundled demo-tiles fallback style does
  not, so extrusion will not be visible with the default dev style.
- Dataset preview thumbnails (`public/assets/dataset-*-preview.webp`) are
  generated placeholder art, not licensed photography — replace before
  any public-facing use.
- The free `demotiles.maplibre.org` style is for development only; do not
  ship it in production.

## 14. Asset licensing considerations

- `public/assets/map-fallback-grid.svg` and `public/favicon.svg` are
  original vector art created for this prototype.
- `public/assets/dataset-imagery-preview.webp` and
  `dataset-elevation-preview.webp` are procedurally generated placeholder
  imagery (solid gradients + simple shapes), not real satellite/DEM data —
  replace with licensed preview imagery before production use.
- The MapLibre demo style/tiles are provided by the MapLibre project for
  demonstration purposes; consult their terms before any non-development
  use, and prefer a licensed style via `VITE_MAP_STYLE_URL` otherwise.
