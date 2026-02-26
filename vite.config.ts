import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "Logo.png"],
      manifest: {
        name: "AnimeVerse Official",
        short_name: "AnimeVerse",
        description: "Assista seus animes licenciados favoritos",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        icons: [
          { src: "Logo.png", sizes: "192x192", type: "image/png" },
          { src: "Logo.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      }
    })
  ],
  // ... resto do seu server e proxy
});