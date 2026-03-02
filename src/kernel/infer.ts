/**
 * Structural Inference Engine
 *
 * Recursive traversal, type resolution, property merging,
 * array inference (three-tier model), union detection,
 * and typeDistribution accumulation.
 * Per BIBSS Spec §8.
 */

import type { SchemaNode, SchemaEdge, InferConfig, Primitive, Diagnostic } from "./types.js";
import { classifyPrimitive } from "./normalize-json.js";
import { widenTypes } from "./lattice.js";
import { childId, arrayItemId, unionMemberId } from "./node-id.js";
import { DiagnosticCollector, bibss007, bibss008 } from "./diagnostics.js";

// ---------------------------------------------------------------------------
// §8.5.1 Composite Kind Classification (Tier 1)
// ---------------------------------------------------------------------------

function classifyCompositeKind(v: unknown): "null" | "primitive" | "object" | "array" {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "object") return "object";
  return "primitive";
}

// ---------------------------------------------------------------------------
// Core: Infer a SchemaNode from a collection of values
// Implements the array inference decision tree (§8.5.2) which generalizes
// to any collection of values (property values across records, array elements).
// ---------------------------------------------------------------------------

function inferFromValues(
  values: unknown[],
  config: InferConfig,
  nodeId: string,
  nodeIndex: Map<string, SchemaNode>,
  diagnostics: DiagnosticCollector,
  name?: string,
): SchemaNode {
  // Rule 4: Empty
  if (values.length === 0) {
    const node: SchemaNode = {
      id: nodeId,
      kind: "primitive",
      primitiveType: "null",
      nullable: false,
      occurrences: 0,
      typeDistribution: {},
    };
    if (name !== undefined) node.name = name;
    nodeIndex.set(nodeId, node);
    return node;
  }

  // Classify all values by composite kind
  const primitiveValues: unknown[] = [];
  const objectValues: Array<Record<string, unknown>> = [];
  const arrayValues: unknown[][] = [];
  let nullCount = 0;

  for (const v of values) {
    switch (classifyCompositeKind(v)) {
      case "null":
        nullCount++;
        break;
      case "primitive":
        primitiveValues.push(v);
        break;
      case "object":
        objectValues.push(v as Record<string, unknown>);
        break;
      case "array":
        arrayValues.push(v as unknown[]);
        break;
    }
  }

  const hasNulls = nullCount > 0;
  const nonNullKindCount =
    (primitiveValues.length > 0 ? 1 : 0) +
    (objectValues.length > 0 ? 1 : 0) +
    (arrayValues.length > 0 ? 1 : 0);

  // Rule 1: All null
  if (nonNullKindCount === 0) {
    const node: SchemaNode = {
      id: nodeId,
      kind: "primitive",
      primitiveType: "null",
      nullable: true,
      occurrences: values.length,
      typeDistribution: { null: values.length },
    };
    if (name !== undefined) node.name = name;
    nodeIndex.set(nodeId, node);
    return node;
  }

  // Rule 2: Single composite kind + optional nulls
  if (nonNullKindCount === 1) {
    // All primitives (possibly mixed primitive kinds)
    if (primitiveValues.length > 0) {
      return inferPrimitiveNode(
        primitiveValues, nullCount, values.length,
        nodeId, nodeIndex, name,
      );
    }

    // All objects → property-merge
    if (objectValues.length > 0) {
      const merged = inferObjectSchema(
        objectValues, config, nodeId, nodeIndex, diagnostics, name,
      );
      if (hasNulls) merged.nullable = true;
      return merged;
    }

    // All arrays → recurse
    if (arrayValues.length > 0) {
      return inferArrayNode(
        arrayValues, nullCount, values.length,
        config, nodeId, nodeIndex, diagnostics, name,
      );
    }
  }

  // Rule 3: Multiple composite kinds → Union
  const members: SchemaNode[] = [];
  let memberIdx = 0;

  if (primitiveValues.length > 0) {
    const mId = unionMemberId(nodeId, memberIdx++);
    members.push(inferPrimitiveNode(
      primitiveValues, 0, primitiveValues.length,
      mId, nodeIndex,
    ));
  }

  if (objectValues.length > 0) {
    const mId = unionMemberId(nodeId, memberIdx++);
    members.push(inferObjectSchema(
      objectValues, config, mId, nodeIndex, diagnostics,
    ));
  }

  if (arrayValues.length > 0) {
    const mId = unionMemberId(nodeId, memberIdx++);
    members.push(inferArrayNode(
      arrayValues, 0, arrayValues.length,
      config, mId, nodeIndex, diagnostics,
    ));
  }

  const node: SchemaNode = {
    id: nodeId,
    kind: "union",
    members,
    nullable: hasNulls,
    occurrences: values.length,
  };
  if (name !== undefined) node.name = name;
  nodeIndex.set(nodeId, node);
  return node;
}

// ---------------------------------------------------------------------------
// Primitive Node Builder
// ---------------------------------------------------------------------------

function inferPrimitiveNode(
  primitiveValues: unknown[],
  nullCount: number,
  totalOccurrences: number,
  nodeId: string,
  nodeIndex: Map<string, SchemaNode>,
  name?: string,
): SchemaNode {
  const distribution: Partial<Record<Primitive, number>> = {};
  const types: Primitive[] = [];

  if (nullCount > 0) {
    distribution["null"] = nullCount;
  }

  for (const v of primitiveValues) {
    const pType = classifyPrimitive(v);
    types.push(pType);
    distribution[pType] = (distribution[pType] ?? 0) + 1;
  }

  // Add null types for widening
  for (let i = 0; i < nullCount; i++) {
    types.push("null");
  }

  const widened = widenTypes(types);

  const node: SchemaNode = {
    id: nodeId,
    kind: "primitive",
    primitiveType: widened.type,
    nullable: widened.nullable,
    occurrences: totalOccurrences,
    typeDistribution: distribution,
  };
  if (name !== undefined) node.name = name;
  nodeIndex.set(nodeId, node);
  return node;
}

// ---------------------------------------------------------------------------
// Array Node Builder (all-arrays case)
// ---------------------------------------------------------------------------

function inferArrayNode(
  arrayValues: unknown[][],
  nullCount: number,
  totalOccurrences: number,
  config: InferConfig,
  nodeId: string,
  nodeIndex: Map<string, SchemaNode>,
  diagnostics: DiagnosticCollector,
  name?: string,
): SchemaNode {
  const allElements: unknown[] = [];
  for (const arr of arrayValues) {
    for (const el of arr) {
      allElements.push(el);
    }
  }

  const itemId = arrayItemId(nodeId);
  let itemType: SchemaNode | null = null;

  if (allElements.length === 0) {
    diagnostics.add(bibss007());
  } else {
    itemType = inferFromValues(allElements, config, itemId, nodeIndex, diagnostics);
  }

  const node: SchemaNode = {
    id: nodeId,
    kind: "array",
    itemType,
    nullable: nullCount > 0,
    occurrences: totalOccurrences,
  };
  if (name !== undefined) node.name = name;
  nodeIndex.set(nodeId, node);
  return node;
}

// ---------------------------------------------------------------------------
// §8.5.3 Property-Merge Algorithm
// Merges N records into a single object SchemaNode.
// ---------------------------------------------------------------------------

export function inferObjectSchema(
  records: Array<Record<string, unknown>>,
  config: InferConfig,
  nodeId: string,
  nodeIndex: Map<string, SchemaNode>,
  diagnostics: DiagnosticCollector,
  name?: string,
): SchemaNode {
  const N = records.length;

  // Collect all property keys in first-seen order
  const allKeys: string[] = [];
  const keySet = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!keySet.has(key)) {
        allKeys.push(key);
        keySet.add(key);
      }
    }
  }

  // BIBSS-008: warn if >100 distinct keys
  if (keySet.size > 100) {
    diagnostics.add(bibss008(keySet.size));
  }

  const properties: SchemaEdge[] = [];

  for (const key of allKeys) {
    // Collect values where key is present (absence ≠ null per §8.5.3 step 2d)
    const values: unknown[] = [];
    let occurrences = 0;

    for (const record of records) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        values.push(record[key]);
        occurrences++;
      }
    }

    const propertyNodeId = childId(nodeId, key);
    const targetNode = inferFromValues(
      values, config, propertyNodeId, nodeIndex, diagnostics, key,
    );

    // §8.4: Required field detection
    const required = N === 0 ? false : (occurrences / N) >= config.requiredThreshold;

    properties.push({
      name: key,
      target: targetNode,
      required,
      occurrences,
      totalPopulation: N,
    });
  }

  const node: SchemaNode = {
    id: nodeId,
    kind: "object",
    properties,
    occurrences: N,
  };
  if (name !== undefined) node.name = name;
  nodeIndex.set(nodeId, node);
  return node;
}

// ---------------------------------------------------------------------------
// Public API: Full inference from normalized records
// ---------------------------------------------------------------------------

export interface InferEngineResult {
  root: SchemaNode;
  nodeIndex: Map<string, SchemaNode>;
  diagnostics: Diagnostic[];
}

/**
 * Run the structural inference engine on normalized records.
 * Returns an object root node. The caller wraps in an array node
 * if the input was CSV or a JSON array.
 */
export function inferSchema(
  records: Array<Record<string, unknown>>,
  config: InferConfig,
  rootNodeId: string,
): InferEngineResult {
  const nodeIndex = new Map<string, SchemaNode>();
  const diagnostics = new DiagnosticCollector();

  const root = inferObjectSchema(
    records, config, rootNodeId, nodeIndex, diagnostics,
  );

  return {
    root,
    nodeIndex,
    diagnostics: diagnostics.getAll(),
  };
}
