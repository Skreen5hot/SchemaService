/**
 * Integration Tests — Phase 6
 *
 * Covers:
 * - §17.2 Required Test Cases (gap cases not covered by unit tests)
 * - §17.3 Property-Based Invariants (run against a diverse corpus)
 * - §17.1 Determinism Verification (100 repeated invocations)
 * - 6.5 BIBSS Spec Tests (no-network, snapshot via public API)
 */

import { deepStrictEqual, strictEqual, ok } from "node:assert";
import { createBIBSS } from "../src/kernel/index.js";
import type { SchemaNode } from "../src/kernel/types.js";

console.log("integration tests (Phase 6)\n");

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

const bibss = createBIBSS();

// ---------------------------------------------------------------------------
// Helper: walk all SchemaNodes in a tree
// ---------------------------------------------------------------------------

function walkNodes(node: SchemaNode, fn: (n: SchemaNode) => void): void {
  fn(node);
  if (node.properties) {
    for (const edge of node.properties) {
      walkNodes(edge.target, fn);
    }
  }
  if (node.itemType) walkNodes(node.itemType, fn);
  if (node.members) {
    for (const member of node.members) {
      walkNodes(member, fn);
    }
  }
}

// ---------------------------------------------------------------------------
// §17.2 Gap Cases — Arrays (homogeneous primitives)
// ---------------------------------------------------------------------------

console.log("  --- §17.2 Gap: Homogeneous Arrays ---");

test("all-string array: ['a','b','c'] → string", () => {
  const r = bibss.infer(JSON.stringify([{ arr: ["a", "b", "c"] }]));
  const obj = r.cism!.root.itemType!;
  const arrEdge = obj.properties!.find(e => e.name === "arr")!;
  strictEqual(arrEdge.target.kind, "array");
  const item = arrEdge.target.itemType!;
  strictEqual(item.kind, "primitive");
  strictEqual(item.primitiveType, "string");
  deepStrictEqual(item.typeDistribution, { string: 3 });
});

test("all-boolean array: [true,false,true] → boolean", () => {
  const r = bibss.infer(JSON.stringify([{ arr: [true, false, true] }]));
  const arrEdge = r.cism!.root.itemType!.properties!.find(e => e.name === "arr")!;
  const item = arrEdge.target.itemType!;
  strictEqual(item.primitiveType, "boolean");
  deepStrictEqual(item.typeDistribution, { boolean: 3 });
});

test("all-integer array: [1,2,3] → integer", () => {
  const r = bibss.infer(JSON.stringify([{ arr: [1, 2, 3] }]));
  const arrEdge = r.cism!.root.itemType!.properties!.find(e => e.name === "arr")!;
  const item = arrEdge.target.itemType!;
  strictEqual(item.primitiveType, "integer");
  deepStrictEqual(item.typeDistribution, { integer: 3 });
});

// ---------------------------------------------------------------------------
// §17.2 Gap: Arrays (mixed primitives — additional cases)
// ---------------------------------------------------------------------------

console.log("  --- §17.2 Gap: Mixed Primitive Arrays ---");

test("[1, 'hello'] → string (not union)", () => {
  const r = bibss.infer(JSON.stringify([{ v: [1, "hello"] }]));
  const item = r.cism!.root.itemType!.properties!.find(e => e.name === "v")!.target.itemType!;
  strictEqual(item.kind, "primitive");
  strictEqual(item.primitiveType, "string");
  deepStrictEqual(item.typeDistribution, { integer: 1, string: 1 });
});

test("[true, 3.14] → number (not union)", () => {
  const r = bibss.infer(JSON.stringify([{ v: [true, 3.14] }]));
  const item = r.cism!.root.itemType!.properties!.find(e => e.name === "v")!.target.itemType!;
  strictEqual(item.kind, "primitive");
  strictEqual(item.primitiveType, "number");
  deepStrictEqual(item.typeDistribution, { boolean: 1, number: 1 });
});

// ---------------------------------------------------------------------------
// §17.2 Gap: typeDistribution — JSON (50 int / 50 number)
// ---------------------------------------------------------------------------

console.log("  --- §17.2 Gap: typeDistribution JSON ---");

test("JSON field: 50 integers + 50 numbers → typeDistribution { integer: 50, number: 50 }", () => {
  const records: Array<Record<string, unknown>> = [];
  for (let i = 0; i < 50; i++) records.push({ val: i + 1 });        // integers
  for (let i = 0; i < 50; i++) records.push({ val: (i + 1) + 0.5 }); // numbers
  const r = bibss.infer(JSON.stringify(records));
  const valEdge = r.cism!.root.itemType!.properties!.find(e => e.name === "val")!;
  strictEqual(valEdge.target.primitiveType, "number"); // integer + number → number
  deepStrictEqual(valEdge.target.typeDistribution, { integer: 50, number: 50 });
  strictEqual(valEdge.target.occurrences, 100);
});

// ---------------------------------------------------------------------------
// §17.2 Gap: typeDistribution — Arrays
// ---------------------------------------------------------------------------

test("array [1, 2, 'x'] → itemType typeDistribution { integer: 2, string: 1 }", () => {
  const r = bibss.infer(JSON.stringify([{ arr: [1, 2, "x"] }]));
  const item = r.cism!.root.itemType!.properties!.find(e => e.name === "arr")!.target.itemType!;
  strictEqual(item.kind, "primitive");
  strictEqual(item.primitiveType, "string");
  deepStrictEqual(item.typeDistribution, { integer: 2, string: 1 });
  strictEqual(item.occurrences, 3);
});

// ---------------------------------------------------------------------------
// §17.2 Gap: CSV mixed line endings
// ---------------------------------------------------------------------------

test("CSV with Windows-style \\r\\n line endings parses correctly", () => {
  const csv = "name,age\r\nAlice,30\r\nBob,25\r\n";
  const r = bibss.infer(csv);
  ok(r.cism !== null);
  const props = r.cism!.root.itemType!.properties!;
  strictEqual(props.length, 2);
  strictEqual(props[0].target.occurrences, 2);
});

test("CSV with Unix-style \\n line endings parses correctly", () => {
  const csv = "name,age\nAlice,30\nBob,25\n";
  const r = bibss.infer(csv);
  ok(r.cism !== null);
  const props = r.cism!.root.itemType!.properties!;
  strictEqual(props.length, 2);
  strictEqual(props[0].target.occurrences, 2);
});

// ---------------------------------------------------------------------------
// §17.2: Empty inputs via public API
// ---------------------------------------------------------------------------

console.log("  --- §17.2: Empty Inputs (Public API) ---");

test("empty CSV (header only) → null cism with BIBSS-007", () => {
  const r = bibss.infer("name,age\n");
  strictEqual(r.cism, null);
  ok(r.diagnostics.some(d => d.code === "BIBSS-007"));
});

test("empty JSON array [] → null cism with BIBSS-007", () => {
  const r = bibss.infer("[]");
  strictEqual(r.cism, null);
  ok(r.diagnostics.some(d => d.code === "BIBSS-007"));
});

test("empty JSON object {} → valid cism with object root", () => {
  const r = bibss.infer("{}");
  ok(r.cism !== null);
  strictEqual(r.cism!.root.kind, "object");
  strictEqual(r.cism!.root.properties!.length, 0);
});

test("zero-byte input → null cism with BIBSS-007", () => {
  const r = bibss.infer("");
  strictEqual(r.cism, null);
  ok(r.diagnostics.some(d => d.code === "BIBSS-007"));
});

// ---------------------------------------------------------------------------
// §17.3 Property-Based Invariants
// ---------------------------------------------------------------------------

console.log("  --- §17.3 Property-Based Invariants ---");

// Diverse corpus of inputs for invariant testing
const CORPUS: Array<{ name: string; input: string }> = [
  { name: "simple CSV", input: "name,age\nAlice,30\nBob,25\n" },
  { name: "JSON array of objects", input: '[{"a":1,"b":"x"},{"a":2,"b":"y"}]' },
  { name: "JSON single object", input: '{"name":"Alice","age":30}' },
  { name: "mixed types CSV", input: "id,val\n1,hello\n2,42\n3,\n" },
  { name: "nested JSON", input: '[{"user":{"name":"Alice","address":{"city":"NYC"}}}]' },
  { name: "array values JSON", input: '[{"tags":["a","b"],"count":1},{"tags":["c"],"count":2}]' },
  { name: "union JSON", input: JSON.stringify([{ data: [1, { x: 2 }, "hello"] }]) },
  { name: "all-null column CSV", input: "id,val\n1,\n2,\n3,\n" },
  { name: "boolean CSV", input: "flag\ntrue\nfalse\nTrue\nFALSE\n" },
  { name: "deep nesting JSON", input: JSON.stringify([{ a: { b: { c: { d: { e: 1 } } } } }]) },
  { name: "large array JSON", input: JSON.stringify([{ arr: [1, 2, 3, "x", null, true] }]) },
  { name: "optional properties", input: JSON.stringify([{ a: 1 }, { a: 2, b: "x" }, { a: 3, c: true }]) },
];

test("invariant 1: infer() terminates for all corpus inputs", () => {
  for (const { name, input } of CORPUS) {
    const result = bibss.infer(input);
    ok(result !== undefined, `infer() did not return for: ${name}`);
  }
});

test("invariant 2: non-null CISM → valid JSON Schema projection", () => {
  for (const { name, input } of CORPUS) {
    const result = bibss.infer(input);
    if (result.cism !== null) {
      const schema = bibss.project<Record<string, unknown>>(result.cism, "jsonschema");
      ok(schema.$schema !== undefined, `Missing $schema for: ${name}`);
      ok(schema.type !== undefined || schema.oneOf !== undefined, `Missing type/oneOf for: ${name}`);
    }
  }
});

test("invariant 4: no union where all members are kind 'object'", () => {
  for (const { name, input } of CORPUS) {
    const result = bibss.infer(input);
    if (result.cism !== null) {
      walkNodes(result.cism.root, (node) => {
        if (node.kind === "union" && node.members) {
          const allObject = node.members.every(m => m.kind === "object");
          ok(!allObject, `All-object union found in: ${name} at ${node.id}`);
        }
      });
    }
  }
});

test("invariant 5: no union where all members are kind 'primitive'", () => {
  for (const { name, input } of CORPUS) {
    const result = bibss.infer(input);
    if (result.cism !== null) {
      walkNodes(result.cism.root, (node) => {
        if (node.kind === "union" && node.members) {
          const allPrimitive = node.members.every(m => m.kind === "primitive");
          ok(!allPrimitive, `All-primitive union found in: ${name} at ${node.id}`);
        }
      });
    }
  }
});

test("invariant 6: every union has ≤ 3 members", () => {
  for (const { name, input } of CORPUS) {
    const result = bibss.infer(input);
    if (result.cism !== null) {
      walkNodes(result.cism.root, (node) => {
        if (node.kind === "union" && node.members) {
          ok(node.members.length <= 3, `Union with ${node.members.length} members in: ${name} at ${node.id}`);
        }
      });
    }
  }
});

test("invariant 7: every primitive typeDistribution sums to occurrences", () => {
  for (const { name, input } of CORPUS) {
    const result = bibss.infer(input);
    if (result.cism !== null) {
      walkNodes(result.cism.root, (node) => {
        if (node.kind === "primitive" && node.typeDistribution) {
          const sum = Object.values(node.typeDistribution).reduce((a, b) => a + (b ?? 0), 0);
          strictEqual(sum, node.occurrences,
            `typeDistribution sum ${sum} !== occurrences ${node.occurrences} in: ${name} at ${node.id}`);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// §17.1 Determinism Verification
// ---------------------------------------------------------------------------

console.log("  --- §17.1 Determinism Verification ---");

test("100 repeated invocations produce byte-identical CISM (minus generatedAt)", () => {
  const input = "name,age,active\nAlice,30,true\nBob,25,false\nCarol,35,true\n";
  const baseline = bibss.infer(input);
  ok(baseline.cism !== null);
  const baseRaw = bibss.project<Record<string, unknown>>(baseline.cism!, "cism");
  delete baseRaw.generatedAt;
  const baseJson = JSON.stringify(baseRaw);

  for (let i = 0; i < 99; i++) {
    const result = bibss.infer(input);
    const raw = bibss.project<Record<string, unknown>>(result.cism!, "cism");
    delete raw.generatedAt;
    strictEqual(JSON.stringify(raw), baseJson, `Mismatch at invocation ${i + 2}`);
  }
});

test("determinism across diverse inputs (each tested twice)", () => {
  for (const { name, input } of CORPUS) {
    const r1 = bibss.infer(input);
    const r2 = bibss.infer(input);

    if (r1.cism === null) {
      strictEqual(r2.cism, null, `Second call non-null for: ${name}`);
      continue;
    }

    const raw1 = bibss.project<Record<string, unknown>>(r1.cism!, "cism");
    const raw2 = bibss.project<Record<string, unknown>>(r2.cism!, "cism");
    delete raw1.generatedAt;
    delete raw2.generatedAt;
    strictEqual(JSON.stringify(raw1), JSON.stringify(raw2), `Determinism failure for: ${name}`);
  }
});

test("typeDistribution keys serialize in lattice order", () => {
  // Input that produces all 5 primitive types in typeDistribution
  const records: Array<Record<string, unknown>> = [];
  records.push({ v: null });      // null
  records.push({ v: true });      // boolean
  records.push({ v: 42 });        // integer
  records.push({ v: 3.14 });      // number
  records.push({ v: "hello" });   // string
  const r = bibss.infer(JSON.stringify(records));
  const raw = bibss.project<Record<string, unknown>>(r.cism!, "cism");
  const json = JSON.stringify(raw);
  // Find typeDistribution in the serialized output
  const distMatch = json.match(/"typeDistribution":\{([^}]+)\}/);
  ok(distMatch !== null, "typeDistribution not found in serialized CISM");
  const keys = distMatch![1].match(/"(\w+)":/g)!.map(k => k.replace(/"/g, "").replace(":", ""));
  deepStrictEqual(keys, ["null", "boolean", "integer", "number", "string"]);
});

test("CISM property keys in declaration order (§9.3)", () => {
  const r = bibss.infer('[{"name":"Alice"}]');
  const raw = bibss.project<Record<string, unknown>>(r.cism!, "cism");
  // Check root node key order: should start with version, generatedAt, config, root
  const topKeys = Object.keys(raw);
  strictEqual(topKeys[0], "version");
  strictEqual(topKeys[1], "generatedAt");
  strictEqual(topKeys[2], "config");
  strictEqual(topKeys[3], "root");

  // Check SchemaNode key order: id, kind, ...
  const rootNode = raw.root as Record<string, unknown>;
  const nodeKeys = Object.keys(rootNode);
  strictEqual(nodeKeys[0], "id");
  strictEqual(nodeKeys[1], "kind");
});

// ---------------------------------------------------------------------------
// 6.5 BIBSS No-Network Test
// ---------------------------------------------------------------------------

console.log("  --- 6.5 BIBSS No-Network ---");

test("infer() makes zero fetch/XHR calls", () => {
  let fetchCalled = false;
  let xhrCalled = false;
  const origFetch = globalThis.fetch;
  const origXHR = (globalThis as Record<string, unknown>)["XMLHttpRequest"];

  globalThis.fetch = (() => { fetchCalled = true; throw new Error("fetch called"); }) as typeof globalThis.fetch;
  (globalThis as Record<string, unknown>)["XMLHttpRequest"] = class { constructor() { xhrCalled = true; throw new Error("XHR called"); } };

  try {
    bibss.infer("name,age\nAlice,30\n");
    bibss.infer('[{"a":1}]');
    ok(!fetchCalled, "fetch was called during infer()");
    ok(!xhrCalled, "XMLHttpRequest was instantiated during infer()");
  } finally {
    globalThis.fetch = origFetch;
    (globalThis as Record<string, unknown>)["XMLHttpRequest"] = origXHR;
  }
});

// ---------------------------------------------------------------------------
// 6.5 BIBSS Determinism via infer()
// ---------------------------------------------------------------------------

console.log("  --- 6.5 BIBSS Determinism ---");

test("infer() determinism: CISM byte-identical across 2 invocations (excluding generatedAt)", () => {
  const inputs = [
    "name,age\nAlice,30\nBob,25\n",
    '[{"x":1,"y":"hello"},{"x":2,"y":"world"}]',
    '{"single":"object","num":42}',
  ];

  for (const input of inputs) {
    const r1 = bibss.infer(input);
    const r2 = bibss.infer(input);
    if (r1.cism === null) { strictEqual(r2.cism, null); continue; }
    const raw1 = bibss.project<Record<string, unknown>>(r1.cism!, "cism");
    const raw2 = bibss.project<Record<string, unknown>>(r2.cism!, "cism");
    delete raw1.generatedAt;
    delete raw2.generatedAt;
    strictEqual(JSON.stringify(raw1), JSON.stringify(raw2));
  }
});

// ---------------------------------------------------------------------------
// 6.5 BIBSS Snapshot via infer()
// ---------------------------------------------------------------------------

console.log("  --- 6.5 BIBSS Snapshot ---");

test("snapshot: known CSV input produces expected CISM structure", () => {
  const csv = "name,age,active\nAlice,30,true\nBob,25,false\n";
  const r = bibss.infer(csv);
  ok(r.cism !== null);

  // Root is array
  strictEqual(r.cism!.root.kind, "array");
  strictEqual(r.cism!.root.id, "#");

  // Item is object with 3 properties
  const item = r.cism!.root.itemType!;
  strictEqual(item.kind, "object");
  strictEqual(item.properties!.length, 3);

  // name: string, required
  const name = item.properties![0];
  strictEqual(name.name, "name");
  strictEqual(name.target.primitiveType, "string");
  strictEqual(name.required, true);
  deepStrictEqual(name.target.typeDistribution, { string: 2 });

  // age: integer, required
  const age = item.properties![1];
  strictEqual(age.name, "age");
  strictEqual(age.target.primitiveType, "integer");
  strictEqual(age.required, true);
  deepStrictEqual(age.target.typeDistribution, { integer: 2 });

  // active: boolean, required
  const active = item.properties![2];
  strictEqual(active.name, "active");
  strictEqual(active.target.primitiveType, "boolean");
  strictEqual(active.required, true);
  deepStrictEqual(active.target.typeDistribution, { boolean: 2 });
});

test("snapshot: known JSON input produces expected JSON Schema", () => {
  const json = JSON.stringify([
    { id: 1, name: "Alice", score: 95.5 },
    { id: 2, name: "Bob", score: 87.0 },
  ]);
  const r = bibss.infer(json);
  const schema = bibss.project<Record<string, unknown>>(r.cism!, "jsonschema");

  strictEqual(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  strictEqual(schema.type, "array");

  const items = schema.items as Record<string, unknown>;
  strictEqual(items.type, "object");
  deepStrictEqual(items.required, ["id", "name", "score"]);

  const props = items.properties as Record<string, Record<string, unknown>>;
  deepStrictEqual(props.id, { type: "integer" });
  deepStrictEqual(props.name, { type: "string" });
  deepStrictEqual(props.score, { type: "number" });
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
