/**
 * Build script for BIBSS browser bundle.
 *
 * Bundles site/entry.ts → site/dist/bibss.js as an IIFE.
 * Swaps src/kernel/hash.ts with site/shims/hash.ts for browser compatibility.
 */

import * as esbuild from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/** Plugin to redirect kernel hash.ts to the browser shim. */
const hashShimPlugin = {
  name: "hash-shim",
  setup(build) {
    build.onResolve({ filter: /\/hash\.js$/ }, (args) => {
      // Only intercept the kernel's hash import
      if (args.importer.includes("kernel")) {
        return { path: resolve(root, "site", "shims", "hash.ts") };
      }
    });
  },
};

await esbuild.build({
  entryPoints: [resolve(root, "site", "entry.ts")],
  bundle: true,
  outfile: resolve(root, "site", "dist", "bibss.js"),
  format: "iife",
  globalName: "BIBSS",
  platform: "browser",
  target: ["es2022"],
  plugins: [hashShimPlugin],
  logLevel: "info",
});
