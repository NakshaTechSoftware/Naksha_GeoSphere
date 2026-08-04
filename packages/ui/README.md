# @naksha/ui

Shared design tokens for Naksha GeoSphere. Today this only re-exports the
brand color constants (`brandColors`) as plain TypeScript values for
non-CSS consumers. `apps/web` currently owns its own React UI primitives
(`Button`, `Card`, `Badge`, ...) directly under `apps/web/src/components/ui`
— they will move here once a second consumer (e.g. an admin app) needs to
share them, to avoid a premature abstraction.
