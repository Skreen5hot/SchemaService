/**
 * Adapter Registry Tests (Phase 5.1)
 *
 * Tests for register, get, list per Spec §11.3.
 */

import { deepStrictEqual, strictEqual } from "node:assert";
import type { CISMRoot } from "../src/kernel/types.js";
import { createAdapterRegistry } from "../src/kernel/adapter-registry.js";

console.log("adapter-registry tests\n");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  \u2713 PASS: ${name}`);
    passed++;
  } catch (error) {
    console.error(`  \u2717 FAIL: ${name}`);
    console.error("   ", error instanceof Error ? error.message : String(error));
    failed++;
  }
}

// --- Tests ---

test("register and get an adapter", () => {
  const registry = createAdapterRegistry();
  const adapter = (cism: CISMRoot) => ({ version: cism.version });
  registry.register("test", adapter);
  strictEqual(registry.get("test"), adapter);
});

test("get returns undefined for unregistered name", () => {
  const registry = createAdapterRegistry();
  strictEqual(registry.get("nonexistent"), undefined);
});

test("list returns registered adapter names", () => {
  const registry = createAdapterRegistry();
  const noop = () => ({});
  registry.register("alpha", noop);
  registry.register("beta", noop);
  deepStrictEqual(registry.list(), ["alpha", "beta"]);
});

test("list returns empty array when no adapters registered", () => {
  const registry = createAdapterRegistry();
  deepStrictEqual(registry.list(), []);
});

test("register overwrites existing adapter with same name", () => {
  const registry = createAdapterRegistry();
  const first = () => "first";
  const second = () => "second";
  registry.register("dup", first);
  registry.register("dup", second);
  strictEqual(registry.get("dup"), second);
  deepStrictEqual(registry.list(), ["dup"]);
});

test("multiple registries are independent", () => {
  const r1 = createAdapterRegistry();
  const r2 = createAdapterRegistry();
  r1.register("only-in-r1", () => ({}));
  strictEqual(r2.get("only-in-r1"), undefined);
  deepStrictEqual(r2.list(), []);
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
