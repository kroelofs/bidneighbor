import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Two SPAs from one build: the user app (index.html) and the admin app (admin.html).
// Output goes to cloud/public, which the Worker serves as static assets.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "cloud/public",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // During `npm run dev:web`, proxy API calls to the local Worker (wrangler dev).
      "/api": "http://127.0.0.1:8787",
    },
  },
});
