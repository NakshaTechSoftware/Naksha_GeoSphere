import { chromium } from "playwright";

const SHOT_DIR = "C:/Users/NT01173/AppData/Local/Temp/claude/h--Naksha-GeoSphere/073bb859-9567-43cd-83ac-57cc5e0e25d9/scratchpad/shots";

async function checkMode(browser, label, clickTitle, waitMs = 6000) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERR: " + e.message));

  await page.goto("http://localhost:3200/explore", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("canvas.maplibregl-canvas", { timeout: 30000 });
  await page.waitForSelector('button[aria-label="Weather details"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click('button[aria-label="Weather details"]');
  await page.waitForTimeout(500);
  if (clickTitle) {
    await page.click(`button[title="${clickTitle}"]`);
    await page.waitForTimeout(waitMs);
  }
  await page.screenshot({ path: `${SHOT_DIR}/90-regression-${label}.png` });
  console.log(label, "errors:", JSON.stringify(errors.slice(0, 8)));
  await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  await checkMode(browser, "rain", "Rain", 9000);
  await checkMode(browser, "clouds", "Clouds", 15000);
  await checkMode(browser, "wind", "Wind", 6000);
  await checkMode(browser, "satellite", "Satellite", 6000);
  await checkMode(browser, "aqi", "AQI", 4000);
  await browser.close();
}
main().catch((e) => { console.error("DRIVER_ERROR", e); process.exit(1); });
