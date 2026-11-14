import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  use: {
    baseURL: "http://localhost:4175",
    viewport: { width: 390, height: 844 },
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    command: "bun run preview",
    url: "http://localhost:4175",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
});
