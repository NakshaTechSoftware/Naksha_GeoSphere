import { expect, test } from "@playwright/test";

/**
 * Scaffold E2E spec. Requires a running instance at PLAYWRIGHT_BASE_URL
 * (see playwright.config.ts) — not wired into CI yet since there is no
 * marketplace flow to exercise. Run manually with `pnpm test:e2e` once
 * `pnpm dev` or the Docker stack is up.
 */
test("home page renders the Naksha GeoSphere hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Naksha GeoSphere" })).toBeVisible();
});
