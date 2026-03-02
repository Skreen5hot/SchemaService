/**
 * CSV Normalization Pipeline
 *
 * Parse (Papa Parse) → Post-Parse Transforms → Type Narrowing
 * Per BIBSS Spec §7.1.
 */

import Papa from "papaparse";
import type { InferConfig, Diagnostic } from "./types.js";
import { DiagnosticCollector, bibss001, bibss003, bibss005, bibss006 } from "./diagnostics.js";

export interface CSVNormalizationResult {
  records: Array<Record<string, unknown>> | null;
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// §7.1.3 Type Narrowing Regexes
// ---------------------------------------------------------------------------

const BOOLEAN_RE = /^(true|false)$/i;
const INTEGER_RE = /^-?(?:0|[1-9][0-9]*)$/;
const NUMBER_RE = /^-?[0-9]+\.[0-9]+$/;

/**
 * Narrow a single CSV string value to its structural type.
 * Per Spec §7.1.3. Rules applied in order; first match wins.
 * Input is already trimmed and non-null at this point.
 */
export function narrowValue(value: string): unknown {
  // Boolean (case-insensitive)
  if (BOOLEAN_RE.test(value)) {
    return value.toLowerCase() === "true";
  }

  // Integer (no leading zeros, within MAX_SAFE_INTEGER)
  if (INTEGER_RE.test(value)) {
    const n = Number(value);
    if (Math.abs(n) <= Number.MAX_SAFE_INTEGER) {
      return n;
    }
    // Exceeds MAX_SAFE_INTEGER → remains string
    return value;
  }

  // Number (plain decimal only, no exponents)
  if (NUMBER_RE.test(value)) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
    // Non-finite → remains string
    return value;
  }

  // String (no match)
  return value;
}

// ---------------------------------------------------------------------------
// Main Pipeline
// ---------------------------------------------------------------------------

export function normalizeCSV(
  input: string,
  config: InferConfig,
): CSVNormalizationResult {
  const collector = new DiagnosticCollector();

  // §6.1: size warning
  const inputBytes = new TextEncoder().encode(input).length;
  if (inputBytes > config.maxSizeWarning) {
    collector.add(bibss001(inputBytes, config.maxSizeWarning));
  }

  // §7.1.1: Parse with Papa Parse, dynamicTyping disabled
  // Track trimmed headers for duplicate detection (Papa Parse renames dupes silently)
  const trimmedHeaders: string[] = [];
  const parseResult = Papa.parse<Record<string, string>>(input, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: "greedy",
    transformHeader: (h: string) => {
      const trimmed = h.trim();
      trimmedHeaders.push(trimmed);
      return trimmed;
    },
  });

  // Check for parse errors
  if (parseResult.errors.length > 0) {
    if (parseResult.data.length === 0 && parseResult.errors.some(e => e.type !== "FieldMismatch")) {
      collector.add(bibss005(parseResult.errors[0].message));
      return { records: null, diagnostics: collector.getAll() };
    }
  }

  const rawRecords = parseResult.data;
  const headers = parseResult.meta.fields ?? [];

  // §7.1.2 step: Check for duplicate headers after trimming
  // Use trimmedHeaders (pre-rename) since Papa Parse silently renames duplicates.
  // Papa Parse calls transformHeader twice (delimiter detection + main parse),
  // so we take only the first headers.length entries.
  const headerSet = new Set<string>();
  for (let i = 0; i < headers.length && i < trimmedHeaders.length; i++) {
    const h = trimmedHeaders[i];
    if (headerSet.has(h)) {
      collector.add(bibss006(h));
    }
    headerSet.add(h);
  }

  // §7.1.2 & §14.2: Post-parse transforms + mismatched row handling
  const records: Array<Record<string, unknown>> = [];

  for (let i = 0; i < rawRecords.length; i++) {
    const raw = rawRecords[i];
    const record: Record<string, unknown> = {};

    // Check for mismatched column count via Papa Parse FieldMismatch errors
    const rowError = parseResult.errors.find(e => e.row === i && e.type === "FieldMismatch");
    if (rowError) {
      // Papa Parse reports the actual field count in the error
      const actualCols = Object.keys(raw).length;
      collector.add(bibss003(i, headers.length, actualCols));
    }

    for (const key of headers) {
      let value: unknown = Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : null;

      if (typeof value === "string") {
        // §7.1.2 step 1: Trim
        value = value.trim();

        // §7.1.2 step 2: Empty string → null
        if (value === "" && config.emptyStringAsNull) {
          value = null;
        }
      }

      // §7.1.3: Type narrowing (only on non-null strings)
      if (typeof value === "string") {
        value = narrowValue(value);
      }

      record[key] = value;
    }

    records.push(record);
  }

  return { records, diagnostics: collector.getAll() };
}
