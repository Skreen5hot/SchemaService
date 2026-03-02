/**
 * Diagnostic Codes Unit Tests
 *
 * Verifies that each BIBSS-001 through BIBSS-009 factory produces
 * correct level, code, and message. Also tests DiagnosticCollector
 * and the BIBSS-003 cap (max 10).
 */

import { strictEqual, deepStrictEqual } from "node:assert";
import {
  bibss001, bibss002, bibss003, bibss004, bibss005,
  bibss006, bibss007, bibss008, bibss009,
  DiagnosticCollector,
} from "../src/kernel/diagnostics.js";

console.log("Diagnostic codes tests\n");

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

// --- BIBSS-001: Input exceeds size warning ---
test("BIBSS-001 produces warning with correct code", () => {
  const d = bibss001(15_000_000, 10_485_760);
  strictEqual(d.level, "warning");
  strictEqual(d.code, "BIBSS-001");
  strictEqual(d.context?.inputSize, 15_000_000);
  strictEqual(d.context?.maxSize, 10_485_760);
});

// --- BIBSS-002: Sampling applied ---
test("BIBSS-002 produces info with correct code", () => {
  const d = bibss002(10_000, 2000);
  strictEqual(d.level, "info");
  strictEqual(d.code, "BIBSS-002");
  strictEqual(d.context?.inputSize, 10_000);
  strictEqual(d.context?.sampleSize, 2000);
});

// --- BIBSS-003: Mismatched column count ---
test("BIBSS-003 produces warning with row context", () => {
  const d = bibss003(5, 10, 8);
  strictEqual(d.level, "warning");
  strictEqual(d.code, "BIBSS-003");
  strictEqual(d.context?.rowIndex, 5);
  strictEqual(d.context?.expected, 10);
  strictEqual(d.context?.actual, 8);
});

// --- BIBSS-004: JSON parse failure ---
test("BIBSS-004 produces error", () => {
  const d = bibss004("Unexpected token");
  strictEqual(d.level, "error");
  strictEqual(d.code, "BIBSS-004");
});

// --- BIBSS-005: CSV parse failure ---
test("BIBSS-005 produces error", () => {
  const d = bibss005("Invalid CSV");
  strictEqual(d.level, "error");
  strictEqual(d.code, "BIBSS-005");
});

// --- BIBSS-006: Property name collision ---
test("BIBSS-006 produces warning with property name", () => {
  const d = bibss006("name");
  strictEqual(d.level, "warning");
  strictEqual(d.code, "BIBSS-006");
  strictEqual(d.context?.propertyName, "name");
});

// --- BIBSS-007: Empty input ---
test("BIBSS-007 produces info", () => {
  const d = bibss007();
  strictEqual(d.level, "info");
  strictEqual(d.code, "BIBSS-007");
});

// --- BIBSS-008: >100 distinct keys ---
test("BIBSS-008 produces warning with key count", () => {
  const d = bibss008(150);
  strictEqual(d.level, "warning");
  strictEqual(d.code, "BIBSS-008");
  strictEqual(d.context?.keyCount, 150);
});

// --- BIBSS-009: Large integer ---
test("BIBSS-009 produces warning", () => {
  const d = bibss009();
  strictEqual(d.level, "warning");
  strictEqual(d.code, "BIBSS-009");
});

// --- DiagnosticCollector ---
test("DiagnosticCollector accumulates diagnostics", () => {
  const c = new DiagnosticCollector();
  c.add(bibss001(15_000_000, 10_485_760));
  c.add(bibss007());
  strictEqual(c.getAll().length, 2);
  strictEqual(c.hasErrors(), false);
});

test("DiagnosticCollector.hasErrors detects error-level diagnostics", () => {
  const c = new DiagnosticCollector();
  c.add(bibss004("bad json"));
  strictEqual(c.hasErrors(), true);
});

test("DiagnosticCollector caps BIBSS-003 at 10", () => {
  const c = new DiagnosticCollector();
  for (let i = 0; i < 15; i++) {
    c.add(bibss003(i, 10, 8));
  }
  const all = c.getAll();
  const count003 = all.filter(d => d.code === "BIBSS-003").length;
  strictEqual(count003, 10);
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
