/**
 * SHA-256 hash abstraction.
 *
 * Node.js implementation using node:crypto. For browser builds,
 * esbuild swaps this module with a pure-JS shim (ADR-005).
 */

import { createHash } from "node:crypto";

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
