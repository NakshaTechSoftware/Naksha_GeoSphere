# @naksha/configuration

Shared base configuration for Naksha GeoSphere JavaScript/TypeScript
packages (`tsconfig.base.json` today). `apps/web/tsconfig.json` currently
defines its own compiler options because Next.js requires several
App-Router-specific settings; extend `tsconfig.base.json` from here once a
second TypeScript app exists and the duplication becomes real.
