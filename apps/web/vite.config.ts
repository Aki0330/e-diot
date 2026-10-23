import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite 配置（P0 只搭骨架，P5 迁入 4 个视图 + 3 个弹窗）。
 * 开发期把 /api 与 /health 代理到 Fastify，避免本地跨域。
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
