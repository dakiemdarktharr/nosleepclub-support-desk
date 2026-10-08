import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "artifacts/e2e-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:3227",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command:
      `node node_modules/next/dist/bin/next ${process.env.SUPPORT_E2E_PRODUCTION === "true" ? "start" : "dev"} --hostname 127.0.0.1 --port 3227`,
    url: "http://127.0.0.1:3227/api/support/health",
    reuseExistingServer: false,
    env: {
      AI_PROVIDER: "mock",
      AI_MAX_ATTEMPTS: "0",
      SUPPORT_STORAGE: "memory-demo",
      SUPPORT_ACCESS_MODE: "public-demo",
      SUPPORT_VERIFY_FAULTS: "true",
      MONGODB_URI: "",
      IDENTITY_MONGODB_URI: "",
      IDENTITY_MONGODB_DB: "",
      OPENAI_API_KEY: "",
    },
    timeout: 120_000,
  },
});
