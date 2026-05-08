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
  // Externalize npm packages while bundling path-aliased and relative imports.
  // Negative lookahead excludes @/..., @shared/..., ./, ../, /  — these resolve
  // via tsconfig paths or relative paths and must be inlined into the bundle.
  // Everything else is treated as a peer/runtime npm dep.
  external: [/^(?!@\/|@shared\/|\.\.?\/|\/)/],
  loader: {
    ".css": "copy",
  },
  injectStyle: false,
  treeshake: true,
});
