/**
 * JSON Normalization Pipeline Tests
 *
 * Covers BIBSS Spec:
 * - §7.2: JSON normalization (Task 3.1)
 * - §7.3: Integer classification / classifyPrimitive (Task 3.2)
 * - §12.1: BIBSS-009 large integer pre-scan (Task 3.3)
 */

import { strictEqual, deepStrictEqual } from "node:assert";
import { normalizeJSON, classifyPrimitive, scanLargeIntegers } from "../src/kernel/normalize-json.js";
import { createDefaultConfig } from "../src/kernel/types.js";
import type { InferConfig } from "../src/kernel/types.js";

console.log("JSON normalization pipeline tests\n");

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

// ===========================================================================
// §7.3 classifyPrimitive (Task 3.2)
// ===========================================================================

console.log("  --- classifyPrimitive (§7.3) ---");

test("classifyPrimitive: 42 → integer", () => {
  strictEqual(classifyPrimitive(42), "integer");
});

test("classifyPrimitive: 0 → integer", () => {
  strictEqual(classifyPrimitive(0), "integer");
});

test("classifyPrimitive: -7 → integer", () => {
  strictEqual(classifyPrimitive(-7), "integer");
});

test("classifyPrimitive: 3.14 → number", () => {
  strictEqual(classifyPrimitive(3.14), "number");
});

test("classifyPrimitive: -0.5 → number", () => {
  strictEqual(classifyPrimitive(-0.5), "number");
});

test("classifyPrimitive: NaN → number (not finite, but typeof is number)", () => {
  strictEqual(classifyPrimitive(NaN), "number");
});

test("classifyPrimitive: Infinity → number", () => {
  strictEqual(classifyPrimitive(Infinity), "number");
});

test("classifyPrimitive: true → boolean", () => {
  strictEqual(classifyPrimitive(true), "boolean");
});

test("classifyPrimitive: false → boolean", () => {
  strictEqual(classifyPrimitive(false), "boolean");
});

test("classifyPrimitive: \"hello\" → string", () => {
  strictEqual(classifyPrimitive("hello"), "string");
});

test("classifyPrimitive: \"\" → string", () => {
  strictEqual(classifyPrimitive(""), "string");
});

test("classifyPrimitive: null → null", () => {
  strictEqual(classifyPrimitive(null), "null");
});

// ===========================================================================
// §12.1 BIBSS-009 Large Integer Pre-Scan (Task 3.3)
// ===========================================================================

console.log("\n  --- BIBSS-009 Pre-Scan (§12.1) ---");

test("scanLargeIntegers: 16-digit number triggers", () => {
  strictEqual(scanLargeIntegers('{"v": 1234567890123456}'), true);
});

test("scanLargeIntegers: 17-digit number (exceeds MAX_SAFE_INTEGER) triggers", () => {
  strictEqual(scanLargeIntegers('{"v": 9007199254740993}'), true);
});

test("scanLargeIntegers: 15-digit number does NOT trigger", () => {
  strictEqual(scanLargeIntegers('{"v": 123456789012345}'), false);
});

test("scanLargeIntegers: no numbers does not trigger", () => {
  strictEqual(scanLargeIntegers('{"name": "Alice"}'), false);
});

test("normalizeJSON: BIBSS-009 emitted for large integer in JSON", () => {
  const input = '{"id": 9007199254740993}';
  const result = normalizeJSON(input, defaults);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-009");
  strictEqual(diag !== undefined, true);
  strictEqual(diag!.level, "warning");
});

test("normalizeJSON: BIBSS-009 not emitted for safe integers", () => {
  const input = '{"id": 42}';
  const result = normalizeJSON(input, defaults);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-009");
  strictEqual(diag, undefined);
});

// ===========================================================================
// §7.2 JSON Normalization (Task 3.1)
// ===========================================================================

console.log("\n  --- JSON Normalization (§7.2) ---");

// --- Single object wrapping ---

test("single object → wrapped in array", () => {
  const input = '{"name": "Alice", "age": 30}';
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 1);
  strictEqual(result.records![0]["name"], "Alice");
  strictEqual(result.records![0]["age"], 30);
});

// --- Array of objects → used directly ---

test("array of objects → used directly", () => {
  const input = '[{"name": "Alice"}, {"name": "Bob"}]';
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 2);
  strictEqual(result.records![0]["name"], "Alice");
  strictEqual(result.records![1]["name"], "Bob");
});

// --- Array of primitives → each wrapped ---

test("array of primitives → each wrapped as { _value }", () => {
  const input = '[1, "hello", true, null]';
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 4);
  strictEqual(result.records![0]["_value"], 1);
  strictEqual(result.records![1]["_value"], "hello");
  strictEqual(result.records![2]["_value"], true);
  strictEqual(result.records![3]["_value"], null);
});

// --- Mixed array (objects + primitives) ---

test("mixed array: objects kept, primitives wrapped", () => {
  const input = '[{"a": 1}, 42, "text"]';
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 3);
  strictEqual(result.records![0]["a"], 1);
  strictEqual(result.records![1]["_value"], 42);
  strictEqual(result.records![2]["_value"], "text");
});

// --- Nested objects and arrays preserved ---

test("nested objects preserved (not flattened)", () => {
  const input = '{"user": {"name": "Alice", "address": {"city": "NYC"}}}';
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 1);
  const user = result.records![0]["user"] as Record<string, unknown>;
  strictEqual(user["name"], "Alice");
  const address = user["address"] as Record<string, unknown>;
  strictEqual(address["city"], "NYC");
});

test("nested arrays preserved", () => {
  const input = '{"tags": ["a", "b"], "matrix": [[1, 2], [3, 4]]}';
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 1);
  deepStrictEqual(result.records![0]["tags"], ["a", "b"]);
  deepStrictEqual(result.records![0]["matrix"], [[1, 2], [3, 4]]);
});

test("deeply nested JSON preserved (depth 5)", () => {
  const input = '{"a": {"b": {"c": {"d": {"e": "deep"}}}}}';
  const result = normalizeJSON(input, defaults);
  const a = result.records![0]["a"] as Record<string, unknown>;
  const b = a["b"] as Record<string, unknown>;
  const c = b["c"] as Record<string, unknown>;
  const d = c["d"] as Record<string, unknown>;
  strictEqual(d["e"], "deep");
});

// --- Array of arrays → each wrapped as { _value } ---

test("array of arrays → each wrapped as { _value }", () => {
  const input = '[[1, 2], [3, 4]]';
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 2);
  deepStrictEqual(result.records![0]["_value"], [1, 2]);
  deepStrictEqual(result.records![1]["_value"], [3, 4]);
});

// --- Bare primitive ---

test("bare string → wrapped as { _value }", () => {
  const input = '"hello"';
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 1);
  strictEqual(result.records![0]["_value"], "hello");
});

test("bare number → wrapped as { _value }", () => {
  const input = "42";
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 1);
  strictEqual(result.records![0]["_value"], 42);
});

test("bare null → wrapped as { _value: null }", () => {
  const input = "null";
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 1);
  strictEqual(result.records![0]["_value"], null);
});

test("bare boolean → wrapped as { _value }", () => {
  const input = "true";
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 1);
  strictEqual(result.records![0]["_value"], true);
});

// --- Error handling ---

test("JSON.parse failure → BIBSS-004, records null", () => {
  const input = "{invalid json";
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records, null);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-004");
  strictEqual(diag !== undefined, true);
  strictEqual(diag!.level, "error");
});

test("BIBSS-001 emitted when input exceeds maxSizeWarning", () => {
  const smallConfig: InferConfig = { ...defaults, maxSizeWarning: 5 };
  const input = '{"name": "Alice"}';
  const result = normalizeJSON(input, smallConfig);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-001");
  strictEqual(diag !== undefined, true);
  strictEqual(diag!.level, "warning");
});

test("BIBSS-001 not emitted for small input", () => {
  const input = '{"a": 1}';
  const result = normalizeJSON(input, defaults);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-001");
  strictEqual(diag, undefined);
});

// --- Empty array ---

test("empty JSON array → 0 records", () => {
  const input = "[]";
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 0);
});

// --- Empty object ---

test("empty JSON object → 1 record with no keys", () => {
  const input = "{}";
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 1);
  deepStrictEqual(Object.keys(result.records![0]), []);
});

// --- Determinism ---

test("determinism: identical input → identical output", () => {
  const input = '[{"a": 1, "b": "hello"}, {"a": 2, "b": "world"}]';
  const r1 = normalizeJSON(input, defaults);
  const r2 = normalizeJSON(input, defaults);
  deepStrictEqual(r1.records, r2.records);
  deepStrictEqual(r1.diagnostics, r2.diagnostics);
});

// --- Heterogeneous array ---

test("array of heterogeneous values", () => {
  const input = '[1, "two", true, null, {"a": 3}, [4, 5]]';
  const result = normalizeJSON(input, defaults);
  strictEqual(result.records!.length, 6);
  strictEqual(result.records![0]["_value"], 1);
  strictEqual(result.records![1]["_value"], "two");
  strictEqual(result.records![2]["_value"], true);
  strictEqual(result.records![3]["_value"], null);
  strictEqual(result.records![4]["a"], 3);
  deepStrictEqual(result.records![5]["_value"], [4, 5]);
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
