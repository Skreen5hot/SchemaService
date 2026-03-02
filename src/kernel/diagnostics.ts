/**
 * Diagnostic Codes and Collector
 *
 * All diagnostic codes from BIBSS Spec §12.1.
 * Factory functions for each code, plus a DiagnosticCollector
 * for accumulating diagnostics during inference.
 */

import type { Diagnostic } from "./types.js";

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function diag(
  level: Diagnostic["level"],
  code: string,
  message: string,
  context?: Record<string, unknown>,
): Diagnostic {
  const d: Diagnostic = { level, code, message };
  if (context !== undefined) d.context = context;
  return d;
}

// ---------------------------------------------------------------------------
// BIBSS-001 through BIBSS-009 (Spec §12.1)
// ---------------------------------------------------------------------------

/** Input exceeds maxSizeWarning bytes. */
export function bibss001(inputSize: number, maxSize: number): Diagnostic {
  return diag("warning", "BIBSS-001",
    `Input size (${inputSize} bytes) exceeds recommended maximum (${maxSize} bytes)`,
    { inputSize, maxSize });
}

/** Sampling applied. */
export function bibss002(inputSize: number, sampleSize: number): Diagnostic {
  return diag("info", "BIBSS-002",
    `Sampling applied: ${sampleSize} records sampled from ${inputSize} total`,
    { inputSize, sampleSize, strategy: "strided" });
}

/** CSV row has mismatched column count. */
export function bibss003(rowIndex: number, expected: number, actual: number): Diagnostic {
  return diag("warning", "BIBSS-003",
    `Row ${rowIndex} has ${actual} columns (expected ${expected})`,
    { rowIndex, expected, actual });
}

/** JSON parse failure. */
export function bibss004(error: string): Diagnostic {
  return diag("error", "BIBSS-004",
    `JSON parse failure: ${error}`,
    { parseError: error });
}

/** CSV parse failure. */
export function bibss005(error: string): Diagnostic {
  return diag("error", "BIBSS-005",
    `CSV parse failure: ${error}`,
    { parseError: error });
}

/** Property name collision after trimming. */
export function bibss006(propertyName: string): Diagnostic {
  return diag("warning", "BIBSS-006",
    `Duplicate property name after trimming: "${propertyName}"`,
    { propertyName });
}

/** Empty input (zero records or zero-element array). */
export function bibss007(): Diagnostic {
  return diag("info", "BIBSS-007", "Empty input: zero records or zero-element array");
}

/** Array with >100 distinct property keys across elements. */
export function bibss008(keyCount: number): Diagnostic {
  return diag("warning", "BIBSS-008",
    `Array elements have ${keyCount} distinct property keys (>100); possible heterogeneous data`,
    { keyCount });
}

/** JSON input contains numeric values exceeding MAX_SAFE_INTEGER. */
export function bibss009(): Diagnostic {
  return diag("warning", "BIBSS-009",
    "JSON input contains integer literals with 16+ digits; precision loss may have occurred during parsing");
}

// ---------------------------------------------------------------------------
// DiagnosticCollector
// ---------------------------------------------------------------------------

/** Cap for BIBSS-003 diagnostics per Spec §14.2 */
const BIBSS003_CAP = 10;

export class DiagnosticCollector {
  private readonly items: Diagnostic[] = [];
  private bibss003Count = 0;

  add(diagnostic: Diagnostic): void {
    // Enforce BIBSS-003 cap
    if (diagnostic.code === "BIBSS-003") {
      this.bibss003Count++;
      if (this.bibss003Count > BIBSS003_CAP) return;
    }
    this.items.push(diagnostic);
  }

  getAll(): Diagnostic[] {
    return [...this.items];
  }

  hasErrors(): boolean {
    return this.items.some(d => d.level === "error");
  }
}
