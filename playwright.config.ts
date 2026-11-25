/// <reference types="node" />
import { createServer } from "node:net";

import { defineConfig, devices } from "@playwright/test";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address !== "string") resolve(address.port);
        else reject(new Error("Could not allocate a Playwright test port"));
      });
    });
  });
}

const port = Number(process.env["PW_PORT"] ?? (await freePort()));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PW_PORT must be an integer from 1 through 65535");
}
process.env["PW_PORT"] = String(port);
const baseURL = `http://127.0.0.1:${port}/brick-track-planner/`;

export default defineConfig({
  testDir: "tests/playwright",
  testIgnore: ["**/_temp*", "**/dist_*/**"],
  timeout: 30_000,
  fullyParallel: true,
  workers: process.env["CI"] ? 2 : 4,
  reporter: "list",
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "touch", use: { ...devices["Pixel 7"] } },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch: [
        "**/member_design.spec.ts",
        "**/sharing.spec.ts",
        "**/bluebrick_geometry.spec.ts",
      ],
    },
  ],
  webServer: {
    command: `bash tests/playwright/helper_pages_server.sh ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 1000 },
    timeout: 30_000,
  },
});
