import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev, /api calls go to the FastAPI server on port 8000.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
