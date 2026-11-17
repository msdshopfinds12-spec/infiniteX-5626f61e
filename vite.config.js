import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Keep the development server local-only. Use an authenticated tunnel
    // for remote development instead of exposing Vite directly to the LAN.
    host: "127.0.0.1",
    port: 5173,
  },
});
