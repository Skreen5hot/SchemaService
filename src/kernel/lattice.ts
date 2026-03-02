/**
 * Type Widening Lattice
 *
 * Total order: null < boolean < integer < number < string
 * Per BIBSS Spec §8.3 and Appendix A (§23).
 *
 * The lattice applies identically in all contexts: property-level
 * inference across records, and element-level inference within arrays.
 */

import type { Primitive } from "./types.js";

/** Lattice ordering. Higher index = wider type. */
export const LATTICE_ORDER: Record<Primitive, number> = {
  null: 0,
  boolean: 1,
  integer: 2,
  number: 3,
  string: 4,
};

/** Keys in lattice order, for deterministic serialization of typeDistribution. */
export const LATTICE_KEYS: readonly Primitive[] = [
  "null",
  "boolean",
  "integer",
  "number",
  "string",
] as const;

export interface WidenResult {
  type: Primitive;
  nullable: boolean;
}

/**
 * Resolve two primitive types via the widening lattice.
 * null does not widen the resolved type — it sets the nullable flag.
 */
export function widenType(a: Primitive, b: Primitive): WidenResult {
  // Both null
  if (a === "null" && b === "null") {
    return { type: "null", nullable: true };
  }

  // One is null — resolved type is the other, nullable true
  if (a === "null") return { type: b, nullable: true };
  if (b === "null") return { type: a, nullable: true };

  // Neither is null — pick the wider type
  const resolved = LATTICE_ORDER[a] >= LATTICE_ORDER[b] ? a : b;
  return { type: resolved, nullable: false };
}

/**
 * Resolve an array of observed primitive types via left-fold.
 * The lattice is associative and commutative, so fold order doesn't matter.
 */
export function widenTypes(types: Primitive[]): WidenResult {
  if (types.length === 0) {
    return { type: "null", nullable: false };
  }

  let resolved: Primitive = types[0];
  let nullable = types[0] === "null";

  for (let i = 1; i < types.length; i++) {
    const r = widenType(resolved, types[i]);
    resolved = r.type;
    if (r.nullable) nullable = true;
  }

  return { type: resolved, nullable };
}
