import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs separately (port 3100); the dev server forwards API paths to it so
// the browser still sees one origin, as it does in production.
const apiUrl = process.env.API_URL ?? "http://localhost:3100";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
  server: {
    host: true,
    port: 5190,
    strictPort: true,
    proxy: {
      "/api": apiUrl,
      "/health": apiUrl,
    },
  },
});
