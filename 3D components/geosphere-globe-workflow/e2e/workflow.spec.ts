import { test, expect, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

test.describe("geosphere-globe-workflow e2e", () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));
    (page as unknown as { __errors: string[] }).__errors = errors;
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-testid="globe-workflow"]');
  });

  test.afterEach(async () => {
    const errors = (page as unknown as { __errors: string[] }).__errors ?? [];
    expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
    await page.close();
  });

  test("prototype launches and the workflow component is visible", async () => {
    await expect(page.locator('[data-testid="globe-workflow"]')).toBeVisible();
    const canvas = page.locator(".maplibregl-canvas, [data-map-canvas]");
    // Either MapLibre canvas or the grid fallback must be present.
    await expect
      .poll(async () => (await canvas.count()) > 0 || (await page.locator(".globe-grid").count()) > 0)
      .toBe(true);
  });

  test("travels through the full workflow to delivery and resets for a second loop", async () => {
    const stage = page.locator('[data-testid="globe-workflow"]');
    const seen: string[] = [];

    await expect
      .poll(
        async () => {
          const s = await stage.getAttribute("data-workflow-stage");
          if (s && seen[seen.length - 1] !== s) seen.push(s);
          return s;
        },
        { timeout: 45_000, intervals: [500] }
      )
      .toMatch(/RESET|BOOT/);

    // Give the whole loop time to advance through the major milestones.
    const milestones = [
      "GLOBE_INTRO",
      "ROTATE_TO_INDIA",
      "KARNATAKA_FOCUS",
      "AOI_SELECTION",
      "PAYMENT",
      "SECURE_PROCESSING",
      "EMAIL_DELIVERY",
      "DELIVERY_COMPLETE",
      "RESET",
    ];
    for (const m of milestones) {
      await expect
        .poll(
          () => seen.includes(m),
          { timeout: 45_000, intervals: [250] }
        )
        .toBe(true);
    }

    // Second loop begins (BOOT reached again after the first RESET).
    await expect
      .poll(
        () => seen.filter((s) => s === "BOOT").length >= 2,
        { timeout: 45_000, intervals: [250] }
      )
      .toBe(true);
  });

  test("no horizontal overflow at hero size", async () => {
    await page.setViewportSize({ width: 800, height: 500 });
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth;
    });
    expect(overflow).toBe(false);
  });
});
