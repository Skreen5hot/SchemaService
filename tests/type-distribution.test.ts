/**
 * typeDistribution Accumulation Test
 *
 * CRITICAL: This test was written BEFORE implementation (Phase 0.5).
 * It validates that typeDistribution records pre-widening observation counts,
 * NOT the resolved/widened type applied retroactively.
 *
 * Test case from Spec §17.2 and ADR-003:
 *   CSV column with 100 rows: 95 integers, 3 strings, 2 empty (null).
 *   Expected: primitiveType "string" (lattice: integer + string → string),
 *             nullable true,
 *             typeDistribution { "null": 2, "integer": 95, "string": 3 },
 *             sum(typeDistribution) === occurrences === 100.
 *
 * If the engine accumulates distributions post-widening, it will produce
 * { "string": 100 } — which is WRONG and breaks downstream consensus logic.
 */

import { deepStrictEqual, strictEqual } from "node:assert";
import type { SchemaNode, SchemaEdge, InferConfig } from "../src/kernel/types.js";
import { createDefaultConfig } from "../src/kernel/types.js";
import { normalizeCSV } from "../src/kernel/normalize-csv.js";
import { inferSchema } from "../src/kernel/infer.js";
import { rootId, arrayItemId } from "../src/kernel/node-id.js";

console.log("typeDistribution accumulation tests\n");

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

// --- Build a CSV with 100 rows: 95 integers, 3 strings, 2 empty ---
function buildCSV(): string {
  // Use 2 columns so empty "value" fields don't produce empty lines
  // (Papa Parse skipEmptyLines: "greedy" skips lines that are entirely empty)
  const rows: string[] = ["id,value"];
  for (let i = 0; i < 95; i++) {
    rows.push(`${i + 1},${i + 1}`); // integers: "1" through "95"
  }
  rows.push("96,hello");   // string 1
  rows.push("97,world");   // string 2
  rows.push("98,abc");     // string 3
  rows.push("99,");        // empty → null (line is "99," — not empty)
  rows.push("100,");       // empty → null (line is "100," — not empty)
  return rows.join("\n");
}

// --- Full pipeline: CSV normalize → infer ---
function inferCSV(csv: string, config?: InferConfig) {
  const c = config ?? createDefaultConfig();
  const normalized = normalizeCSV(csv, c);
  if (!normalized.records) throw new Error("CSV normalization failed");

  // Infer: records → object node at #/[] (wrapped in array root)
  const itemNodeId = arrayItemId(rootId());
  const result = inferSchema(normalized.records, c, itemNodeId);

  const arrayRoot: SchemaNode = {
    id: rootId(),
    kind: "array",
    itemType: result.root,
    occurrences: 1,
  };

  return { root: arrayRoot, nodeIndex: result.nodeIndex, diagnostics: result.diagnostics };
}

// --- Test: typeDistribution records pre-widening counts ---

test("primitiveType is 'string' after lattice widening", () => {
  const { root } = inferCSV(buildCSV());

  strictEqual(root.kind, "array");
  const itemType = root.itemType;
  if (!itemType || itemType.kind !== "object") {
    throw new Error("Expected object itemType for CSV");
  }

  const valueEdge = itemType.properties?.find((e: SchemaEdge) => e.name === "value");
  if (!valueEdge) throw new Error("Expected 'value' property in CSV schema");

  strictEqual(valueEdge.target.primitiveType, "string");
});

test("nullable is true (2 empty values → null)", () => {
  const { root } = inferCSV(buildCSV());
  const itemType = root.itemType!;
  const valueEdge = itemType.properties!.find((e: SchemaEdge) => e.name === "value")!;
  strictEqual(valueEdge.target.nullable, true);
});

test("typeDistribution records pre-widening counts { null: 2, integer: 95, string: 3 }", () => {
  const { root } = inferCSV(buildCSV());
  const itemType = root.itemType!;
  const valueEdge = itemType.properties!.find((e: SchemaEdge) => e.name === "value")!;
  deepStrictEqual(valueEdge.target.typeDistribution, { null: 2, integer: 95, string: 3 });
});

test("sum(typeDistribution) === occurrences", () => {
  const { root } = inferCSV(buildCSV());
  const itemType = root.itemType!;
  const valueEdge = itemType.properties!.find((e: SchemaEdge) => e.name === "value")!;
  const dist = valueEdge.target.typeDistribution!;
  const sum = Object.values(dist).reduce((a, b) => a + (b ?? 0), 0);
  strictEqual(sum, valueEdge.target.occurrences);
});

test("occurrences is 100", () => {
  const { root } = inferCSV(buildCSV());
  const itemType = root.itemType!;
  const valueEdge = itemType.properties!.find((e: SchemaEdge) => e.name === "value")!;
  strictEqual(valueEdge.target.occurrences, 100);
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
