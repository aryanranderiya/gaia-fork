import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // dts disabled until residual type errors in stubs are tightened —
  // unblocks JS publish so consumers (lyon, GAIA web) can integrate now.
  // Re-enable after stubs are typed cleanly.
  dts: false,
  clean: true,
  sourcemap: true,
  // Resolve via tsconfig paths (esbuild reads tsconfig.json paths automatically).
  tsconfig: "./tsconfig.json",
  // External: keep React + heavy peer deps unbundled so consumers dedupe.
  // Externalize everything that isn't relative or path-aliased.
  // Anything starting with a letter/@ is an npm dep — peer-resolved
  // by consumers. Path-aliased imports (@/..., @shared/...) get
  // resolved into the bundle by tsconfig paths.
  external: [
    /^[a-z@]/,
    "next",
    /^next\//,
  ],
  loader: {
    ".css": "copy",
  },
  injectStyle: false,
  treeshake: true,
});
