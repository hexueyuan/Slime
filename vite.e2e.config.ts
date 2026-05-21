import { resolve } from "path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import svgLoader from "vite-svg-loader";

export default defineConfig({
  root: resolve("src/renderer"),
  resolve: {
    alias: {
      "@": resolve("src/renderer/src"),
      "@shared": resolve("src/shared"),
      "@shadcn": resolve("src/shadcn"),
      vue: "vue/dist/vue.esm-bundler.js",
    },
  },
  plugins: [tailwindcss(), vue(), svgLoader()],
  server: {
    host: "127.0.0.1",
    port: 4178,
    strictPort: true,
  },
});
