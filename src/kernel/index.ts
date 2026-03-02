/**
 * BIBSS Public API
 *
 * Entry point per Spec §12. Wires together:
 * format detection → normalization → sampling → inference → output adapters.
 *
 * generatedAt is set HERE (outside the deterministic pipeline) per ADR-004.
 */

import { sha256Hex } from "./hash.js";
import type {
  CISMRoot, SchemaNode, InferConfig, InferResult,
  Diagnostic, BIBSSService,
} from "./types.js";
import { createDefaultConfig } from "./types.js";
import { detectFormat } from "./detect.js";
import { normalizeCSV } from "./normalize-csv.js";
import { normalizeJSON } from "./normalize-json.js";
import { sample } from "./sampling.js";
import { inferSchema } from "./infer.js";
import { rootId, arrayItemId } from "./node-id.js";
import { createAdapterRegistry } from "./adapter-registry.js";
import { toRawCISM } from "./cism-adapter.js";
import { toJsonSchema } from "./json-schema-adapter.js";
import { bibss002, bibss007 } from "./diagnostics.js";

// Re-export types for consumers
export type {
  CISMRoot, SchemaNode, InferConfig, InferResult,
  Diagnostic, BIBSSService,
} from "./types.js";
export { createDefaultConfig } from "./types.js";

/**
 * Create a BIBSS service instance with its own adapter registry.
 * Built-in adapters "cism" and "jsonschema" are pre-registered.
 */
export function createBIBSS(): BIBSSService {
  const registry = createAdapterRegistry();

  // Pre-register built-in adapters (§11)
  registry.register("cism", toRawCISM);
  registry.register("jsonschema", toJsonSchema);

  return {
    infer(input: string | ArrayBuffer, config?: Partial<InferConfig>): InferResult {
      const cfg: InferConfig = { ...createDefaultConfig(), ...config };
      const inputStr = typeof input === "string"
        ? input
        : new TextDecoder().decode(input);

      // Empty input → null CISM with BIBSS-007
      if (inputStr.trim().length === 0) {
        return { cism: null, diagnostics: [bibss007()] };
      }

      // Format detection (§6.3)
      const format = detectFormat(inputStr, cfg);

      // Normalization (§7)
      let records: Array<Record<string, unknown>> | null;
      const diagnostics: Diagnostic[] = [];

      if (format === "csv") {
        const result = normalizeCSV(inputStr, cfg);
        records = result.records;
        diagnostics.push(...result.diagnostics);
      } else {
        const result = normalizeJSON(inputStr, cfg);
        records = result.records;
        diagnostics.push(...result.diagnostics);
      }

      if (records === null) {
        return { cism: null, diagnostics };
      }

      // Empty records → null CISM with BIBSS-007
      if (records.length === 0) {
        diagnostics.push(bibss007());
        return { cism: null, diagnostics };
      }

      // Sampling (§10)
      const sampleResult = sample(records, cfg.sampleSize);
      if (sampleResult.applied) {
        diagnostics.push(bibss002(sampleResult.inputSize, cfg.sampleSize));
      }

      // Inference (§8)
      // Root type selection: CSV and JSON arrays → array root; single JSON object → object root
      const isArrayRoot = format === "csv" || inputStr.trimStart()[0] !== "{";
      const inferNodeId = isArrayRoot ? arrayItemId(rootId()) : rootId();
      const inferResult = inferSchema(sampleResult.sampled, cfg, inferNodeId);
      diagnostics.push(...inferResult.diagnostics);

      let root: SchemaNode;
      if (isArrayRoot) {
        root = {
          id: rootId(),
          kind: "array",
          itemType: inferResult.root,
          occurrences: 1,
        };
        inferResult.nodeIndex.set(rootId(), root);
      } else {
        root = inferResult.root;
      }

      // Compute input hash (SHA-256 of first 1024 bytes) for JSON Schema $id
      const inputBytes = typeof input === "string"
        ? new TextEncoder().encode(input)
        : new Uint8Array(input);
      const inputHash = sha256Hex(inputBytes.slice(0, 1024));

      // Construct CISMRoot — generatedAt set HERE per ADR-004
      const cism: CISMRoot = {
        version: "1.3",
        generatedAt: new Date().toISOString(),
        config: cfg,
        root,
        nodeIndex: inferResult.nodeIndex,
        inputHash,
      };

      if (sampleResult.applied) {
        cism.sampling = {
          applied: true,
          inputSize: sampleResult.inputSize,
          sampleSize: cfg.sampleSize,
          strategy: "strided",
        };
      }

      return { cism, diagnostics };
    },

    project<T>(cism: CISMRoot, adapterName: string): T {
      const adapter = registry.get(adapterName);
      if (!adapter) {
        throw new Error(
          `Unknown adapter: "${adapterName}". Available: ${registry.list().join(", ")}`,
        );
      }
      return adapter(cism) as T;
    },

    adapters: registry,
  };
}
