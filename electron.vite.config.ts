import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import svgLoader from "vite-svg-loader";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@": resolve("src/main/"),
        "@shared": resolve("src/shared"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
        "@shadcn": resolve("src/shadcn"),
        vue: "vue/dist/vue.esm-bundler.js",
      },
    },
    plugins: [tailwindcss(), vue(), svgLoader()],
    build: {
      minify: "esbuild",
      cssCodeSplit: false,
    },
  },
});
