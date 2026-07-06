import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { "@shared": resolve("src/shared") },
    },
    build: {
      outDir: "out/main",
      rollupOptions: { output: { format: "es" } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { "@shared": resolve("src/shared") },
    },
    build: {
      outDir: "out/preload",
      rollupOptions: { output: { format: "cjs" } },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@": resolve("src/renderer/src"),
      },
    },
    build: { outDir: "out/renderer" },
  },
});
