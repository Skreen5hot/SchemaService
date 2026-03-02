/**
 * Type Widening Lattice Tests
 *
 * All 15 rows from Spec §23 (Appendix A), symmetry verification,
 * three-way combinations, and null-nullable behavior.
 */

import { strictEqual } from "node:assert";
import { widenType, widenTypes } from "../src/kernel/lattice.js";
import type { Primitive } from "../src/kernel/types.js";

console.log("Type widening lattice tests\n");

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

// --- All 15 rows from Appendix A (Spec §23) ---

const appendixA: Array<[Primitive, Primitive, Primitive, boolean]> = [
  // [A, B, resolvedType, nullable]
  ["null",    "null",    "null",    true],
  ["null",    "boolean", "boolean", true],
  ["null",    "integer", "integer", true],
  ["null",    "number",  "number",  true],
  ["null",    "string",  "string",  true],
  ["boolean", "boolean", "boolean", false],
  ["boolean", "integer", "integer", false],
  ["boolean", "number",  "number",  false],
  ["boolean", "string",  "string",  false],
  ["integer", "integer", "integer", false],
  ["integer", "number",  "number",  false],
  ["integer", "string",  "string",  false],
  ["number",  "number",  "number",  false],
  ["number",  "string",  "string",  false],
  ["string",  "string",  "string",  false],
];

for (const [a, b, expectedType, expectedNullable] of appendixA) {
  test(`widenType(${a}, ${b}) → ${expectedType}, nullable=${expectedNullable}`, () => {
    const r = widenType(a, b);
    strictEqual(r.type, expectedType);
    strictEqual(r.nullable, expectedNullable);
  });
}

// --- Symmetry: widenType(a, b) === widenType(b, a) ---

const allTypes: Primitive[] = ["null", "boolean", "integer", "number", "string"];

for (const a of allTypes) {
  for (const b of allTypes) {
    test(`symmetry: widenType(${a}, ${b}) === widenType(${b}, ${a})`, () => {
      const r1 = widenType(a, b);
      const r2 = widenType(b, a);
      strictEqual(r1.type, r2.type);
      strictEqual(r1.nullable, r2.nullable);
    });
  }
}

// --- Three-way combinations ---

test("widenTypes([boolean, integer, string]) → string", () => {
  const r = widenTypes(["boolean", "integer", "string"]);
  strictEqual(r.type, "string");
  strictEqual(r.nullable, false);
});

test("widenTypes([null, boolean, integer]) → integer, nullable", () => {
  const r = widenTypes(["null", "boolean", "integer"]);
  strictEqual(r.type, "integer");
  strictEqual(r.nullable, true);
});

test("widenTypes([boolean, integer, number, string]) → string", () => {
  const r = widenTypes(["boolean", "integer", "number", "string"]);
  strictEqual(r.type, "string");
  strictEqual(r.nullable, false);
});

test("widenTypes([null, boolean, integer, number, string]) → string, nullable", () => {
  const r = widenTypes(["null", "boolean", "integer", "number", "string"]);
  strictEqual(r.type, "string");
  strictEqual(r.nullable, true);
});

// --- Null behavior ---

test("null does not widen: widenType(integer, null) → integer, nullable", () => {
  const r = widenType("integer", "null");
  strictEqual(r.type, "integer");
  strictEqual(r.nullable, true);
});

test("widenTypes empty → null, not nullable", () => {
  const r = widenTypes([]);
  strictEqual(r.type, "null");
  strictEqual(r.nullable, false);
});

test("widenTypes single → that type", () => {
  const r = widenTypes(["integer"]);
  strictEqual(r.type, "integer");
  strictEqual(r.nullable, false);
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
