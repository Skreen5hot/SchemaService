/**
 * RFC 6901 JSON Pointer Node ID Generation
 *
 * Per BIBSS Spec §9.2. Node IDs are collision-proof paths
 * using JSON Pointer escaping for ~ and / in property names.
 */

/**
 * Escape a single path segment per RFC 6901:
 * ~ → ~0, / → ~1. Order matters: escape ~ first.
 */
export function escapeJsonPointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Root node ID. */
export function rootId(): string {
  return "#";
}

/** Object child: parentId + "/" + escape(propertyName). */
export function childId(parentId: string, propertyName: string): string {
  return parentId + "/" + escapeJsonPointer(propertyName);
}

/** Array item type: parentId + "/[]". */
export function arrayItemId(parentId: string): string {
  return parentId + "/[]";
}

/** Union member: parentId + "/|" + memberIndex. */
export function unionMemberId(parentId: string, index: number): string {
  return parentId + "/|" + index;
}
