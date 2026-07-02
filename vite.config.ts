import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single SPA (index.html); the admin dashboard is a lazy-loaded /admin route inside it.
// Output goes to cloud/public, which the Worker serves as static assets.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "cloud/public",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // During `npm run dev:web`, proxy API calls to the local Worker (wrangler dev).
      "/api": "http://127.0.0.1:8787",
    },
  },
});
