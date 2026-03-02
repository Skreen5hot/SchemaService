/**
 * CISM Types, Configuration, and Diagnostic Interfaces
 *
 * All types defined in BIBSS Spec §9.1, §12, and §13.
 * This is the sole type-definition module for the kernel.
 */

// ---------------------------------------------------------------------------
// Primitive Types (Spec §8.2)
// ---------------------------------------------------------------------------

export type Primitive = "string" | "number" | "integer" | "boolean" | "null";

// ---------------------------------------------------------------------------
// CISM Data Structures (Spec §9.1)
// ---------------------------------------------------------------------------

export interface CISMRoot {
  version: "1.3";
  generatedAt: string; // ISO 8601 timestamp (set outside deterministic pipeline; see ADR-004)
  config: InferConfig;
  root: SchemaNode;
  nodeIndex: Map<string, SchemaNode>; // Omitted from serialization
  sampling?: {
    applied: boolean;
    inputSize: number;
    sampleSize: number;
    strategy: "strided";
  };
  inputHash?: string; // SHA-256 hex of first 1024 input bytes (for JSON Schema $id)
}

export interface SchemaNode {
  id: string; // RFC 6901 JSON Pointer path (Spec §9.2)
  kind: "object" | "array" | "primitive" | "union";
  name?: string;
  occurrences: number;

  // kind: "object"
  properties?: SchemaEdge[];

  // kind: "array"
  itemType?: SchemaNode | null;

  // kind: "primitive"
  primitiveType?: Primitive;
  nullable?: boolean;
  typeDistribution?: Partial<Record<Primitive, number>>; // Spec §9.4

  // kind: "union"
  members?: SchemaNode[]; // Max 3; one per composite kind (Spec §8.5.4)
  // nullable also applies to union nodes
}

export interface SchemaEdge {
  name: string; // Property name (unescaped)
  target: SchemaNode;
  required: boolean;
  occurrences: number;
  totalPopulation: number;
}

// ---------------------------------------------------------------------------
// Configuration (Spec §13)
// ---------------------------------------------------------------------------

export interface InferConfig {
  /** Minimum presence ratio for a field to be marked required. Default: 1.0 */
  requiredThreshold: number;

  /** Treat empty strings as null during CSV normalization. Default: true */
  emptyStringAsNull: boolean;

  /** Maximum records to process before sampling kicks in. Default: 2000 */
  sampleSize: number;

  /** Override format detection. Default: undefined (auto-detect). */
  format?: "csv" | "json";

  /** Maximum file size in bytes before warning. Default: 10485760 (10MB) */
  maxSizeWarning: number;
}

/** Create a config with all defaults per Spec §13. */
export function createDefaultConfig(): InferConfig {
  return {
    requiredThreshold: 1.0,
    emptyStringAsNull: true,
    sampleSize: 2000,
    maxSizeWarning: 10_485_760,
  };
}

// ---------------------------------------------------------------------------
// Diagnostics (Spec §12)
// ---------------------------------------------------------------------------

export interface Diagnostic {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public API Types (Spec §12)
// ---------------------------------------------------------------------------

export interface InferResult {
  cism: CISMRoot | null;
  diagnostics: Diagnostic[];
}

export type OutputAdapter<T = unknown> = (cism: CISMRoot) => T;

export interface AdapterRegistry {
  register(name: string, adapter: OutputAdapter): void;
  get(name: string): OutputAdapter | undefined;
  list(): string[];
}

export interface BIBSSService {
  infer(input: string | ArrayBuffer, config?: Partial<InferConfig>): InferResult;
  project<T>(cism: CISMRoot, adapterName: string): T;
  adapters: AdapterRegistry;
}
