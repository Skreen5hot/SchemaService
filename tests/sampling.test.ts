/**
 * Deterministic Strided Sampling Tests
 *
 * Per BIBSS Spec §10.
 */

import { strictEqual, deepStrictEqual } from "node:assert";
import { sample } from "../src/kernel/sampling.js";

console.log("Strided sampling tests\n");

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

function makeRecords(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// --- No sampling when at or below sampleSize ---

test("Exactly sampleSize records → applied: false, all returned", () => {
  const records = makeRecords(2000);
  const r = sample(records, 2000);
  strictEqual(r.applied, false);
  strictEqual(r.sampled.length, 2000);
  strictEqual(r.inputSize, 2000);
  deepStrictEqual(r.sampled, records);
});

test("Below sampleSize → applied: false, all returned", () => {
  const records = makeRecords(500);
  const r = sample(records, 2000);
  strictEqual(r.applied, false);
  strictEqual(r.sampled.length, 500);
});

// --- Sampling applied above sampleSize ---

test("sampleSize+1 records → applied: true, ~sampleSize returned", () => {
  const records = makeRecords(2001);
  const r = sample(records, 2000);
  strictEqual(r.applied, true);
  strictEqual(r.inputSize, 2001);
  // Should produce exactly sampleSize records (±1 for rounding)
  const diff = Math.abs(r.sampled.length - 2000);
  strictEqual(diff <= 1, true, `Expected ~2000, got ${r.sampled.length}`);
});

test("10× sampleSize records → applied: true, ~sampleSize returned", () => {
  const records = makeRecords(20000);
  const r = sample(records, 2000);
  strictEqual(r.applied, true);
  strictEqual(r.inputSize, 20000);
  const diff = Math.abs(r.sampled.length - 2000);
  strictEqual(diff <= 1, true, `Expected ~2000, got ${r.sampled.length}`);
});

// --- First half always included ---

test("First floor(sampleSize/2) records always included", () => {
  const records = makeRecords(10000);
  const r = sample(records, 2000);
  const firstHalf = Math.floor(2000 / 2);
  for (let i = 0; i < firstHalf; i++) {
    strictEqual(r.sampled[i], i, `Record ${i} should be included`);
  }
});

// --- Determinism ---

test("Two calls with same input produce identical results", () => {
  const records = makeRecords(5000);
  const r1 = sample(records, 2000);
  const r2 = sample(records, 2000);
  deepStrictEqual(r1.sampled, r2.sampled);
  strictEqual(r1.applied, r2.applied);
  strictEqual(r1.inputSize, r2.inputSize);
});

test("Determinism with different sampleSize", () => {
  const records = makeRecords(5000);
  const r1 = sample(records, 500);
  const r2 = sample(records, 500);
  deepStrictEqual(r1.sampled, r2.sampled);
});

// --- Edge cases ---

test("Empty input → applied: false, empty result", () => {
  const r = sample([], 2000);
  strictEqual(r.applied, false);
  strictEqual(r.sampled.length, 0);
});

test("sampleSize 1 with 10 records → 1 record returned", () => {
  const records = makeRecords(10);
  const r = sample(records, 1);
  strictEqual(r.applied, true);
  strictEqual(r.sampled.length, 1);
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
