import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Vite + React + PWA. We deliberately keep this minimal:
// no proxy, no API routes, no SSR. Output is fully static.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false, // we register the SW ourselves so we can log it
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Little Loop",
        short_name: "Little Loop",
        description:
          "Capture one moment a day. Watch your child grow. Local only.",
        theme_color: "#f6efe6",
        background_color: "#fbf7f1",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        // never cache user-generated blobs through the service worker
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  build: {
    target: "es2022",
    sourcemap: false,
    // FFmpeg core is loaded from a CDN at runtime (single-threaded core).
    // It is NOT bundled into the main JS to keep the app shell small.
    rollupOptions: {
      output: {
        manualChunks: {
          dexie: ["dexie"],
          jszip: ["jszip"],
          ffmpeg: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
        },
      },
    },
  },
  worker: {
    format: "es",
  },
});