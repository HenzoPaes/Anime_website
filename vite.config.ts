// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
    proxy: {
      // Em dev, o Vite faz proxy da /api para o Express
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  // Garante que JSONs grandes NÃO sejam bundlados pelo Vite
  assetsInclude: [],
});
