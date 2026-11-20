import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Loopback-only by default; opt in to LAN access explicitly on trusted Wi-Fi.
    host: "127.0.0.1",
    port: 5173,
  },
});
