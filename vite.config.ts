import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
  server: {
    host: true,
    port: 3000, // Seu site (React) vai abrir aqui!
    proxy: {
      "/api": {
        target: "http://localhost:8080", // Sua API (Express) vai responder aqui!
        changeOrigin: true,
        // 👇 A LINHA 'rewrite' FOI APAGADA DAQUI! 
      },
    },
    allowedHosts: [
      "animeverse-cket.onrender.com",
      "localhost",
      "127.0.0.1"
    ]
  },
});