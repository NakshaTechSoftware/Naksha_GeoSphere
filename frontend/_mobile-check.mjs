import { chromium } from "@playwright/test";

const GLOBE_SEL = "section.relative.overflow-hidden div.relative.hidden.w-full.px-0";

const browser = await chromium.launch();

// Phone size (390x844, common mobile resolution)
let page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3000/welcome-page", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2500);
const mobile = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const badge = [...document.querySelectorAll("span")].find((s) =>
    s.textContent.includes("Global Coverage")
  );
  return {
    globeElementFound: !!el,
    globeDisplay: el ? getComputedStyle(el).display : "NOT FOUND",
    badgeVisible: badge ? getComputedStyle(badge).display !== "none" : false,
    heroSectionHeight: Math.round(
      document.querySelector("section.relative.overflow-hidden")?.getBoundingClientRect().height ?? 0
    ),
  };
}, GLOBE_SEL);
console.log("MOBILE 390px:", JSON.stringify(mobile));
await page.screenshot({ path: "E:/downloads/welcome-mobile.png", fullPage: true });

// Desktop size
page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/welcome-page", { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2500);
const desktop = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return { globeDisplay: el ? getComputedStyle(el).display : "NOT FOUND" };
}, GLOBE_SEL);
console.log("DESKTOP 1280px:", JSON.stringify(desktop));
await page.screenshot({ path: "E:/downloads/welcome-desktop.png", fullPage: true });

await browser.close();
