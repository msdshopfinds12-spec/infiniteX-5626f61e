import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Keep the development server local-only unless LAN access is explicitly requested.\n    host: "127.0.0.1",
    port: 5173,
  },
});
