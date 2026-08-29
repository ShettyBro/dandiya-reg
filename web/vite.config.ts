import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Dandiya Night 2026 Volunteer",
        short_name: "DN26 Volunteer",
        description: "Volunteer scanner portal for Dandiya Night 2026",
        start_url: "/volunteer/home",
        scope: "/",
        display: "standalone",
        background_color: "#0f1122",
        theme_color: "#0f1122",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2}"],
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  server: {
    port: 5173,
    host: true
  },
  build: {
    sourcemap: true
  }
});
