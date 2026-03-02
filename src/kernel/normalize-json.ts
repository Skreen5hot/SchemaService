/**
 * JSON Normalization Pipeline
 *
 * Parse → Normalize to Array<Record<string, unknown>> → BIBSS-009 pre-scan.
 * Per BIBSS Spec §7.2 and §12.1 (BIBSS-009).
 *
 * Also exports classifyPrimitive (§7.3) — shared by both JSON and CSV pipelines.
 */

import type { InferConfig, Diagnostic, Primitive } from "./types.js";
import { DiagnosticCollector, bibss001, bibss004, bibss009 } from "./diagnostics.js";

export interface JSONNormalizationResult {
  records: Array<Record<string, unknown>> | null;
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// §7.3 Integer Classification from Parsed Values
// ---------------------------------------------------------------------------

/**
 * Classify a runtime value to its Tier 2 primitive kind.
 * Per Spec §7.3. Applies to JSON values and post-narrowing CSV values.
 */
export function classifyPrimitive(v: unknown): Primitive {
  if (v === null) return "null";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") {
    if (Number.isFinite(v) && Number.isInteger(v)) return "integer";
    return "number";
  }
  if (typeof v === "string") return "string";
  // Objects/arrays are not primitives — caller should not pass these
  return "string";
}

// ---------------------------------------------------------------------------
// §12.1 BIBSS-009 Large Integer Pre-Scan
// ---------------------------------------------------------------------------

const LARGE_INTEGER_RE = /[0-9]{16,}/;

/**
 * Heuristic pre-scan for large integers that may have lost precision
 * during JSON.parse. Per Spec §12.1 (BIBSS-009 Detection).
 */
export function scanLargeIntegers(rawInput: string): boolean {
  return LARGE_INTEGER_RE.test(rawInput);
}

// ---------------------------------------------------------------------------
// §7.2 JSON Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize parsed JSON into Array<Record<string, unknown>>.
 *
 * Rules per §7.2:
 * - Single object → wrapped in array
 * - Array of objects → used directly
 * - Array of primitives → each wrapped as { _value: primitive }
 * - Mixed arrays → each element normalized (objects kept, primitives wrapped)
 * - Nested objects and arrays preserved (not flattened)
 */
function normalizeValue(parsed: unknown): Array<Record<string, unknown>> {
  // Single object (not array, not null)
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return [parsed as Record<string, unknown>];
  }

  // Array
  if (Array.isArray(parsed)) {
    const records: Array<Record<string, unknown>> = [];
    for (const element of parsed) {
      if (element !== null && typeof element === "object" && !Array.isArray(element)) {
        // Object element → use directly
        records.push(element as Record<string, unknown>);
      } else {
        // Primitive, null, or nested array → wrap as { _value: element }
        records.push({ _value: element });
      }
    }
    return records;
  }

  // Bare primitive (string, number, boolean, null) → wrap
  return [{ _value: parsed }];
}

export function normalizeJSON(
  input: string,
  config: InferConfig,
): JSONNormalizationResult {
  const collector = new DiagnosticCollector();

  // §6.1: size warning
  const inputBytes = new TextEncoder().encode(input).length;
  if (inputBytes > config.maxSizeWarning) {
    collector.add(bibss001(inputBytes, config.maxSizeWarning));
  }

  // §12.1: BIBSS-009 large integer pre-scan (before JSON.parse rounds them)
  if (scanLargeIntegers(input)) {
    collector.add(bibss009());
  }

  // Parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    collector.add(bibss004(message));
    return { records: null, diagnostics: collector.getAll() };
  }

  // Normalize to Array<Record<string, unknown>>
  const records = normalizeValue(parsed);

  return { records, diagnostics: collector.getAll() };
}
