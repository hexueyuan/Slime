import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: resolve("src/cli/index.ts"),
      formats: ["es"],
      fileName: () => "slime-cli.js",
    },
    outDir: "resources",
    emptyOutDir: false,
    rollupOptions: {
      external: ["electron", "fs", "path", "os", "child_process", "crypto", "util"],
    },
    target: "node18",
    sourcemap: false,
    minify: false,
  },
});
