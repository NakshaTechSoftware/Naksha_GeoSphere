import { defineConfig, devices } from "@playwright/test";

// Isolated prototype e2e suite. Starts its own preview server on port 5199.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5199",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5199",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
