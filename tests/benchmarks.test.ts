/**
 * Performance Benchmarks — Phase 6.4
 *
 * Targets from Spec §15.3. Times are reported; tests warn if over target.
 * "These are targets, not guarantees. Actual performance depends on the runtime."
 */

import { ok } from "node:assert";
import { createBIBSS } from "../src/kernel/index.js";

console.log("performance benchmarks (Phase 6.4)\n");

let passed = 0;
let failed = 0;

function bench(name: string, target: number, fn: () => void): void {
  try {
    // Warmup
    fn();

    // Measure
    const start = performance.now();
    fn();
    const elapsed = performance.now() - start;

    const status = elapsed <= target ? "PASS" : "WARN";
    const symbol = elapsed <= target ? "\u2713" : "\u26A0";
    console.log(`  ${symbol} ${status}: ${name} — ${elapsed.toFixed(1)}ms (target: <${target}ms)`);

    // Generous threshold: fail only if >5× target (catches major regressions)
    ok(elapsed <= target * 5, `${name}: ${elapsed.toFixed(1)}ms exceeds 5× target (${target * 5}ms)`);
    passed++;
  } catch (error) {
    console.error(`  \u2717 FAIL: ${name}`);
    console.error("   ", error instanceof Error ? error.message : String(error));
    failed++;
  }
}

const bibss = createBIBSS();

// ---------------------------------------------------------------------------
// Data Generators
// ---------------------------------------------------------------------------

function generateFlatCSV(rows: number, cols: number): string {
  const headers = Array.from({ length: cols }, (_, i) => `col${i}`);
  const lines = [headers.join(",")];
  for (let r = 0; r < rows; r++) {
    const values = headers.map((_, c) => {
      // Mix types: ~40% integer, ~30% string, ~20% boolean, ~10% number
      const mod = (r * cols + c) % 10;
      if (mod < 4) return String(r * cols + c);
      if (mod < 7) return `"str_${r}_${c}"`;
      if (mod < 9) return r % 2 === 0 ? "true" : "false";
      return `${(r * cols + c) / 7}`;
    });
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

function generateNestedJSON(rows: number, propsPerLevel: number): string {
  const records: Array<Record<string, unknown>> = [];
  for (let r = 0; r < rows; r++) {
    const record: Record<string, unknown> = {};
    // Depth 1
    for (let i = 0; i < Math.floor(propsPerLevel / 4); i++) {
      record[`d1_${i}`] = `val_${r}_${i}`;
    }
    // Depth 2
    const d2: Record<string, unknown> = {};
    for (let i = 0; i < Math.floor(propsPerLevel / 4); i++) {
      d2[`d2_${i}`] = r * 100 + i;
    }
    record.nested1 = d2;
    // Depth 3
    const d3: Record<string, unknown> = {};
    for (let i = 0; i < Math.floor(propsPerLevel / 4); i++) {
      d3[`d3_${i}`] = i % 2 === 0;
    }
    d2.nested2 = d3;
    // Depth 4
    const d4: Record<string, unknown> = {};
    for (let i = 0; i < Math.floor(propsPerLevel / 4); i++) {
      d4[`d4_${i}`] = r + i + 0.5;
    }
    d3.nested3 = d4;

    records.push(record);
  }
  return JSON.stringify(records);
}

function generateWideCSV(rows: number, cols: number): string {
  const headers = Array.from({ length: cols }, (_, i) => `c${i}`);
  const lines = [headers.join(",")];
  for (let r = 0; r < rows; r++) {
    const values = headers.map((_, c) => String(r * cols + c));
    lines.push(values.join(","));
  }
  return lines.join("\n");
}

function generateOptionalPropsJSON(rows: number, props: number): string {
  const records: Array<Record<string, unknown>> = [];
  for (let r = 0; r < rows; r++) {
    const record: Record<string, unknown> = { id: r };
    for (let p = 0; p < props; p++) {
      // Each property present in ~50% of records
      if ((r + p) % 2 === 0) {
        record[`opt_${p}`] = `val_${r}_${p}`;
      }
    }
    records.push(record);
  }
  return JSON.stringify(records);
}

function generateMixedPrimitivesJSON(rows: number, props: number): string {
  const records: Array<Record<string, unknown>> = [];
  for (let r = 0; r < rows; r++) {
    const record: Record<string, unknown> = {};
    for (let p = 0; p < props; p++) {
      const mod = (r * props + p) % 5;
      if (mod === 0) record[`p${p}`] = null;
      else if (mod === 1) record[`p${p}`] = r % 2 === 0;
      else if (mod === 2) record[`p${p}`] = r * props + p;
      else if (mod === 3) record[`p${p}`] = (r * props + p) / 3;
      else record[`p${p}`] = `str_${r}_${p}`;
    }
    records.push(record);
  }
  return JSON.stringify(records);
}

// ---------------------------------------------------------------------------
// Benchmarks (§15.3)
// ---------------------------------------------------------------------------

bench("Flat CSV 2000×20", 50, () => {
  const csv = generateFlatCSV(2000, 20);
  bibss.infer(csv);
});

bench("Nested JSON 2000×50 (depth 4)", 200, () => {
  const json = generateNestedJSON(2000, 50);
  bibss.infer(json);
});

bench("Wide CSV 2000×500", 500, () => {
  const csv = generateWideCSV(2000, 500);
  bibss.infer(csv);
});

bench("JSON with 20 optional properties, 2000 records", 100, () => {
  const json = generateOptionalPropsJSON(2000, 20);
  bibss.infer(json);
});

bench("JSON with mixed primitives, 2000 records, 10 properties", 50, () => {
  const json = generateMixedPrimitivesJSON(2000, 10);
  bibss.infer(json);
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
