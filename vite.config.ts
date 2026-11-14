import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "OpenTuner",
        short_name: "OpenTuner",
        description: "Just tune your guitar.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#211a16",
        theme_color: "#211a16",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webp,woff2,mp3}"],
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(process.env.OPENTUNER_VERSION || "local") },
  server: { port: 5175, strictPort: true },
  preview: { port: 4175, strictPort: true },
  build: { target: "es2022" },
});
