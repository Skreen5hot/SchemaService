/**
 * CSV Normalization Pipeline Tests
 *
 * Covers BIBSS Spec §7.1:
 * - §7.1.1: Papa Parse invocation (Task 2.1)
 * - §7.1.2: Post-parse transforms (Task 2.2)
 * - §7.1.3: Type narrowing — all 26 rows from Appendix C §25 (Task 2.3)
 * - Integration test (Task 2.4)
 */

import { strictEqual, deepStrictEqual } from "node:assert";
import { normalizeCSV, narrowValue } from "../src/kernel/normalize-csv.js";
import { createDefaultConfig } from "../src/kernel/types.js";
import type { InferConfig } from "../src/kernel/types.js";

console.log("CSV normalization pipeline tests\n");

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
// §7.1.3 Type Narrowing — All 26 rows from Appendix C (Spec §25)
// ===========================================================================

console.log("  --- Type Narrowing (Appendix C) ---");

// Row 1: "" → null (handled by post-parse, not narrowValue directly)
// narrowValue receives non-null trimmed strings, so empty→null is tested in post-parse section

// Row 2–7: Boolean (case-insensitive)
test("narrowValue: \"true\" → true", () => {
  strictEqual(narrowValue("true"), true);
});

test("narrowValue: \"True\" → true", () => {
  strictEqual(narrowValue("True"), true);
});

test("narrowValue: \"TRUE\" → true", () => {
  strictEqual(narrowValue("TRUE"), true);
});

test("narrowValue: \"false\" → false", () => {
  strictEqual(narrowValue("false"), false);
});

test("narrowValue: \"False\" → false", () => {
  strictEqual(narrowValue("False"), false);
});

test("narrowValue: \"FALSE\" → false", () => {
  strictEqual(narrowValue("FALSE"), false);
});

// Row 8–9: "yes"/"no" → string
test("narrowValue: \"yes\" → string \"yes\"", () => {
  strictEqual(narrowValue("yes"), "yes");
});

test("narrowValue: \"no\" → string \"no\"", () => {
  strictEqual(narrowValue("no"), "no");
});

// Row 10–13: Integer
test("narrowValue: \"1\" → 1", () => {
  strictEqual(narrowValue("1"), 1);
});

test("narrowValue: \"0\" → 0", () => {
  strictEqual(narrowValue("0"), 0);
});

test("narrowValue: \"42\" → 42", () => {
  strictEqual(narrowValue("42"), 42);
});

test("narrowValue: \"-7\" → -7", () => {
  strictEqual(narrowValue("-7"), -7);
});

// Row 14–15: Leading zeros → string
test("narrowValue: \"00123\" → string (leading zero)", () => {
  strictEqual(narrowValue("00123"), "00123");
});

test("narrowValue: \"007\" → string (leading zero)", () => {
  strictEqual(narrowValue("007"), "007");
});

// Row 16–17: Number (plain decimal)
test("narrowValue: \"3.14\" → 3.14", () => {
  strictEqual(narrowValue("3.14"), 3.14);
});

test("narrowValue: \"-0.5\" → -0.5", () => {
  strictEqual(narrowValue("-0.5"), -0.5);
});

// Row 18–21: Scientific notation → string
test("narrowValue: \"1e5\" → string (no scientific notation)", () => {
  strictEqual(narrowValue("1e5"), "1e5");
});

test("narrowValue: \"1E5\" → string (no scientific notation)", () => {
  strictEqual(narrowValue("1E5"), "1E5");
});

test("narrowValue: \"2.5E+3\" → string (no scientific notation)", () => {
  strictEqual(narrowValue("2.5E+3"), "2.5E+3");
});

test("narrowValue: \"-1e-2\" → string (no scientific notation)", () => {
  strictEqual(narrowValue("-1e-2"), "-1e-2");
});

// Row 22–23: NaN, Infinity → string
test("narrowValue: \"NaN\" → string", () => {
  strictEqual(narrowValue("NaN"), "NaN");
});

test("narrowValue: \"Infinity\" → string", () => {
  strictEqual(narrowValue("Infinity"), "Infinity");
});

// Row 24: MAX_SAFE_INTEGER exceeded → string
test("narrowValue: \"9007199254740993\" → string (exceeds MAX_SAFE_INTEGER)", () => {
  strictEqual(narrowValue("9007199254740993"), "9007199254740993");
});

// Row 25: Plain string
test("narrowValue: \"hello\" → string", () => {
  strictEqual(narrowValue("hello"), "hello");
});

// Row 26: " 42 " — trim happens in post-parse, narrowValue receives "42"
test("narrowValue: \"42\" (post-trim) → 42", () => {
  strictEqual(narrowValue("42"), 42);
});

// Additional narrowing edge cases
test("narrowValue: \"-Infinity\" → string", () => {
  strictEqual(narrowValue("-Infinity"), "-Infinity");
});

test("narrowValue: MAX_SAFE_INTEGER exactly → integer", () => {
  strictEqual(narrowValue("9007199254740991"), 9007199254740991);
});

test("narrowValue: negative MAX_SAFE_INTEGER → integer", () => {
  strictEqual(narrowValue("-9007199254740991"), -9007199254740991);
});

// ===========================================================================
// §7.1.1 CSV Parsing with Papa Parse (Task 2.1)
// ===========================================================================

console.log("\n  --- CSV Parsing (§7.1.1) ---");

test("simple CSV with header and 3 rows → 3 records with correct types", () => {
  const csv = "name,age,active\nAlice,30,true\nBob,25,false\nCharlie,35,true\n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records!.length, 3);
  strictEqual(result.records![0]["name"], "Alice");
  strictEqual(result.records![0]["age"], 30); // narrowed to integer
  strictEqual(result.records![0]["active"], true); // narrowed to boolean
});

test("tab-separated values parse correctly", () => {
  const tsv = "name\tage\nAlice\t30\nBob\t25\n";
  const result = normalizeCSV(tsv, defaults);
  strictEqual(result.records!.length, 2);
  strictEqual(result.records![0]["name"], "Alice");
  strictEqual(result.records![0]["age"], 30);
});

test("semicolon-separated values parse correctly", () => {
  const csv = "name;age\nAlice;30\nBob;25\n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records!.length, 2);
  strictEqual(result.records![0]["name"], "Alice");
  strictEqual(result.records![0]["age"], 30);
});

test("BOM is stripped", () => {
  const csv = "\uFEFFname,age\nAlice,30\n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records!.length, 1);
  // After BOM strip, the header should be "name" not "\uFEFFname"
  strictEqual(result.records![0]["name"], "Alice");
});

test("quoted fields with embedded commas", () => {
  const csv = 'name,address\nAlice,"123 Main St, Apt 4"\n';
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["address"], "123 Main St, Apt 4");
});

test("quoted fields with embedded newlines", () => {
  const csv = 'name,bio\nAlice,"Line 1\nLine 2"\n';
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["bio"], "Line 1\nLine 2");
});

test("quoted fields with escaped double-quotes", () => {
  const csv = 'name,quote\nAlice,"She said ""hello"""\n';
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["quote"], 'She said "hello"');
});

test("BIBSS-001 emitted when input exceeds maxSizeWarning", () => {
  const smallConfig: InferConfig = { ...defaults, maxSizeWarning: 10 };
  const csv = "name,age\nAlice,30\nBob,25\n";
  const result = normalizeCSV(csv, smallConfig);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-001");
  strictEqual(diag !== undefined, true);
  strictEqual(diag!.level, "warning");
});

test("BIBSS-001 not emitted for small input", () => {
  const csv = "name,age\nAlice,30\n";
  const result = normalizeCSV(csv, defaults);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-001");
  strictEqual(diag, undefined);
});

// ===========================================================================
// §7.1.2 Post-Parse Transforms (Task 2.2)
// ===========================================================================

console.log("\n  --- Post-Parse Transforms (§7.1.2) ---");

test("string values are trimmed", () => {
  const csv = "name\n  hello  \n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["name"], "hello");
});

test("empty string → null with emptyStringAsNull: true (default)", () => {
  const csv = "name,age\nAlice,\n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["age"], null);
});

test("empty string preserved with emptyStringAsNull: false", () => {
  const config: InferConfig = { ...defaults, emptyStringAsNull: false };
  const csv = "name,age\nAlice,\n";
  const result = normalizeCSV(csv, config);
  strictEqual(result.records![0]["age"], "");
});

test("whitespace-only string → null (trimmed to empty, then empty→null)", () => {
  const csv = "name,val\nAlice,   \n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["val"], null);
});

test("BIBSS-006 emitted for duplicate headers after trimming", () => {
  const csv = "name, name\nAlice,Bob\n";
  const result = normalizeCSV(csv, defaults);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-006");
  strictEqual(diag !== undefined, true);
  strictEqual(diag!.level, "warning");
});

test("BIBSS-003 emitted for row with mismatched column count", () => {
  const csv = "name,age,city\nAlice,30\n";
  const result = normalizeCSV(csv, defaults);
  const diag = result.diagnostics.find(d => d.code === "BIBSS-003");
  strictEqual(diag !== undefined, true);
});

test("BIBSS-003 capped at 10 diagnostics", () => {
  // 15 rows with mismatched columns — only 10 BIBSS-003 should be emitted
  let csv = "a,b,c\n";
  for (let i = 0; i < 15; i++) {
    csv += `${i}\n`; // only 1 column instead of 3
  }
  const result = normalizeCSV(csv, defaults);
  const count = result.diagnostics.filter(d => d.code === "BIBSS-003").length;
  strictEqual(count, 10);
});

test("row with fewer columns → missing keys filled with null", () => {
  const csv = "name,age,city\nAlice,30\n";
  const result = normalizeCSV(csv, defaults);
  // Papa Parse should still return a record; missing key → null via our pipeline
  const record = result.records![0];
  strictEqual(record["name"], "Alice");
  strictEqual(record["age"], 30);
  // The missing "city" key should be null
  strictEqual(record["city"], null);
});

test("\" 42 \" → 42 (trim in post-parse, then narrowed to integer)", () => {
  const csv = "value\n 42 \n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["value"], 42);
});

// ===========================================================================
// Task 2.4: Full CSV Normalization Integration Test
// ===========================================================================

console.log("\n  --- Full CSV Integration (Task 2.4) ---");

test("mixed-type CSV produces correct types per §7.1.3", () => {
  const csv = [
    "id,name,active,score,notes",
    "1,Alice,true,3.14,hello",
    "2,Bob,FALSE,2.71,",
    "3,Charlie,True,-7,world",
  ].join("\n") + "\n";

  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records!.length, 3);

  // Row 0
  strictEqual(result.records![0]["id"], 1);
  strictEqual(result.records![0]["name"], "Alice");
  strictEqual(result.records![0]["active"], true);
  strictEqual(result.records![0]["score"], 3.14);
  strictEqual(result.records![0]["notes"], "hello");

  // Row 1
  strictEqual(result.records![1]["id"], 2);
  strictEqual(result.records![1]["name"], "Bob");
  strictEqual(result.records![1]["active"], false);
  strictEqual(result.records![1]["score"], 2.71);
  strictEqual(result.records![1]["notes"], null); // empty → null

  // Row 2
  strictEqual(result.records![2]["id"], 3);
  strictEqual(result.records![2]["name"], "Charlie");
  strictEqual(result.records![2]["active"], true);
  strictEqual(result.records![2]["score"], -7);
  strictEqual(result.records![2]["notes"], "world");
});

test("no diagnostics for valid input", () => {
  const csv = "name,age\nAlice,30\nBob,25\n";
  const result = normalizeCSV(csv, defaults);
  const errors = result.diagnostics.filter(d => d.level === "error");
  strictEqual(errors.length, 0);
});

test("determinism: identical input → identical output", () => {
  const csv = "name,age,active\nAlice,30,true\nBob,25,false\n";
  const r1 = normalizeCSV(csv, defaults);
  const r2 = normalizeCSV(csv, defaults);
  deepStrictEqual(r1.records, r2.records);
  deepStrictEqual(r1.diagnostics, r2.diagnostics);
});

test("CSV with leading zeros preserved as strings", () => {
  const csv = "zip,code\n00123,007\n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["zip"], "00123");
  strictEqual(result.records![0]["code"], "007");
});

test("CSV with scientific notation preserved as strings", () => {
  const csv = "val\n1e5\n1E5\n2.5E+3\n-1e-2\n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["val"], "1e5");
  strictEqual(result.records![1]["val"], "1E5");
  strictEqual(result.records![2]["val"], "2.5E+3");
  strictEqual(result.records![3]["val"], "-1e-2");
});

test("CSV with NaN/Infinity preserved as strings", () => {
  const csv = "val\nNaN\nInfinity\n-Infinity\n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["val"], "NaN");
  strictEqual(result.records![1]["val"], "Infinity");
  strictEqual(result.records![2]["val"], "-Infinity");
});

test("CSV with MAX_SAFE_INTEGER boundary", () => {
  const csv = "val\n9007199254740991\n9007199254740993\n";
  const result = normalizeCSV(csv, defaults);
  strictEqual(result.records![0]["val"], 9007199254740991); // exactly MAX_SAFE_INTEGER → integer
  strictEqual(result.records![1]["val"], "9007199254740993"); // exceeds → string
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
