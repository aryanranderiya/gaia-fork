import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  // Resolve via tsconfig paths (esbuild reads tsconfig.json paths automatically).
  tsconfig: "./tsconfig.json",
  // External: keep React + heavy peer deps unbundled so consumers dedupe.
  external: [
    "react",
    "react-dom",
    "next",
    "next/image",
    "next/link",
    "next/navigation",
    "next/dynamic",
    "motion",
    "motion/react",
    "motion/react-m",
    /^@heroui\//,
    /^@hugeicons\//,
    "@theexperiencecompany/gaia-icons",
    "@theexperiencecompany/gaia-icons/dist/solid-rounded",
    "react-markdown",
    "react-syntax-highlighter",
    /^remark/,
    /^rehype/,
    "zustand",
    "zod",
    "axios",
    "posthog-node",
    "posthog-js",
    "posthog-js/react",
  ],
  loader: {
    ".css": "copy",
  },
  injectStyle: false,
  treeshake: true,
});
