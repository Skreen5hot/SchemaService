/**
 * Public API Tests (Phase 5.4)
 *
 * Tests for createBIBSS(), infer(), project(), and adapter wiring.
 * Per Spec §12.
 */

import { deepStrictEqual, strictEqual, ok, throws } from "node:assert";
import { createBIBSS } from "../src/kernel/index.js";

console.log("public-api tests\n");

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

// --- createBIBSS ---

test("createBIBSS returns a service with infer, project, adapters", () => {
  const bibss = createBIBSS();
  strictEqual(typeof bibss.infer, "function");
  strictEqual(typeof bibss.project, "function");
  ok(bibss.adapters !== undefined);
});

test("built-in adapters cism and jsonschema are pre-registered", () => {
  const bibss = createBIBSS();
  const names = bibss.adapters.list();
  ok(names.includes("cism"));
  ok(names.includes("jsonschema"));
});

// --- infer: basic CSV ---

test("infer CSV: returns CISMRoot with correct structure", () => {
  const bibss = createBIBSS();
  const csv = "name,age\nAlice,30\nBob,25\n";
  const result = bibss.infer(csv);
  ok(result.cism !== null);
  strictEqual(result.cism!.version, "1.3");
  ok(result.cism!.generatedAt.length > 0);
  strictEqual(result.cism!.root.kind, "array");
});

test("infer CSV: root is array with object itemType", () => {
  const bibss = createBIBSS();
  const csv = "name,age\nAlice,30\nBob,25\n";
  const result = bibss.infer(csv);
  const root = result.cism!.root;
  strictEqual(root.kind, "array");
  ok(root.itemType !== null && root.itemType !== undefined);
  strictEqual(root.itemType!.kind, "object");
});

test("infer CSV: properties inferred correctly", () => {
  const bibss = createBIBSS();
  const csv = "name,age\nAlice,30\nBob,25\n";
  const result = bibss.infer(csv);
  const obj = result.cism!.root.itemType!;
  const props = obj.properties!;
  strictEqual(props.length, 2);
  strictEqual(props[0].name, "name");
  strictEqual(props[0].target.primitiveType, "string");
  strictEqual(props[1].name, "age");
  strictEqual(props[1].target.primitiveType, "integer");
});

// --- infer: basic JSON ---

test("infer JSON array: root is array", () => {
  const bibss = createBIBSS();
  const json = JSON.stringify([{ x: 1 }, { x: 2 }]);
  const result = bibss.infer(json);
  ok(result.cism !== null);
  strictEqual(result.cism!.root.kind, "array");
  strictEqual(result.cism!.root.itemType!.kind, "object");
});

test("infer JSON single object: root is object (not array)", () => {
  const bibss = createBIBSS();
  const json = JSON.stringify({ name: "Alice", age: 30 });
  const result = bibss.infer(json);
  ok(result.cism !== null);
  strictEqual(result.cism!.root.kind, "object");
});

// --- infer: config ---

test("infer: config defaults applied", () => {
  const bibss = createBIBSS();
  const csv = "val\n1\n";
  const result = bibss.infer(csv);
  strictEqual(result.cism!.config.requiredThreshold, 1.0);
  strictEqual(result.cism!.config.emptyStringAsNull, true);
  strictEqual(result.cism!.config.sampleSize, 2000);
});

test("infer: partial config overrides", () => {
  const bibss = createBIBSS();
  const csv = "val\n1\n";
  const result = bibss.infer(csv, { requiredThreshold: 0.8 });
  strictEqual(result.cism!.config.requiredThreshold, 0.8);
  strictEqual(result.cism!.config.emptyStringAsNull, true); // default preserved
});

test("infer: format override forces JSON parsing", () => {
  const bibss = createBIBSS();
  // This looks like CSV but force JSON
  const json = '{"a": 1}';
  const result = bibss.infer(json, { format: "json" });
  ok(result.cism !== null);
  strictEqual(result.cism!.root.kind, "object");
});

// --- infer: empty input ---

test("infer: empty string → null cism with BIBSS-007", () => {
  const bibss = createBIBSS();
  const result = bibss.infer("");
  strictEqual(result.cism, null);
  ok(result.diagnostics.some(d => d.code === "BIBSS-007"));
});

test("infer: whitespace-only → null cism with BIBSS-007", () => {
  const bibss = createBIBSS();
  const result = bibss.infer("   \n  \t  ");
  strictEqual(result.cism, null);
  ok(result.diagnostics.some(d => d.code === "BIBSS-007"));
});

// --- infer: parse errors ---

test("infer: invalid JSON → null cism with BIBSS-004", () => {
  const bibss = createBIBSS();
  const result = bibss.infer("{invalid json}", { format: "json" });
  strictEqual(result.cism, null);
  ok(result.diagnostics.some(d => d.code === "BIBSS-004"));
});

// --- infer: generatedAt ---

test("infer: generatedAt is an ISO 8601 timestamp", () => {
  const bibss = createBIBSS();
  const result = bibss.infer('[{"a":1}]');
  ok(result.cism !== null);
  const ts = result.cism!.generatedAt;
  // ISO 8601 format check: YYYY-MM-DDTHH:MM:SS
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(ts), `Not ISO 8601: ${ts}`);
});

// --- infer: inputHash ---

test("infer: inputHash is a SHA-256 hex string", () => {
  const bibss = createBIBSS();
  const result = bibss.infer('[{"a":1}]');
  ok(result.cism !== null);
  const hash = result.cism!.inputHash!;
  ok(/^[0-9a-f]{64}$/.test(hash), `Not SHA-256 hex: ${hash}`);
});

test("infer: inputHash is deterministic for same input", () => {
  const bibss = createBIBSS();
  const input = '[{"a":1}]';
  const h1 = bibss.infer(input).cism!.inputHash;
  const h2 = bibss.infer(input).cism!.inputHash;
  strictEqual(h1, h2);
});

// --- infer: nodeIndex ---

test("infer: nodeIndex populated with all nodes", () => {
  const bibss = createBIBSS();
  const result = bibss.infer('[{"x":1,"y":"hello"}]');
  ok(result.cism !== null);
  const idx = result.cism!.nodeIndex;
  ok(idx.size >= 3); // root array + object + at least 2 primitive nodes
  // Root should be in index
  ok(idx.has("#"));
});

// --- infer: ArrayBuffer input ---

test("infer: accepts ArrayBuffer input", () => {
  const bibss = createBIBSS();
  const input = new TextEncoder().encode('[{"a":1}]').buffer;
  const result = bibss.infer(input);
  ok(result.cism !== null);
  strictEqual(result.cism!.root.kind, "array");
});

// --- project ---

test("project: cism adapter returns serializable object", () => {
  const bibss = createBIBSS();
  const result = bibss.infer("name\nAlice\n");
  ok(result.cism !== null);
  const raw = bibss.project<Record<string, unknown>>(result.cism!, "cism");
  strictEqual(raw.version, "1.3");
  ok(raw.root !== undefined);
  // nodeIndex should NOT be in raw output
  strictEqual("nodeIndex" in raw, false);
});

test("project: jsonschema adapter returns JSON Schema", () => {
  const bibss = createBIBSS();
  const result = bibss.infer("name,age\nAlice,30\n");
  ok(result.cism !== null);
  const schema = bibss.project<Record<string, unknown>>(result.cism!, "jsonschema");
  strictEqual(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  strictEqual(schema.type, "array");
  ok(schema.items !== undefined);
});

test("project: unknown adapter throws with helpful message", () => {
  const bibss = createBIBSS();
  const result = bibss.infer("name\nAlice\n");
  throws(
    () => bibss.project(result.cism!, "nonexistent"),
    /Unknown adapter: "nonexistent"/,
  );
});

// --- adapters: custom registration ---

test("adapters: register and use custom adapter", () => {
  const bibss = createBIBSS();
  bibss.adapters.register("count-nodes", (cism) => cism.nodeIndex.size);
  const result = bibss.infer('[{"a":1}]');
  const count = bibss.project<number>(result.cism!, "count-nodes");
  ok(count >= 2);
});

// --- Determinism (excluding generatedAt) ---

test("determinism: two infer calls produce identical CISM (minus generatedAt)", () => {
  const bibss = createBIBSS();
  const input = "name,age,active\nAlice,30,true\nBob,25,false\n";
  const r1 = bibss.infer(input);
  const r2 = bibss.infer(input);
  ok(r1.cism !== null);
  ok(r2.cism !== null);

  // Compare raw CISM output (excludes nodeIndex, includes generatedAt)
  const raw1 = bibss.project<Record<string, unknown>>(r1.cism!, "cism");
  const raw2 = bibss.project<Record<string, unknown>>(r2.cism!, "cism");

  // Remove generatedAt for comparison
  delete raw1.generatedAt;
  delete raw2.generatedAt;

  strictEqual(JSON.stringify(raw1), JSON.stringify(raw2));
});

// --- End-to-end: CSV → infer → project(jsonschema) ---

test("end-to-end: CSV → infer → JSON Schema", () => {
  const bibss = createBIBSS();
  const csv = "id,name,score\n1,Alice,95.5\n2,Bob,87.0\n3,Carol,92.3\n";
  const result = bibss.infer(csv);
  ok(result.cism !== null);

  const schema = bibss.project<Record<string, unknown>>(result.cism!, "jsonschema");
  strictEqual(schema.type, "array");

  const items = schema.items as Record<string, unknown>;
  strictEqual(items.type, "object");

  const props = items.properties as Record<string, Record<string, unknown>>;
  // id: all integers → integer
  deepStrictEqual(props.id, { type: "integer" });
  // name: all strings → string
  deepStrictEqual(props.name, { type: "string" });
  // score: all have decimal points → number
  deepStrictEqual(props.score, { type: "number" });
});

// --- End-to-end: JSON → infer → project(jsonschema) ---

test("end-to-end: JSON array → infer → JSON Schema", () => {
  const bibss = createBIBSS();
  const json = JSON.stringify([
    { name: "Alice", tags: ["a", "b"] },
    { name: "Bob", tags: ["c"] },
  ]);
  const result = bibss.infer(json);
  ok(result.cism !== null);

  const schema = bibss.project<Record<string, unknown>>(result.cism!, "jsonschema");
  strictEqual(schema.type, "array");

  const items = schema.items as Record<string, unknown>;
  const props = items.properties as Record<string, Record<string, unknown>>;
  deepStrictEqual(props.name, { type: "string" });
  strictEqual(props.tags.type, "array");
  deepStrictEqual(props.tags.items, { type: "string" });
});

test("end-to-end: JSON single object → infer → JSON Schema", () => {
  const bibss = createBIBSS();
  const json = JSON.stringify({ name: "Alice", age: 30 });
  const result = bibss.infer(json);
  ok(result.cism !== null);

  const schema = bibss.project<Record<string, unknown>>(result.cism!, "jsonschema");
  strictEqual(schema.type, "object");
  const props = schema.properties as Record<string, Record<string, unknown>>;
  deepStrictEqual(props.name, { type: "string" });
  deepStrictEqual(props.age, { type: "integer" });
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
