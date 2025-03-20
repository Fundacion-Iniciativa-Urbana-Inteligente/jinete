import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import tailwindcss from '@tailwindcss/vite'

dotenv.config();

export default defineConfig({
  plugins: [
    tailwindcss(), react(),
  ],

  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.PORT || 8080}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  optimizeDeps: {
    include: [
      "firebase/app",
      "firebase/analytics",
      "firebase/auth",
      "firebase/app-check",
    ],
  },
});
