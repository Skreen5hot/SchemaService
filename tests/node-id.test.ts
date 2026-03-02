/**
 * RFC 6901 Node ID Generation Tests
 *
 * All examples from Spec §9.2.3, plus collision-proof test from §9.2.4.
 */

import { strictEqual, notStrictEqual } from "node:assert";
import {
  escapeJsonPointer, rootId, childId, arrayItemId, unionMemberId,
} from "../src/kernel/node-id.js";

console.log("Node ID (RFC 6901) tests\n");

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

// --- Spec §9.2.3 Examples ---

test("Root node → #", () => {
  strictEqual(rootId(), "#");
});

test("Property 'customer' on root → #/customer", () => {
  strictEqual(childId("#", "customer"), "#/customer");
});

test("Nested 'address' on 'customer' → #/customer/address", () => {
  strictEqual(childId("#/customer", "address"), "#/customer/address");
});

test("Item type of 'orders' array → #/orders/[]", () => {
  strictEqual(arrayItemId(childId("#", "orders")), "#/orders/[]");
});

test("First union member inside array items → #/orders/[]/|0", () => {
  strictEqual(unionMemberId(arrayItemId(childId("#", "orders")), 0), "#/orders/[]/|0");
});

test("Literal dot in key: 'user.name' → #/user.name", () => {
  strictEqual(childId("#", "user.name"), "#/user.name");
});

test("Literal slash in key: 'a/b' → #/a~1b", () => {
  strictEqual(childId("#", "a/b"), "#/a~1b");
});

test("Literal tilde in key: 'a~b' → #/a~0b", () => {
  strictEqual(childId("#", "a~b"), "#/a~0b");
});

// --- Spec §9.2.4 Collision Proof ---

test("Literal key 'user.name' vs nested user→name produce distinct IDs", () => {
  const literalDot = childId("#", "user.name");   // #/user.name
  const nested = childId(childId("#", "user"), "name"); // #/user/name
  notStrictEqual(literalDot, nested);
});

// --- Escaping edge cases ---

test("Key with both ~ and / escapes correctly", () => {
  strictEqual(escapeJsonPointer("a~/b"), "a~0~1b");
});

test("Empty property name", () => {
  strictEqual(childId("#", ""), "#/");
});

test("Key with only tildes: '~~~' → '~0~0~0'", () => {
  strictEqual(escapeJsonPointer("~~~"), "~0~0~0");
});

// Summary
console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
