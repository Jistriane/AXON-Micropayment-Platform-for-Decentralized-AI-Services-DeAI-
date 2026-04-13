import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: true
  },
  webServer: [
    {
      command: "AXON_GATEWAY_DATA_FILE=/tmp/axon-gateway-playwright.json npm run dev --workspace services/gateway",
      url: "http://localhost:8080/health",
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command:
        "NEXT_PUBLIC_GATEWAY_URL=http://127.0.0.1:8080 NEXT_PUBLIC_ENABLE_TX_STATUS_LOOKUP=true NEXT_PUBLIC_TX_STATUS_POLL_INTERVAL_MS=150 NEXT_PUBLIC_TX_STATUS_MAX_POLLS=8 npm run dev --workspace apps/web",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 120_000
    }
  ]
});
