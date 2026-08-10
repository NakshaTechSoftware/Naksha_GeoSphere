# geosphere-globe-workflow

> **Completely isolated prototype.** Nothing in this folder is wired into the Naksha
> GeoSphere application. It lives under `3D components/` and is reviewed independently
> before any integration decision.

A premium, cinematic, **looping** demonstration of the Naksha GeoSphere customer journey:

```
EARTH → INDIA → KARNATAKA → LOCAL LOCATION → SELECT AREA → FIND GEOSPATIAL DATA
→ SELECT DATA / FORMAT → EXPORT → PAYMENT → SECURE PREPARATION → DELIVERY TO EMAIL
→ COMPLETE → RESET → REPEAT
```

One ~31 s loop, driven by a **single deterministic GSAP timeline**. React renders the UI,
the timeline drives timing, and a MapLibre controller handles the geographic camera.
No `setInterval`-driven choreography, no dozens of scattered `setTimeout`s.

## Stack

React 18 · TypeScript · Vite · **MapLibre GL JS 4.7.1** (single renderer — native globe
projection + automatic globe→Mercator transition) · GSAP 3.12 · Turf.js · Lucide React ·
Vitest · Playwright

## Run it

```bash
cd "3D components/geosphere-globe-workflow"
npm install
npm run dev
```

Open **http://localhost:5173**

Optional: copy `.env.example` to `.env` and set `VITE_MAP_STYLE_URL` /
`VITE_MAP_ACCESS_TOKEN` to use a real basemap for the local-map stage. Without them the
prototype falls back to a local pale-blue grid + simplified real geography (see
`GEODATA_SOURCES.md`).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (port 5173) |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve the production build |
| `npm run test` | Vitest unit + logic + 30-loop stability |
| `npm run test:e2e` | Playwright end-to-end workflow test |
| `npm run stress` | 30-loop stability test only |

## How the loop works

1. **Globe** — MapLibre globe projection, Polar-Pearl atmosphere, pale-blue oceans,
   fine lat/long grid, Atlas Cobalt highlights, slow premium rotation.
2. **India** — camera rotates/zooms to India; real national outline glows Atlas Cobalt.
3. **Karnataka** — state boundaries appear subtly; Karnataka highlighted; breadcrumb
   `India › Karnataka`.
4. **Local fly-in** — the camera dives to a real Karnataka city; MapLibre's built-in
   globe→Mercator transition (around zoom 5) smoothly reduces curvature; the approved
   light map UI (Layers / Search / Selected Data / dataset cards) assembles.
5. **AOI** — an animated synthetic cursor draws an **irregular 7-point polygon**
   point-by-point; Turf computes the real geodesic area.
6. **Data** — scanning sweep; Imagery + KML/KMZ selected; price counts up in **INR**.
7. **Export → Payment → Secure processing → Email delivery → Success** — all simulated
   with mocked, deterministic data (no real transactions anywhere).
8. **Reset** — cinematic zoom back out to the globe, then the next loop flies to the
   **next city** (Bengaluru → Mysuru → Chikkamagaluru → Mangaluru → Hubballi-Dharwad → …).

## Geography

All India/Karnataka geometry is **real** and stored locally in `public/geodata/` —
see `GEODATA_SOURCES.md` for provenance and licence notes.

## Performance & stability

- Single MapLibre instance; map, sources and layers are created **once** and reused
  every loop. Only the cheap GSAP timeline is rebuilt per loop.
- Pauses when the tab is hidden or the component scrolls off screen; resumes gracefully.
- 30-loop stability is enforced by `src/tests/stress.test.ts` (timeline sync, location
  rotation, stage order) and by `npm run test:e2e` (two full loops in a real browser).
- `prefers-reduced-motion` is respected: no continuous rotation, crossfade-style
  transitions, no automatic infinite looping.

## Accessibility

The animation is decorative/product-explanatory. A hidden accessible description
(`.sr-only`) explains the whole journey; `aria-live` announces only major stage changes;
the synthetic cursor is `aria-hidden="true"`.

## Component API

```tsx
<GlobeWorkflow
  autoPlay            // true
  loop                // true
  playbackRate        // 1
  startLocationIndex  // 0
  showPrototypeControls // true (review panel outside the component)
  reducedMotion       // optional override
  onStageChange       // (stage: WorkflowStage) => void
  onLoopComplete      // (locationIndex: number) => void
  className
/>
```

## Review controls

The dev review panel (top-left of the review page, **outside** the component) offers
Play / Pause / Restart, Previous / Next stage, Loop ON/OFF, playback speed
(0.5× / 1× / 1.5× / 2×), location picker, reduced-motion preview, and live stage /
location / timeline position / FPS readouts.

## No real transactions

This prototype performs **no** real payments, emails, database writes, API calls, uploads,
or MinIO writes. All data is deterministic mock data inside this folder.
