/**
 * Raw CISM Adapter Tests (Phase 5.2)
 *
 * Tests serialization per Spec §9.3 and §11.2:
 * - nodeIndex omitted
 * - inputHash omitted
 * - typeDistribution keys in lattice order
 * - Zero-count keys omitted
 * - Deterministic output
 */

import { deepStrictEqual, strictEqual, ok } from "node:assert";
import type { CISMRoot, SchemaNode, InferConfig } from "../src/kernel/types.js";
import { createDefaultConfig } from "../src/kernel/types.js";
import { toRawCISM } from "../src/kernel/cism-adapter.js";

console.log("cism-adapter tests\n");

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

// --- Helper: build a minimal CISMRoot ---

function buildCISM(root: SchemaNode, overrides?: Partial<CISMRoot>): CISMRoot {
  return {
    version: "1.3",
    generatedAt: "2026-03-01T00:00:00.000Z",
    config: createDefaultConfig(),
    root,
    nodeIndex: new Map([[root.id, root]]),
    ...overrides,
  };
}

// --- Tests ---

test("nodeIndex is omitted from output", () => {
  const root: SchemaNode = { id: "#", kind: "object", occurrences: 1, properties: [] };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  strictEqual("nodeIndex" in out, false);
});

test("inputHash is omitted from output", () => {
  const root: SchemaNode = { id: "#", kind: "object", occurrences: 1, properties: [] };
  const cism = buildCISM(root, { inputHash: "abc123" });
  const out = toRawCISM(cism);
  strictEqual("inputHash" in out, false);
});

test("version, generatedAt, config, root are present", () => {
  const root: SchemaNode = { id: "#", kind: "object", occurrences: 1, properties: [] };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  strictEqual(out.version, "1.3");
  strictEqual(out.generatedAt, "2026-03-01T00:00:00.000Z");
  ok(out.config !== undefined);
  ok(out.root !== undefined);
});

test("sampling is included when present", () => {
  const root: SchemaNode = { id: "#", kind: "object", occurrences: 1, properties: [] };
  const cism = buildCISM(root, {
    sampling: { applied: true, inputSize: 5000, sampleSize: 2000, strategy: "strided" },
  });
  const out = toRawCISM(cism);
  deepStrictEqual(out.sampling, { applied: true, inputSize: 5000, sampleSize: 2000, strategy: "strided" });
});

test("sampling is omitted when not present", () => {
  const root: SchemaNode = { id: "#", kind: "object", occurrences: 1, properties: [] };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  strictEqual("sampling" in out, false);
});

test("typeDistribution keys are in lattice order (null, boolean, integer, number, string)", () => {
  const root: SchemaNode = {
    id: "#",
    kind: "primitive",
    primitiveType: "string",
    nullable: true,
    occurrences: 15,
    typeDistribution: {
      string: 5,
      null: 1,
      boolean: 2,
      number: 4,
      integer: 3,
    },
  };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  const dist = (out.root as Record<string, unknown>).typeDistribution as Record<string, number>;

  // Verify key order by checking JSON.stringify output
  const json = JSON.stringify(dist);
  const keys = Object.keys(dist);
  deepStrictEqual(keys, ["null", "boolean", "integer", "number", "string"]);
  strictEqual(json, '{"null":1,"boolean":2,"integer":3,"number":4,"string":5}');
});

test("zero-count keys are omitted from typeDistribution", () => {
  const root: SchemaNode = {
    id: "#",
    kind: "primitive",
    primitiveType: "integer",
    occurrences: 10,
    typeDistribution: { integer: 10, null: 0, string: 0 },
  };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  const dist = (out.root as Record<string, unknown>).typeDistribution as Record<string, number>;
  deepStrictEqual(dist, { integer: 10 });
  strictEqual("null" in dist, false);
  strictEqual("string" in dist, false);
});

test("SchemaNode properties are in declaration order (id, kind, name, occurrences, ...)", () => {
  const root: SchemaNode = {
    id: "#",
    kind: "primitive",
    name: "test",
    primitiveType: "string",
    nullable: false,
    occurrences: 5,
    typeDistribution: { string: 5 },
  };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  const rootOut = out.root as Record<string, unknown>;
  const keys = Object.keys(rootOut);

  // §9.1 order: id, kind, name, occurrences, ..., primitiveType, nullable, typeDistribution
  strictEqual(keys[0], "id");
  strictEqual(keys[1], "kind");
  strictEqual(keys[2], "name");
  strictEqual(keys[3], "occurrences");
});

test("SchemaEdge properties are in declaration order (name, target, required, occurrences, totalPopulation)", () => {
  const target: SchemaNode = {
    id: "#/a", kind: "primitive", primitiveType: "string", occurrences: 1,
    typeDistribution: { string: 1 },
  };
  const root: SchemaNode = {
    id: "#", kind: "object", occurrences: 1,
    properties: [{ name: "a", target, required: true, occurrences: 1, totalPopulation: 1 }],
  };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  const edge = ((out.root as Record<string, unknown>).properties as Record<string, unknown>[])[0];
  const keys = Object.keys(edge);
  deepStrictEqual(keys, ["name", "target", "required", "occurrences", "totalPopulation"]);
});

test("nested nodes are serialized recursively", () => {
  const leaf: SchemaNode = {
    id: "#/a/b", kind: "primitive", primitiveType: "integer", occurrences: 3,
    typeDistribution: { integer: 3 },
  };
  const mid: SchemaNode = {
    id: "#/a", kind: "object", occurrences: 3,
    properties: [{ name: "b", target: leaf, required: true, occurrences: 3, totalPopulation: 3 }],
  };
  const root: SchemaNode = {
    id: "#", kind: "object", occurrences: 3,
    properties: [{ name: "a", target: mid, required: true, occurrences: 3, totalPopulation: 3 }],
  };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  const rootOut = out.root as Record<string, unknown>;
  const props = rootOut.properties as Record<string, unknown>[];
  const aTarget = props[0].target as Record<string, unknown>;
  strictEqual(aTarget.kind, "object");
  const innerProps = aTarget.properties as Record<string, unknown>[];
  const bTarget = innerProps[0].target as Record<string, unknown>;
  strictEqual(bTarget.kind, "primitive");
  strictEqual(bTarget.primitiveType, "integer");
});

test("array node with null itemType serializes itemType as null", () => {
  const root: SchemaNode = {
    id: "#", kind: "array", itemType: null, occurrences: 1,
  };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  strictEqual((out.root as Record<string, unknown>).itemType, null);
});

test("union node members are serialized", () => {
  const m0: SchemaNode = {
    id: "#/|0", kind: "primitive", primitiveType: "integer", occurrences: 2,
    typeDistribution: { integer: 2 },
  };
  const m1: SchemaNode = {
    id: "#/|1", kind: "object", occurrences: 1, properties: [],
  };
  const root: SchemaNode = {
    id: "#", kind: "union", members: [m0, m1], nullable: false, occurrences: 3,
  };
  const cism = buildCISM(root);
  const out = toRawCISM(cism);
  const rootOut = out.root as Record<string, unknown>;
  const members = rootOut.members as Record<string, unknown>[];
  strictEqual(members.length, 2);
  strictEqual(members[0].kind, "primitive");
  strictEqual(members[1].kind, "object");
});

test("deterministic: two serializations produce identical JSON", () => {
  const root: SchemaNode = {
    id: "#",
    kind: "primitive",
    primitiveType: "string",
    nullable: true,
    occurrences: 100,
    typeDistribution: { null: 2, integer: 95, string: 3 },
  };
  const cism = buildCISM(root);
  const json1 = JSON.stringify(toRawCISM(cism));
  const json2 = JSON.stringify(toRawCISM(cism));
  strictEqual(json1, json2);
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
