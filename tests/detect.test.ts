/**
 * Format Detection Tests
 *
 * Per BIBSS Spec §6.3.
 */

import { strictEqual } from "node:assert";
import { detectFormat } from "../src/kernel/detect.js";
import { createDefaultConfig } from "../src/kernel/types.js";

console.log("Format detection tests\n");

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

const defaults = createDefaultConfig();

// --- Heuristic detection ---

test("JSON array with leading whitespace → json", () => {
  strictEqual(detectFormat("  [1,2]", defaults), "json");
});

test("JSON object with leading whitespace → json", () => {
  strictEqual(detectFormat("  {}", defaults), "json");
});

test("CSV header → csv", () => {
  strictEqual(detectFormat("name,age\nAlice,30\n", defaults), "csv");
});

test("JSON object no whitespace → json", () => {
  strictEqual(detectFormat('{"a":1}', defaults), "json");
});

test("Empty string → csv (fallback)", () => {
  strictEqual(detectFormat("", defaults), "csv");
});

test("Whitespace only → csv (fallback)", () => {
  strictEqual(detectFormat("   ", defaults), "csv");
});

// --- Explicit format override ---

test("Explicit format csv overrides JSON-looking content", () => {
  strictEqual(detectFormat("[1,2,3]", { ...defaults, format: "csv" }), "csv");
});

test("Explicit format json overrides CSV-looking content", () => {
  strictEqual(detectFormat("name,age\n", { ...defaults, format: "json" }), "json");
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
