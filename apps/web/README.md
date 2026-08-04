# apps/web — Naksha GeoSphere Frontend

Next.js (App Router) + TypeScript + Tailwind CSS starter for the Naksha
GeoSphere marketplace UI.

## Scripts

```bash
pnpm install        # from the repo root (workspace install)
pnpm --filter @naksha/web dev          # start dev server on :3000
pnpm --filter @naksha/web build        # production build (standalone output)
pnpm --filter @naksha/web start        # run the production build
pnpm --filter @naksha/web lint         # ESLint
pnpm --filter @naksha/web format       # Prettier (write)
pnpm --filter @naksha/web format:check # Prettier (check only)
pnpm --filter @naksha/web typecheck    # tsc --noEmit
pnpm --filter @naksha/web test         # Vitest + React Testing Library
pnpm --filter @naksha/web test:e2e     # Playwright (scaffold, manual)
```

## Structure

```
src/
  app/            Next.js App Router entrypoints (layout, page)
  components/
    ui/           Design-system primitives (Button, Card, Badge, ...)
    layout/       Header, Footer
    map/          MapLibre GL JS placeholder
  lib/             Typed API client, env config, class-name helper
  styles/          Design tokens (CSS variables) + Tailwind entrypoint
  types/           Shared frontend types
tests/
  components/      Vitest + RTL unit tests
  lib/              Vitest unit tests for the API client
  e2e/              Playwright scaffold
```

## Design tokens

Brand colors live in `src/styles/tokens.css` as CSS variables and are
exposed to Tailwind via `tailwind.config.ts` (`spatial-navy`, `geo-teal`,
`cloud-mist`). Components must use these, not hard-coded hex values.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL the browser uses to call the FastAPI backend |
| `NEXT_PUBLIC_APP_NAME` | Display name shown in metadata |

Set these in the repo-root `.env` — Compose passes them through as build
args / runtime env for the `web` service.
