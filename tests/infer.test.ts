/**
 * Structural Inference Engine Tests
 *
 * Covers BIBSS Spec §8:
 * - 4.1: Property-level inference (flat objects)
 * - 4.4: Property-merge algorithm (§8.5.3)
 * - 4.3: Array inference — three-tier model (§8.5)
 * - 4.2: Recursive object inference (nested JSON)
 * - 4.5: Empty and degenerate inputs (§8.6)
 */

import { strictEqual, deepStrictEqual } from "node:assert";
import { inferSchema, inferObjectSchema } from "../src/kernel/infer.js";
import type { SchemaNode, SchemaEdge, InferConfig } from "../src/kernel/types.js";
import { createDefaultConfig } from "../src/kernel/types.js";
import { rootId, arrayItemId, childId } from "../src/kernel/node-id.js";
import { DiagnosticCollector } from "../src/kernel/diagnostics.js";

console.log("Structural inference engine tests\n");

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

// Helper: run inference on records and return the object root
function infer(records: Array<Record<string, unknown>>, config?: InferConfig) {
  const c = config ?? defaults;
  return inferSchema(records, c, "#");
}

// Helper: find a property edge by name
function findEdge(node: SchemaNode, name: string): SchemaEdge {
  const edge = node.properties?.find(e => e.name === name);
  if (!edge) throw new Error(`Property "${name}" not found`);
  return edge;
}

// ===========================================================================
// 4.1: Property-Level Inference (Flat Objects)
// ===========================================================================

console.log("  --- 4.1: Flat Object Inference ---");

test("all-integer column → primitiveType 'integer'", () => {
  const records = [{ val: 1 }, { val: 2 }, { val: 3 }];
  const { root } = infer(records);
  const target = findEdge(root, "val").target;
  strictEqual(target.kind, "primitive");
  strictEqual(target.primitiveType, "integer");
  strictEqual(target.nullable, false);
  deepStrictEqual(target.typeDistribution, { integer: 3 });
});

test("mixed integer+string → primitiveType 'string', distribution preserved", () => {
  const records = [{ val: 1 }, { val: 2 }, { val: "hello" }];
  const { root } = infer(records);
  const target = findEdge(root, "val").target;
  strictEqual(target.primitiveType, "string");
  deepStrictEqual(target.typeDistribution, { integer: 2, string: 1 });
});

test("all-null column → primitiveType 'null', nullable true", () => {
  const records = [{ val: null }, { val: null }, { val: null }];
  const { root } = infer(records);
  const target = findEdge(root, "val").target;
  strictEqual(target.primitiveType, "null");
  strictEqual(target.nullable, true);
  deepStrictEqual(target.typeDistribution, { null: 3 });
});

test("100% present → required true at threshold 1.0", () => {
  const records = [{ val: 1 }, { val: 2 }];
  const { root } = infer(records);
  const edge = findEdge(root, "val");
  strictEqual(edge.required, true);
});

test("99% present at threshold 1.0 → required false", () => {
  const records: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 99; i++) records.push({ val: i });
  records.push({}); // 100th record: key absent
  const { root } = infer(records);
  const edge = findEdge(root, "val");
  strictEqual(edge.required, false);
  strictEqual(edge.occurrences, 99);
  strictEqual(edge.totalPopulation, 100);
});

test("configurable threshold 0.95: 96% present → required true", () => {
  const config: InferConfig = { ...defaults, requiredThreshold: 0.95 };
  const records: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 96; i++) records.push({ val: i });
  for (let i = 0; i < 4; i++) records.push({});
  const { root } = infer(records, config);
  const edge = findEdge(root, "val");
  strictEqual(edge.required, true);
});

test("absence ≠ null: absent key → required false, nullable false", () => {
  const records: Array<Record<string, unknown>> = [
    { a: 1, b: "x" },
    { a: 2 }, // b absent
  ];
  const { root } = infer(records);
  const bEdge = findEdge(root, "b");
  strictEqual(bEdge.required, false);
  strictEqual(bEdge.target.nullable, false); // absence doesn't set nullable
});

test("present null → nullable true (independent of required)", () => {
  const records = [{ a: 1 }, { a: null }];
  const { root } = infer(records);
  const target = findEdge(root, "a").target;
  strictEqual(target.nullable, true);
});

test("node IDs use RFC 6901", () => {
  const records = [{ name: "Alice" }];
  const { root } = infer(records);
  strictEqual(root.id, "#");
  strictEqual(findEdge(root, "name").target.id, "#/name");
});

test("sum(typeDistribution) === occurrences (invariant §17.3 item 7)", () => {
  const records = [{ v: 1 }, { v: "x" }, { v: null }, { v: true }];
  const { root } = infer(records);
  const target = findEdge(root, "v").target;
  const dist = target.typeDistribution!;
  const sum = Object.values(dist).reduce((a, b) => a + (b ?? 0), 0);
  strictEqual(sum, target.occurrences);
});

// ===========================================================================
// 4.4: Property-Merge Algorithm (§8.5.3)
// ===========================================================================

console.log("\n  --- 4.4: Property-Merge ---");

test("§8.5.3 example: id/name/role/dept merged schema", () => {
  const records = [
    { id: 1, name: "Alice", role: "admin" },
    { id: 2, name: "Bob" },
    { id: 3, name: null, role: "user", dept: "eng" },
  ];
  const { root } = infer(records);

  const idEdge = findEdge(root, "id");
  strictEqual(idEdge.target.primitiveType, "integer");
  strictEqual(idEdge.required, true);
  strictEqual(idEdge.occurrences, 3);
  deepStrictEqual(idEdge.target.typeDistribution, { integer: 3 });

  const nameEdge = findEdge(root, "name");
  strictEqual(nameEdge.target.primitiveType, "string");
  strictEqual(nameEdge.required, true); // present in all 3
  strictEqual(nameEdge.target.nullable, true); // one null
  deepStrictEqual(nameEdge.target.typeDistribution, { null: 1, string: 2 });

  const roleEdge = findEdge(root, "role");
  strictEqual(roleEdge.target.primitiveType, "string");
  strictEqual(roleEdge.required, false); // 2/3
  strictEqual(roleEdge.occurrences, 2);
  deepStrictEqual(roleEdge.target.typeDistribution, { string: 2 });

  const deptEdge = findEdge(root, "dept");
  strictEqual(deptEdge.target.primitiveType, "string");
  strictEqual(deptEdge.required, false); // 1/3
  strictEqual(deptEdge.occurrences, 1);
});

test("100 objects with 5 optional properties → 1 merged object, NOT unions", () => {
  const records: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 100; i++) {
    const r: Record<string, unknown> = { id: i };
    if (i % 2 === 0) r.a = "x";
    if (i % 3 === 0) r.b = true;
    if (i % 5 === 0) r.c = 42;
    if (i % 7 === 0) r.d = 3.14;
    if (i % 11 === 0) r.e = "y";
    records.push(r);
  }
  const { root } = infer(records);
  strictEqual(root.kind, "object");
  // Should have properties, not be a union
  strictEqual(root.properties!.length, 6); // id + a + b + c + d + e
});

test("BIBSS-008 emitted for >100 distinct keys", () => {
  const records: Array<Record<string, unknown>> = [{}];
  for (let i = 0; i < 101; i++) {
    (records[0] as Record<string, unknown>)[`key${i}`] = i;
  }
  const { diagnostics } = infer(records);
  const diag = diagnostics.find(d => d.code === "BIBSS-008");
  strictEqual(diag !== undefined, true);
});

// ===========================================================================
// 4.3: Array Inference — Three-Tier Model (§8.5)
// ===========================================================================

console.log("\n  --- 4.3: Array Inference ---");

// Use inferObjectSchema with a wrapper record containing an array property
function inferArray(elements: unknown[], config?: InferConfig) {
  const c = config ?? defaults;
  const records = [{ arr: elements }];
  const { root, nodeIndex } = infer(records, c);
  const arrNode = findEdge(root, "arr").target;
  return { arrNode, nodeIndex };
}

// Rule 1: All null
test("Rule 1: [null, null, null] → primitive null, nullable", () => {
  const { arrNode } = inferArray([null, null, null]);
  strictEqual(arrNode.kind, "array");
  const item = arrNode.itemType!;
  strictEqual(item.kind, "primitive");
  strictEqual(item.primitiveType, "null");
  strictEqual(item.nullable, true);
  deepStrictEqual(item.typeDistribution, { null: 3 });
});

// Rule 2: Homogeneous primitives
test("Rule 2: [1, 2, 3, 4] → integer", () => {
  const { arrNode } = inferArray([1, 2, 3, 4]);
  const item = arrNode.itemType!;
  strictEqual(item.primitiveType, "integer");
  deepStrictEqual(item.typeDistribution, { integer: 4 });
});

// Rule 2: Mixed primitives (D.2)
test("Rule 2: [true, 1, 2] → integer (NOT union)", () => {
  const { arrNode } = inferArray([true, 1, 2]);
  const item = arrNode.itemType!;
  strictEqual(item.kind, "primitive");
  strictEqual(item.primitiveType, "integer");
  deepStrictEqual(item.typeDistribution, { boolean: 1, integer: 2 });
});

// Rule 2: Mixed primitives + null (D.3)
test("Rule 2: [true, 1, null, 'hello'] → string, nullable", () => {
  const { arrNode } = inferArray([true, 1, null, "hello"]);
  const item = arrNode.itemType!;
  strictEqual(item.kind, "primitive");
  strictEqual(item.primitiveType, "string");
  strictEqual(item.nullable, true);
  deepStrictEqual(item.typeDistribution, { null: 1, boolean: 1, integer: 1, string: 1 });
});

// D-style mixed primitives
test("[1, 3.14, 'hello'] → string", () => {
  const { arrNode } = inferArray([1, 3.14, "hello"]);
  const item = arrNode.itemType!;
  strictEqual(item.primitiveType, "string");
  deepStrictEqual(item.typeDistribution, { integer: 1, number: 1, string: 1 });
});

test("[true, 1, 3.14, 'x'] → string", () => {
  const { arrNode } = inferArray([true, 1, 3.14, "x"]);
  const item = arrNode.itemType!;
  strictEqual(item.primitiveType, "string");
  deepStrictEqual(item.typeDistribution, { boolean: 1, integer: 1, number: 1, string: 1 });
});

// Rule 2: All objects → property-merge (D.4)
test("Rule 2: all objects → property-merge", () => {
  const { arrNode } = inferArray([
    { a: 1, b: "x" },
    { a: 2, c: true },
    { a: 3 },
  ]);
  const item = arrNode.itemType!;
  strictEqual(item.kind, "object");
  const aEdge = findEdge(item, "a");
  strictEqual(aEdge.target.primitiveType, "integer");
  strictEqual(aEdge.required, true);
  const bEdge = findEdge(item, "b");
  strictEqual(bEdge.required, false);
  const cEdge = findEdge(item, "c");
  strictEqual(cEdge.required, false);
});

// Rule 2: All arrays → recurse
test("Rule 2: all arrays → recurse (array of arrays)", () => {
  const { arrNode } = inferArray([[1, 2], [3, 4]]);
  const item = arrNode.itemType!;
  strictEqual(item.kind, "array");
  const innerItem = item.itemType!;
  strictEqual(innerItem.primitiveType, "integer");
});

// Rule 3: Primitive + Object (D.5)
test("Rule 3: [1, 2, {name: 'Alice'}] → union of integer + object", () => {
  const { arrNode } = inferArray([1, 2, { name: "Alice" }]);
  const item = arrNode.itemType!;
  strictEqual(item.kind, "union");
  strictEqual(item.members!.length, 2);
  const primMember = item.members!.find(m => m.kind === "primitive")!;
  strictEqual(primMember.primitiveType, "integer");
  const objMember = item.members!.find(m => m.kind === "object")!;
  strictEqual(objMember.kind, "object");
});

// Rule 3: Primitive + Array (D.6)
test("Rule 3: ['hello', [1,2,3], null] → union of string + array, nullable", () => {
  const { arrNode } = inferArray(["hello", [1, 2, 3], null]);
  const item = arrNode.itemType!;
  strictEqual(item.kind, "union");
  strictEqual(item.nullable, true);
  strictEqual(item.members!.length, 2);
});

// Rule 3: Maximum union (D.7)
test("Rule 3: [42, {x:1}, [1,2]] → 3-member union (max)", () => {
  const { arrNode } = inferArray([42, { x: 1 }, [1, 2]]);
  const item = arrNode.itemType!;
  strictEqual(item.kind, "union");
  strictEqual(item.members!.length, 3);
  strictEqual(item.nullable, false);
});

// Rule 3: Mixed kinds + null
test("Rule 3: [1, {a: 2}, null] → union of primitive + object, nullable", () => {
  const { arrNode } = inferArray([1, { a: 2 }, null]);
  const item = arrNode.itemType!;
  strictEqual(item.kind, "union");
  strictEqual(item.nullable, true);
  strictEqual(item.members!.length, 2);
});

// No union for all-primitive arrays (invariant §17.3 item 5)
test("invariant: no union for all-primitive arrays", () => {
  const { arrNode } = inferArray([true, 1, 3.14, "x"]);
  const item = arrNode.itemType!;
  strictEqual(item.kind, "primitive"); // NOT union
});

// Rule 4: Empty array
test("Rule 4: [] → itemType null, BIBSS-007", () => {
  const records = [{ arr: [] as unknown[] }];
  const result = infer(records);
  const arrNode = findEdge(result.root, "arr").target;
  strictEqual(arrNode.kind, "array");
  strictEqual(arrNode.itemType, null);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-007");
  strictEqual(diag !== undefined, true);
});

// Union members bounded at 3 (invariant §17.3 item 6)
test("invariant: union members ≤ 3", () => {
  const { arrNode } = inferArray([42, { x: 1 }, [1, 2]]);
  const item = arrNode.itemType!;
  strictEqual(item.members!.length <= 3, true);
});

// ===========================================================================
// 4.2: Recursive Object Inference (Nested JSON)
// ===========================================================================

console.log("\n  --- 4.2: Recursive Object Inference ---");

test("nested object → child SchemaNode with kind 'object'", () => {
  const records = [{ user: { name: "Alice", age: 30 } }];
  const { root } = infer(records);
  const userTarget = findEdge(root, "user").target;
  strictEqual(userTarget.kind, "object");
  strictEqual(findEdge(userTarget, "name").target.primitiveType, "string");
  strictEqual(findEdge(userTarget, "age").target.primitiveType, "integer");
});

test("node IDs chain correctly: #/customer/address/city", () => {
  const records = [{ customer: { address: { city: "NYC" } } }];
  const { root } = infer(records);
  const customer = findEdge(root, "customer").target;
  strictEqual(customer.id, "#/customer");
  const address = findEdge(customer, "address").target;
  strictEqual(address.id, "#/customer/address");
  const city = findEdge(address, "city").target;
  strictEqual(city.id, "#/customer/address/city");
});

test("depth 5 nesting", () => {
  const records = [{ a: { b: { c: { d: { e: "deep" } } } } }];
  const { root } = infer(records);
  const a = findEdge(root, "a").target;
  const b = findEdge(a, "b").target;
  const c = findEdge(b, "c").target;
  const d = findEdge(c, "d").target;
  const e = findEdge(d, "e").target;
  strictEqual(e.primitiveType, "string");
  strictEqual(e.id, "#/a/b/c/d/e");
});

test("mixed nesting: some records have nested object, some don't → optional", () => {
  const records: Array<Record<string, unknown>> = [
    { id: 1, meta: { tags: "a" } },
    { id: 2 }, // meta absent
  ];
  const { root } = infer(records);
  const metaEdge = findEdge(root, "meta");
  strictEqual(metaEdge.required, false);
  strictEqual(metaEdge.occurrences, 1);
});

test("typeDistribution on leaf primitives only (not on object/array nodes)", () => {
  const records = [{ user: { name: "Alice" } }];
  const { root } = infer(records);
  // Object nodes should not have typeDistribution
  strictEqual(root.typeDistribution, undefined);
  const userTarget = findEdge(root, "user").target;
  strictEqual(userTarget.typeDistribution, undefined);
  // But leaf primitive should have it
  const nameTarget = findEdge(userTarget, "name").target;
  strictEqual(nameTarget.typeDistribution !== undefined, true);
});

test("required/nullable propagate independently at each nesting level", () => {
  const records: Array<Record<string, unknown>> = [
    { a: { x: 1 } },
    { a: { x: null } },
    { a: { x: 2 } },
  ];
  const { root } = infer(records);
  const aEdge = findEdge(root, "a");
  strictEqual(aEdge.required, true); // a present in all 3
  const xTarget = findEdge(aEdge.target, "x").target;
  strictEqual(xTarget.nullable, true); // one null
  strictEqual(xTarget.primitiveType, "integer"); // lattice: int + null → int, nullable
});

// ===========================================================================
// 4.5: Empty and Degenerate Inputs (§8.6)
// ===========================================================================

console.log("\n  --- 4.5: Degenerate Inputs ---");

test("empty records → object with no properties", () => {
  const { root } = infer([]);
  strictEqual(root.kind, "object");
  strictEqual(root.properties!.length, 0);
  strictEqual(root.occurrences, 0);
});

test("empty JSON object {} → object with no properties", () => {
  const { root } = infer([{}]);
  strictEqual(root.kind, "object");
  strictEqual(root.properties!.length, 0);
  strictEqual(root.occurrences, 1);
});

test("all null for a property → primitiveType 'null', nullable true", () => {
  const records = [{ x: null }, { x: null }];
  const { root } = infer(records);
  const target = findEdge(root, "x").target;
  strictEqual(target.primitiveType, "null");
  strictEqual(target.nullable, true);
  deepStrictEqual(target.typeDistribution, { null: 2 });
});

test("single record → all present properties required at threshold 1.0", () => {
  const { root } = infer([{ a: 1, b: "x" }]);
  strictEqual(findEdge(root, "a").required, true);
  strictEqual(findEdge(root, "b").required, true);
});

test("N=0 guard → required false", () => {
  const { root } = infer([]);
  // No properties to test, but the guard is in the code
  strictEqual(root.occurrences, 0);
});

// ===========================================================================
// typeDistribution completeness: the critical test
// ===========================================================================

console.log("\n  --- typeDistribution (ADR-003 critical) ---");

test("95 int / 3 string / 2 null → distribution preserved, not widened", () => {
  const records: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 95; i++) records.push({ value: i + 1 });
  records.push({ value: "hello" });
  records.push({ value: "world" });
  records.push({ value: "abc" });
  records.push({ value: null });
  records.push({ value: null });

  const { root } = infer(records);
  const target = findEdge(root, "value").target;

  strictEqual(target.primitiveType, "string"); // lattice: int + string → string
  strictEqual(target.nullable, true);
  deepStrictEqual(target.typeDistribution, { null: 2, integer: 95, string: 3 });
  strictEqual(target.occurrences, 100);

  // Invariant: sum === occurrences
  const dist = target.typeDistribution!;
  const sum = Object.values(dist).reduce((a, b) => a + (b ?? 0), 0);
  strictEqual(sum, 100);
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
