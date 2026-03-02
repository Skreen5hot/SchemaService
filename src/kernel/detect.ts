/**
 * Format Detection
 *
 * Determines whether input is CSV or JSON per BIBSS Spec §6.3.
 */

import type { InferConfig } from "./types.js";

export function detectFormat(input: string, config: InferConfig): "csv" | "json" {
  // Spec §6.3: explicit override takes precedence
  if (config.format !== undefined) {
    return config.format;
  }

  // Heuristic: trim leading whitespace, check first character
  const trimmed = input.trimStart();
  if (trimmed.length > 0 && (trimmed[0] === "{" || trimmed[0] === "[")) {
    return "json";
  }
  return "csv";
}
