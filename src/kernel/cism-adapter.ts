/**
 * Raw CISM Adapter (Identity Adapter)
 *
 * Serializes a CISMRoot to a plain JSON-serializable object per Spec §11.2 and §9.3.
 * - nodeIndex and inputHash omitted from output
 * - typeDistribution keys serialized in lattice order (null, boolean, integer, number, string)
 * - Zero-count keys omitted from typeDistribution
 * - Property keys in declaration order per §9.1
 */

import type { CISMRoot, SchemaNode, SchemaEdge, Primitive } from "./types.js";
import { LATTICE_KEYS } from "./lattice.js";

// ---------------------------------------------------------------------------
// Node & Edge Serialization (declaration-order per §9.1)
// ---------------------------------------------------------------------------

function serializeTypeDistribution(
  dist: Partial<Record<Primitive, number>>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of LATTICE_KEYS) {
    const count = dist[key];
    if (count !== undefined && count > 0) {
      result[key] = count;
    }
  }
  return result;
}

function serializeNode(node: SchemaNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // §9.1 declaration order: id, kind, name?, occurrences, properties?, itemType?, primitiveType?, nullable?, typeDistribution?, members?
  out.id = node.id;
  out.kind = node.kind;
  if (node.name !== undefined) out.name = node.name;
  out.occurrences = node.occurrences;

  if (node.properties !== undefined) {
    out.properties = node.properties.map(serializeEdge);
  }
  if (node.itemType !== undefined) {
    out.itemType = node.itemType === null ? null : serializeNode(node.itemType);
  }
  if (node.primitiveType !== undefined) out.primitiveType = node.primitiveType;
  if (node.nullable !== undefined) out.nullable = node.nullable;
  if (node.typeDistribution !== undefined) {
    out.typeDistribution = serializeTypeDistribution(node.typeDistribution);
  }
  if (node.members !== undefined) {
    out.members = node.members.map(serializeNode);
  }

  return out;
}

function serializeEdge(edge: SchemaEdge): Record<string, unknown> {
  return {
    name: edge.name,
    target: serializeNode(edge.target),
    required: edge.required,
    occurrences: edge.occurrences,
    totalPopulation: edge.totalPopulation,
  };
}

// ---------------------------------------------------------------------------
// Public: Raw CISM Adapter
// ---------------------------------------------------------------------------

/**
 * Serialize CISMRoot to a plain JSON-serializable object.
 * nodeIndex and inputHash are omitted per §9.3.
 */
export function toRawCISM(cism: CISMRoot): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  out.version = cism.version;
  out.generatedAt = cism.generatedAt;
  out.config = { ...cism.config };
  out.root = serializeNode(cism.root);

  if (cism.sampling !== undefined) {
    out.sampling = { ...cism.sampling };
  }

  return out;
}
