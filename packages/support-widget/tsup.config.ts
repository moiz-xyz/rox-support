import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2020",
  external: ["react", "react-dom", "react/jsx-runtime"],
  // Next.js App Router: the widget is a client component
  banner: { js: '"use client";' },
});
