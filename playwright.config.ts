import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

// Uses the pre-installed Chromium when present (no browser download needed).
const chromium = process.env.CHROMIUM_PATH ?? ["/opt/pw-browsers/chromium"].find((p) => existsSync(p));

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.spec\.ts/,
  workers: 1, // failure specs stop/start shared services
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: chromium, args: ["--no-sandbox"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Boots Postgres + GoTrue + SMTP sink + S3 emulator + fake Anthropic + the built app (run `npm run build` first).
  webServer: {
    command: "npx tsx e2e/stack/start.ts",
    url: "http://127.0.0.1:54999/ready",
    reuseExistingServer: true,
    timeout: 240_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 20_000 },
  },
});
