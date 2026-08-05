import { test, expect } from "@playwright/test";

test.describe("Geosphere workflow prototype", () => {
  test("loads, shows the map or fallback canvas, and reports no console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/?testMode=true");
    await expect(page.getByRole("heading", { name: "Geosphere Workflow Demo" })).toBeVisible();

    const mapCanvas = page.getByTestId("workflow-map-canvas");
    const mapFallback = page.getByTestId("workflow-map-fallback");
    await expect(mapCanvas.or(mapFallback)).toBeVisible({ timeout: 10_000 });

    expect(consoleErrors).toEqual([]);
  });

  test("progresses through AOI drawing, dataset selection, cart, secure processing and download", async ({ page }) => {
    await page.goto("/?testMode=true");
    const stageLabel = page.locator("text=/AOI DRAW/i").first();
    await expect(stageLabel).toBeVisible({ timeout: 10_000 });

    await expect(page.locator("text=/DATA SELECTION/i").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Imagery").first()).toBeVisible();
    await expect(page.getByText("Elevation").first()).toBeVisible();

    await expect(page.locator("text=/ADD TO CART/i").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=/SECURE PROCESSING/i").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Securing your order")).toBeVisible({ timeout: 10_000 });

    await expect(page.locator("text=/DOWNLOAD READY/i").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Download Ready")).toBeVisible({ timeout: 10_000 });
  });

  test("replay control returns the prototype to its initial state", async ({ page }) => {
    await page.goto("/?testMode=true");
    await expect(page.locator("text=/AOI DRAW/i").first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Replay" }).click();
    await expect(page.locator("text=/INITIALIZE|MAP BUILD/i").first()).toBeVisible({ timeout: 5_000 });
  });

  test("no horizontal overflow at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?testMode=true");
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
  });

  test("no horizontal overflow at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?testMode=true");
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasOverflow).toBe(false);
    await expect(page.getByRole("heading", { name: "Geosphere Workflow Demo" })).toBeVisible();
  });
});
