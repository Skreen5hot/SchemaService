# BIBSS v1.3 — Implementation Roadmap

<!--
  Authoritative implementation plan for the Brain-in-the-Box Schema Service.
  Derived from project/BIBSS-V1.3-SPEC.md (the normative specification).
  AI agents MUST read this file at session start to identify the current phase and task.
-->

## Status Overview

| Phase | Name | Status | Dependencies |
|-------|------|--------|--------------|
| 0 | Project Scaffold | **Complete** | — |
| 1 | Types & Core Primitives | **Complete** | Phase 0 |
| 2 | CSV Pipeline | **Complete** | Phase 1 |
| 3 | JSON Pipeline | **Complete** | Phase 1 |
| 4 | Structural Inference Engine | **Complete** | Phases 2, 3 |
| 5 | Output Adapters & Public API | **Complete** | Phase 4 |
| 6 | Integration Tests & Hardening | **Complete** | Phase 5 |

---

## Phase 0: Project Scaffold

**Goal:** Transform the template repository into a BIBSS-ready project. Install Papa Parse, establish the module structure, update package metadata, and verify the existing spec tests still pass.

**Status:** Complete

### 0.1 Update Package Metadata

**Status:** Complete | **Priority:** High

**Acceptance Criteria:**
- [ ] `package.json` `name` changed to `bibss` (or `@fnsr/bibss`)
- [ ] `version` set to `1.3.0-alpha.0`
- [ ] `description` updated to match BIBSS purpose (Spec §1)
- [ ] `main` and `types` still point to `dist/kernel/index.js` and `dist/kernel/index.d.ts`
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm test` passes (existing spec tests: determinism, no-network, snapshot)
- [ ] `npm run test:purity` passes

### 0.2 Install Papa Parse as Runtime Dependency

**Status:** Complete | **Priority:** High

Papa Parse is the **one** runtime dependency (Spec §5). It is bundled at build time — no CDN, no dynamic import. See ADR-002 in DECISIONS.md for rationale.

**Acceptance Criteria:**
- [ ] `papaparse` added to `dependencies` (not `devDependencies`) in `package.json`
- [ ] `@types/papaparse` added to `devDependencies`
- [ ] `npm run build` succeeds — TypeScript resolves Papa Parse types
- [ ] `npm run test:purity` passes — Papa Parse is a runtime dependency, not a kernel boundary violation
- [ ] Verify: the compiled kernel files import `papaparse` but make zero network calls (existing no-network spec test must still pass)

**Developer Note:** The purity checker (`scripts/ensure-kernel-purity.ts`) blocks non-relative, non-`node:` imports. It will flag `import ... from "papaparse"`. The purity checker MUST be updated to allow `papaparse` as a whitelisted runtime dependency. This is the ONLY exception — see ADR-002.

### 0.3 Create Kernel Module Structure

**Status:** Complete | **Priority:** High

The BIBSS kernel is larger than the template's single-file transform. Create the module files (empty or with type stubs only — no implementation yet).

**Target structure:**
```
src/kernel/
  index.ts           — Public API entry point (Spec §12)
  types.ts           — All CISM types, InferConfig, Diagnostic (Spec §9.1, §12, §13)
  detect.ts          — Format detection (Spec §6.3)
  normalize-csv.ts   — CSV parse + post-parse transforms + type narrowing (Spec §7.1)
  normalize-json.ts  — JSON normalization (Spec §7.2)
  infer.ts           — Structural inference engine (Spec §8)
  lattice.ts         — Type widening lattice (Spec §8.3)
  node-id.ts         — RFC 6901 JSON Pointer ID generation (Spec §9.2)
  sampling.ts        — Deterministic strided sampling (Spec §10)
  adapter-registry.ts — Output adapter registry (Spec §11.3)
  json-schema-adapter.ts — JSON Schema Draft 2020-12 adapter (Spec §11.1)
  diagnostics.ts     — Diagnostic codes and builder (Spec §12.1)
  canonicalize.ts    — (existing) Deterministic JSON serialization
  transform.ts       — (existing) Will be replaced by BIBSS public API wrapper
```

**Acceptance Criteria:**
- [ ] All files created with TypeScript type stubs and `// TODO` markers
- [ ] Every file exports at least one type or function signature
- [ ] `npm run build` succeeds (type stubs compile)
- [ ] `npm run test:purity` passes (all imports are within `src/kernel/` or `papaparse`)
- [ ] No implementation logic yet — this is scaffold only

### 0.4 Update Examples and Snapshot Test

**Status:** Deferred to Phase 6.5 | **Priority:** Medium

**Note (Phase 0 resolution):** CLAUDE.md prohibits modifying spec tests. The existing snapshot test (`tests/snapshot.test.ts`) continues to exercise the identity `transform()`, which remains functional. The snapshot test will be migrated to the BIBSS `infer()` API in Phase 6.5 when spec tests are updated for the new API shape.

The template's snapshot test (`tests/snapshot.test.ts`) compares `transform(input)` against `examples/expected-output.jsonld`. Since BIBSS replaces the identity transform, these must be updated to reflect a minimal BIBSS inference example.

**Acceptance Criteria:**
- [ ] `examples/input.jsonld` replaced or augmented with a BIBSS-appropriate input (e.g., a small JSON array of objects)
- [ ] `examples/expected-output.jsonld` replaced with the expected CISM output for that input
- [ ] Snapshot test updated to call `infer()` instead of `transform()` (or adapted to new API shape)
- [ ] `npm test` passes (snapshot test green against new expected output)

**Note:** The snapshot test format must accommodate the `generatedAt` exclusion per ADR-004. The test compares CISM output minus `generatedAt`.

### 0.5 Write the First Domain Test: typeDistribution Accumulation

**Status:** Complete (PENDING activation — test body commented, awaiting Phase 4) | **Priority:** Critical

This test is written **before any implementation** and serves as the correctness anchor for the entire engine. See the Orchestrator's implementation note #2.

**Test case (from Spec §17.2):**
- Input: CSV with 100 rows for a single column: 95 values parse as integer, 3 parse as string, 2 are empty (null via `emptyStringAsNull`)
- Expected: `primitiveType: "string"` (lattice: integer + string → string), `nullable: true`, `typeDistribution: { "null": 2, "integer": 95, "string": 3 }`, `occurrences: 100`
- Invariant: sum of `typeDistribution` values === `occurrences` (Spec §17.3 item 7)

**Why first:** If the engine accumulates `typeDistribution` post-widening (recording the resolved type for all values), it will produce `{ "string": 100 }` instead of the correct pre-widening distribution. This test catches that fundamental design error before it propagates.

**Acceptance Criteria:**
- [ ] Test file `tests/type-distribution.test.ts` created
- [ ] Test generates a 100-row CSV string with 95 integer values, 3 string values, 2 empty values
- [ ] Test calls `infer(csv)` and inspects the column's `typeDistribution`
- [ ] Test asserts `primitiveType === "string"`
- [ ] Test asserts `nullable === true`
- [ ] Test asserts `typeDistribution` deep-equals `{ "null": 2, "integer": 95, "string": 3 }`
- [ ] Test asserts sum of distribution values === `occurrences`
- [ ] Test currently **fails** (expected — no implementation yet). Test runner tolerates this (or test is skipped with `// PENDING: awaiting Phase 4 implementation`)

**NOT in scope for Phase 0:**
- Implementation code
- Bundle tooling (esbuild/Rollup) — deferred to Phase 6

---

## Phase 1: Types & Core Primitives

**Goal:** Implement the type system, configuration, diagnostics, node ID generation, and the type widening lattice. These are the foundational building blocks used by every subsequent phase.

**Status:** Complete

### 1.1 CISM Types and InferConfig

**Status:** Not Started | **Priority:** High

Implement all TypeScript interfaces from Spec §9.1, §12, and §13 in `src/kernel/types.ts`.

**Acceptance Criteria:**
- [ ] `CISMRoot`, `SchemaNode`, `SchemaEdge` interfaces match Spec §9.1 exactly
- [ ] `InferConfig` interface with defaults matches Spec §13 exactly
- [ ] `InferResult`, `Diagnostic` interfaces match Spec §12 exactly
- [ ] `Primitive` type union: `"string" | "number" | "integer" | "boolean" | "null"`
- [ ] `BIBSS` public API interface defined (Spec §12): `infer()`, `project()`, `adapters`
- [ ] Default config factory function: `createDefaultConfig(): InferConfig`
- [ ] `npm run build` succeeds

### 1.2 Diagnostic Codes

**Status:** Not Started | **Priority:** High

Implement all 9 diagnostic codes (Spec §12.1) in `src/kernel/diagnostics.ts`.

**Acceptance Criteria:**
- [ ] Each `BIBSS-001` through `BIBSS-009` has a factory function returning `Diagnostic`
- [ ] Factory functions accept contextual parameters (e.g., `BIBSS-003` accepts row index)
- [ ] `BIBSS-003` cap: maximum 10 diagnostics emitted for mismatched rows (Spec §14.2)
- [ ] Export a `DiagnosticCollector` class or equivalent for accumulating diagnostics during inference
- [ ] Unit test: each factory produces correct `level`, `code`, and `message`

### 1.3 RFC 6901 Node ID Generation

**Status:** Not Started | **Priority:** High

Implement `src/kernel/node-id.ts` per Spec §9.2.

**Acceptance Criteria:**
- [ ] `escapeJsonPointer(segment: string): string` — escapes `~` to `~0`, `/` to `~1`
- [ ] `rootId()` returns `"#"`
- [ ] `childId(parentId, propertyName)` returns `parentId + "/" + escape(propertyName)`
- [ ] `arrayItemId(parentId)` returns `parentId + "/[]"`
- [ ] `unionMemberId(parentId, index)` returns `parentId + "/|" + index`
- [ ] Unit test: all examples from Spec §9.2.3 pass (including `a/b` → `a~1b`, `a~b` → `a~0b`)
- [ ] Unit test: collision proof — `"user.name"` literal key vs nested `user → name` produce distinct IDs

### 1.4 Type Widening Lattice

**Status:** Not Started | **Priority:** High

Implement `src/kernel/lattice.ts` per Spec §8.3 and Appendix A.

**Acceptance Criteria:**
- [ ] `LATTICE_ORDER` constant: `{ null: 0, boolean: 1, integer: 2, number: 3, string: 4 }`
- [ ] `widenType(a: Primitive, b: Primitive): { type: Primitive, nullable: boolean }` — resolves per lattice
- [ ] `widenTypes(types: Primitive[]): { type: Primitive, nullable: boolean }` — left-fold over array
- [ ] Unit test: all 15 rows from Appendix A (Spec §23) pass
- [ ] Unit test: symmetry — `widenType(a, b) === widenType(b, a)` for all pairs
- [ ] Unit test: three-way — `[boolean, integer, string]` resolves to `string`
- [ ] Unit test: `null` sets nullable flag but does not widen the resolved type
- [ ] `npm run build` succeeds
- [ ] `npm run test:purity` passes

### 1.5 Format Detection

**Status:** Not Started | **Priority:** Medium

Implement `src/kernel/detect.ts` per Spec §6.3.

**Acceptance Criteria:**
- [ ] `detectFormat(input: string, config: InferConfig): "csv" | "json"`
- [ ] Explicit `config.format` override takes precedence
- [ ] Trim leading whitespace; first non-whitespace char `{` or `[` → `"json"`, else `"csv"`
- [ ] Unit test: `"  [1,2]"` → json, `"name,age\n"` → csv, `"  {}"` → json
- [ ] Unit test: explicit format override ignores content

### 1.6 Deterministic Strided Sampling

**Status:** Not Started | **Priority:** Medium

Implement `src/kernel/sampling.ts` per Spec §10.

**Acceptance Criteria:**
- [ ] `sample<T>(records: T[], sampleSize: number): { sampled: T[], applied: boolean }`
- [ ] If `records.length <= sampleSize`, returns all records with `applied: false`
- [ ] If `records.length > sampleSize`: first `floor(sampleSize / 2)` always included, remaining selected by stride
- [ ] Deterministic: same input length + same sampleSize → same indices selected
- [ ] Unit test: 2000 records at sampleSize 2000 → `applied: false`, all returned
- [ ] Unit test: 2001 records at sampleSize 2000 → `applied: true`, exactly ~2000 returned
- [ ] Unit test: 20000 records at sampleSize 2000 → `applied: true`, exactly ~2000 returned
- [ ] Unit test: determinism — two calls with same input produce identical sampled sets

**NOT in scope for Phase 1:**
- CSV parsing or JSON normalization (Phase 2 and 3)
- Inference engine (Phase 4)
- Output adapters (Phase 5)

---

## Phase 2: CSV Pipeline

**Goal:** Implement CSV parsing, post-parse normalization, and the type narrowing pass. This phase produces `Array<Record<string, unknown>>` from CSV input.

**Status:** Complete

### 2.1 CSV Parsing with Papa Parse

**Status:** Complete | **Priority:** High

Implement the Papa Parse invocation in `src/kernel/normalize-csv.ts` per Spec §7.1.1.

**Acceptance Criteria:**
- [ ] Papa Parse invoked with: `header: true`, `dynamicTyping: false`, `skipEmptyLines: "greedy"`, `transformHeader: (h) => h.trim()`
- [ ] Parse errors produce `BIBSS-005` diagnostic and return `null` records
- [ ] `BIBSS-001` emitted if input exceeds `config.maxSizeWarning` bytes
- [ ] Unit test: simple CSV with header and 3 rows → 3 records with string values
- [ ] Unit test: delimiter auto-detection — tab-separated, pipe-separated, semicolon-separated inputs all parse correctly
- [ ] Unit test: BOM is stripped
- [ ] Unit test: quoted fields with embedded commas, newlines, and escaped double-quotes

### 2.2 Post-Parse Transforms

**Status:** Complete | **Priority:** High

Implement the three post-parse transforms (Spec §7.1.2) in `src/kernel/normalize-csv.ts`.

**Acceptance Criteria:**
- [ ] All string values trimmed
- [ ] Empty strings converted to `null` when `config.emptyStringAsNull === true`
- [ ] Empty strings preserved when `config.emptyStringAsNull === false`
- [ ] Missing keys padded with `null`; `BIBSS-003` emitted for mismatched rows (capped at 10)
- [ ] Long rows truncated to header length; `BIBSS-003` emitted
- [ ] `BIBSS-006` emitted if header trimming produces duplicate property names
- [ ] Unit test: `"  hello  "` → `"hello"`
- [ ] Unit test: `""` → `null` (default config)
- [ ] Unit test: row with fewer columns → missing keys filled with `null`

### 2.3 CSV Type Narrowing Pass

**Status:** Complete | **Priority:** High

Implement the deterministic type narrowing rules from Spec §7.1.3 in `src/kernel/normalize-csv.ts`.

**Acceptance Criteria:**
- [ ] Rules applied in order: Null → Boolean → Integer → Number → String
- [ ] **Boolean (case-insensitive):** `"true"`, `"True"`, `"TRUE"`, `"false"`, `"False"`, `"FALSE"` → boolean. `"yes"`, `"no"` → string.
- [ ] **Integer:** `/^-?(?:0|[1-9][0-9]*)$/` and `<= MAX_SAFE_INTEGER`. Leading zeros → string. `"00123"` → string. `"0"` → integer.
- [ ] **Number:** `/^-?[0-9]+\.[0-9]+$/` and `Number()` is finite. No exponents.
- [ ] **No scientific notation:** `"1e5"`, `"1E5"`, `"2.5E+3"`, `"-1e-2"` → string.
- [ ] **`"NaN"`, `"Infinity"`, `"-Infinity"`** → string.
- [ ] **MAX_SAFE_INTEGER guard:** `"9007199254740993"` → string.
- [ ] `null` values pass through unchanged.
- [ ] Unit test: all 26 rows from Appendix C (Spec §25) pass
- [ ] Unit test: `" 42 "` → integer `42` (trim happens in post-parse, before narrowing)

### 2.4 Full CSV Normalization Integration Test

**Status:** Complete | **Priority:** Medium

End-to-end test: raw CSV string → `Array<Record<string, unknown>>` with correct types.

**Acceptance Criteria:**
- [ ] Test constructs a CSV with headers and mixed-type values (integers, booleans, strings, empty cells)
- [ ] `normalizeCSV(input, config)` returns records with correct types per §7.1.3
- [ ] Diagnostics collected and verified (no errors for valid input)
- [ ] Determinism: two calls with identical input produce identical output

---

## Phase 3: JSON Pipeline

**Goal:** Implement JSON parsing, normalization, and the BIBSS-009 large-integer pre-scan.

**Status:** Complete

### 3.1 JSON Normalization

**Status:** Complete | **Priority:** High

Implement `src/kernel/normalize-json.ts` per Spec §7.2.

**Acceptance Criteria:**
- [ ] Single object → wrapped in array: `{ a: 1 }` → `[{ a: 1 }]`
- [ ] Array of objects → used directly
- [ ] Array of primitives → each wrapped: `[1, "a"]` → `[{ _value: 1 }, { _value: "a" }]`
- [ ] Nested objects and arrays preserved (not flattened)
- [ ] `JSON.parse` failure produces `BIBSS-004` diagnostic and `null` result
- [ ] `BIBSS-001` emitted if input exceeds `config.maxSizeWarning` bytes
- [ ] Unit test: single object wrapping
- [ ] Unit test: array of heterogeneous values
- [ ] Unit test: deeply nested JSON preserved

### 3.2 Integer Classification from Parsed Values

**Status:** Complete | **Priority:** High

Implement the integer detection rule from Spec §7.3. This applies to both JSON values and post-narrowing CSV values.

**Acceptance Criteria:**
- [ ] `classifyPrimitive(v: unknown): Primitive` — returns the Tier 2 primitive kind
- [ ] `typeof v === "number" && Number.isFinite(v) && Number.isInteger(v)` → `"integer"`
- [ ] `typeof v === "number"` (non-integer) → `"number"`
- [ ] `typeof v === "boolean"` → `"boolean"`
- [ ] `typeof v === "string"` → `"string"`
- [ ] `v === null` → `"null"`
- [ ] Unit test: `42` → integer, `3.14` → number, `NaN` → (not finite, handled upstream), `true` → boolean, `"hi"` → string, `null` → null

### 3.3 BIBSS-009 Large Integer Pre-Scan

**Status:** Complete | **Priority:** Medium

Implement the heuristic regex pre-scan from Spec §12.1 (BIBSS-009 Detection).

**Acceptance Criteria:**
- [ ] Regex scan on raw JSON input string for `[0-9]{16,}` (16+ consecutive digits)
- [ ] If found, `BIBSS-009` diagnostic emitted (warning level)
- [ ] Processing continues — this is a warning, not a blocking error
- [ ] Unit test: JSON with `9007199254740993` triggers BIBSS-009
- [ ] Unit test: JSON with `1234567890123456` (16 digits, safe) triggers BIBSS-009 (conservative: it's a digit-length heuristic, not a value check)
- [ ] Unit test: JSON with `123456789012345` (15 digits) does NOT trigger

---

## Phase 4: Structural Inference Engine

**Goal:** Implement the core inference engine: recursive traversal, type resolution, property merging, array inference (three-tier model), union detection, and typeDistribution accumulation.

**This is the largest and most complex phase.** It implements Spec §8 in its entirety.

**Status:** Complete

**Implementation order within this phase:** The tasks have implicit dependencies that constrain ordering. The recommended sequence is:

1. **4.1** (flat object inference) — foundational; exercises lattice, required, nullable, typeDistribution
2. **4.4** (property-merge) — needed by array inference Rule 2 "all objects" case
3. **4.3** (array three-tier) — needs property-merge for object arrays; produces union nodes
4. **4.2** (recursive object inference) — needs array inference for properties containing arrays
5. **4.5** (degenerate inputs) — edge cases, last

If developers build 4.2 before 4.3/4.4, they must stub out array handling and return to wire it. That is acceptable, but the ordering above minimizes stub-and-revisit cycles.

### 4.1 Property-Level Inference (Flat Objects)

**Status:** Complete | **Priority:** High

Infer schema for flat records (CSV-like: no nesting, no arrays). This is the simplest case and exercises the lattice, required-field detection, nullable detection, and typeDistribution accumulation.

**Acceptance Criteria:**
- [ ] Given `Array<Record<string, unknown>>`, produce a single object `SchemaNode` with `properties: SchemaEdge[]`
- [ ] Each property's type resolved via widening lattice (Spec §8.3)
- [ ] `typeDistribution` accumulated **at observation time, before widening** (Spec §9.4 items 1–4). This is the critical ordering requirement — see ADR-003.
- [ ] `required` detection per Spec §8.4: `occurrences(P) / N >= requiredThreshold`
- [ ] `N === 0` guard: `required = false`
- [ ] `nullable` set when any value is `null` (independent of required)
- [ ] Absence (key missing) vs. null (key present with `null` value) distinguished per Spec §8.5.3 step 2d/2e
- [ ] Node IDs use RFC 6901 (from Phase 1.3)
- [ ] **The Phase 0.5 typeDistribution test passes** (95 int / 3 string / 2 null → `primitiveType: "string"`, distribution preserved)
- [ ] Unit test: all-integer column → `primitiveType: "integer"`, `typeDistribution: { "integer": N }`
- [ ] Unit test: mixed integer+string column → `primitiveType: "string"`, distribution preserved
- [ ] Unit test: all-null column → `primitiveType: "null"`, `nullable: true`
- [ ] Unit test: 100% present → `required: true`; 99% present at threshold 1.0 → `required: false`
- [ ] Unit test: configurable threshold — 0.95 with 96% present → `required: true`
- [ ] Unit test: sum of `typeDistribution` values === `occurrences` (invariant §17.3 item 7)

### 4.2 Recursive Object Inference (Nested JSON)

**Status:** Complete | **Priority:** High

Extend the engine to recurse into nested objects.

**Acceptance Criteria:**
- [ ] Nested objects produce child `SchemaNode` with `kind: "object"` and their own `properties`
- [ ] Node IDs chain correctly: `#/customer/address/city`
- [ ] Required/nullable propagate independently at each nesting level
- [ ] `typeDistribution` accumulated on leaf primitive nodes only (not on object/array nodes)
- [ ] Unit test: depth 1 through depth 5 nesting
- [ ] Unit test: mixed nesting — some records have the nested object, some don't → optional

### 4.3 Array Inference — Three-Tier Model

**Status:** Complete | **Priority:** Critical

Implement the full array inference decision tree from Spec §8.5.

**Acceptance Criteria (Rule 1 — All null):**
- [ ] `[null, null, null]` → `{ kind: "primitive", primitiveType: "null", nullable: true }`
- [ ] `typeDistribution: { "null": 3 }`

**Acceptance Criteria (Rule 2 — Single composite kind + nulls):**
- [ ] Homogeneous primitives: `[1, 2, 3, 4]` → `integer`, distribution `{ "integer": 4 }`
- [ ] Mixed primitives: `[true, 1, 2]` → `integer` (NOT union), distribution `{ "boolean": 1, "integer": 2 }`
- [ ] Mixed primitives + null: `[true, 1, null, "hello"]` → `string`, `nullable: true`, distribution `{ "null": 1, "boolean": 1, "integer": 1, "string": 1 }`
- [ ] `[1, 3.14, "hello"]` → `string`, distribution `{ "integer": 1, "number": 1, "string": 1 }`
- [ ] `[true, 1, 3.14, "x"]` → `string`, distribution `{ "boolean": 1, "integer": 1, "number": 1, "string": 1 }`
- [ ] All objects: invokes property-merge (§8.5.3)
- [ ] All arrays: recurse (array of arrays)

**Acceptance Criteria (Rule 3 — Multiple composite kinds → Union):**
- [ ] `[1, {"a": 2}]` → union of primitive (integer) + object
- [ ] `["x", [1,2]]` → union of primitive (string) + array
- [ ] `[42, {"x": 1}, [1, 2]]` → union with 3 members (maximum)
- [ ] `[1, {"a": 2}, null]` → union of primitive + object, `nullable: true`
- [ ] Union members bounded at 3 (invariant §17.3 item 6)
- [ ] No union where all members are primitive (invariant §17.3 item 5)
- [ ] No union where all members are object (invariant §17.3 item 4)

**Acceptance Criteria (Rule 4 — Empty array):**
- [ ] `[]` → `itemType: null`, diagnostic `BIBSS-007`

### 4.4 Property-Merge Algorithm

**Status:** Complete | **Priority:** High

Implement Spec §8.5.3 for merging object arrays into a single schema.

**Acceptance Criteria:**
- [ ] Union of all property keys across N elements
- [ ] Per-key: type resolved via lattice across all observed values
- [ ] Per-key: `typeDistribution` accumulated across all values
- [ ] Absent key (key missing from element) → `required: false` (absence ≠ null)
- [ ] Present key with `null` value → `nullable: true`
- [ ] Required = `occurrences(k) / N >= requiredThreshold`
- [ ] Unit test: the 3-element example from Spec §8.5.3 (id/name/role/dept) produces expected merged schema
- [ ] Unit test: 100 objects with 5 optional properties → 1 merged object, NOT 2^5 unions
- [ ] `BIBSS-008` emitted if >100 distinct property keys across elements

### 4.5 Empty and Degenerate Inputs

**Status:** Complete | **Priority:** Medium

Implement all behaviors from Spec §8.6.

**Acceptance Criteria:**
- [ ] Empty CSV (header only) → object node, all properties typed `string`, all optional, `typeDistribution: {}` for each
- [ ] Empty JSON array `[]` → array node, `itemType: null`
- [ ] Empty JSON object `{}` → object node, no properties
- [ ] All null for a property → `primitiveType: "null"`, `nullable: true`, `typeDistribution: { "null": N }`
- [ ] Single record → all present properties `required: true` at threshold 1.0
- [ ] Empty string input → `cism: null`, `BIBSS-007`

---

## Phase 5: Output Adapters & Public API

**Goal:** Implement the JSON Schema adapter, raw CISM serializer, adapter registry, and the `infer()`/`project()` public API surface.

**Status:** Complete

### 5.1 Adapter Registry

**Status:** Complete | **Priority:** High

Implement `src/kernel/adapter-registry.ts` per Spec §11.3.

**Acceptance Criteria:**
- [ ] `register(name, adapter)`, `get(name)`, `list()` methods
- [ ] Adapters are pure functions: `(cism: CISMRoot) => T`
- [ ] Unit test: register, retrieve, list
- [ ] Unit test: `get()` returns `undefined` for unregistered name

### 5.2 Raw CISM Adapter

**Status:** Complete | **Priority:** High

Implement the identity adapter per Spec §11.2.

**Acceptance Criteria:**
- [ ] Returns the CISM serialized per §9.3: `version`, `generatedAt` (if present), `config`, `root`
- [ ] `nodeIndex` omitted from serialization
- [ ] `typeDistribution` keys serialized in lattice order: `null, boolean, integer, number, string`
- [ ] Zero-count keys omitted from `typeDistribution`
- [ ] Property keys emitted in declaration order per §9.1
- [ ] **Deterministic:** two serializations of the same CISM produce identical JSON strings
- [ ] **Lattice-order serialization test:** construct a `typeDistribution` with all five primitive types (e.g., `{ "null": 1, "boolean": 2, "integer": 3, "number": 4, "string": 5 }`) and verify the serialized JSON string has keys in exactly that order. This catches insertion-order bugs early — do not defer to Phase 6.3.

### 5.3 JSON Schema Adapter (Draft 2020-12)

**Status:** Complete | **Priority:** High

Implement `src/kernel/json-schema-adapter.ts` per Spec §11.1.

**Acceptance Criteria:**
- [ ] Object → `{ "type": "object", "properties": {...}, "required": [...] }`
- [ ] Array → `{ "type": "array", "items": {...} }`
- [ ] Primitive → `{ "type": "<primitiveType>" }`
- [ ] Nullable primitive → `{ "type": ["<primitiveType>", "null"] }`
- [ ] Union → `{ "oneOf": [...members] }`
- [ ] Nullable union → `{ "oneOf": [...members, { "type": "null" }] }`
- [ ] `typeDistribution` NOT included in JSON Schema output
- [ ] Root type selection: CSV → array root, JSON array → array root, single JSON object → object root
- [ ] Schema metadata: `$schema`, `$id` (SHA-256 of first 1024 input bytes), `title`, `$comment`
- [ ] No `$ref` or `$defs` (v1.3 inlines everything)
- [ ] Unit test: full round-trip — infer from sample JSON, project to JSON Schema, verify structure
- [ ] Unit test: validate emitted schema against JSON Schema Draft 2020-12 meta-schema (if feasible without added dependency; otherwise manual spot-check)

### 5.4 Public API (infer / project)

**Status:** Complete | **Priority:** High

Wire everything together in `src/kernel/index.ts` per Spec §12.

**Acceptance Criteria:**
- [ ] `infer(input: string | ArrayBuffer, config?: Partial<InferConfig>): InferResult`
- [ ] `project<T>(cism: CISMRoot, adapterName: string): T`
- [ ] `adapters: AdapterRegistry` — pre-registered with `"jsonschema"` and `"cism"` adapters
- [ ] Config defaults applied via `createDefaultConfig()` merged with caller's partial config
- [ ] Format detection → normalize → sample → infer → attach `generatedAt` → return CISM + diagnostics
- [ ] `generatedAt` populated with ISO 8601 timestamp **outside the deterministic pipeline** (see ADR-004)
- [ ] Empty input handling: returns `cism: null` with appropriate diagnostic
- [ ] `npm run build` succeeds
- [ ] `npm test` passes

---

## Phase 6: Integration Tests & Hardening

**Goal:** Full test coverage per Spec §17.2, property-based invariants per §17.3, determinism verification, and performance benchmarking.

**Status:** Complete

### 6.1 Required Test Cases (Spec §17.2)

**Status:** Complete | **Priority:** High

Implement all test categories from the spec's testing contract.

**Acceptance Criteria:**
- [ ] Empty inputs: empty CSV, empty JSON array, empty JSON object, zero-byte input
- [ ] Type widening: all pairs in the lattice + three-way combinations
- [ ] Nullable: string in some records, null in others
- [ ] Required fields: 100%, 99% (threshold 1.0), configurable threshold, N=0
- [ ] Nested objects: depth 1–5
- [ ] Arrays (homogeneous primitives): all-string, all-integer, all-boolean
- [ ] Arrays (mixed primitives): `[true, 1, 2]` → integer NOT union; `[1, "hello"]` → string NOT union; `[true, 3.14]` → number NOT union; `[true, 1, 3.14, "x"]` → string NOT union
- [ ] Arrays (objects, optional props): 100 elements, 5 optional properties → 1 merged object
- [ ] Arrays (cross-kind union): primitive+object, primitive+array
- [ ] Arrays (mixed kinds + null): union + nullable
- [ ] CSV boolean narrowing: case-insensitive booleans, "yes"/"no" remain string
- [ ] CSV no scientific notation: `"1e5"`, `"1E5"`, `"2.5E+3"`, `"-1e-2"` all → string
- [ ] CSV other narrowing: `"00123"` → string, `"123"` → integer, `"NaN"` → string, `""` → null
- [ ] CSV edge cases: quoted fields, embedded commas, newlines, BOM, mixed line endings
- [ ] typeDistribution: CSV (95/3/2 case), JSON (50 int / 50 number), arrays
- [ ] Node identity (RFC 6901): `"user.name"` vs nested, `"a/b"` → `a~1b`, `"a~b"` → `a~0b`
- [ ] Sampling: at sampleSize, sampleSize+1, 10× sampleSize
- [ ] JSON Schema output: structural validation
- [ ] Large integers: `9007199254740993` triggers BIBSS-009

### 6.2 Property-Based Invariants (Spec §17.3)

**Status:** Complete | **Priority:** High

**Acceptance Criteria:**
- [ ] Invariant 1: `infer(I, C)` terminates for all test inputs
- [ ] Invariant 2: Non-null CISM → valid JSON Schema projection
- [ ] Invariant 3: Original input validates against emitted JSON Schema (sound overapproximation)
- [ ] Invariant 4: No union where all members are `kind: "object"`
- [ ] Invariant 5: No union where all members are `kind: "primitive"`
- [ ] Invariant 6: Every union has ≤ 3 members
- [ ] Invariant 7: Every primitive `typeDistribution` sums to `occurrences`

### 6.3 Determinism Verification

**Status:** Complete | **Priority:** High

**Acceptance Criteria:**
- [ ] For every test case: `JSON.stringify(cism1)` === `JSON.stringify(cism2)` (excluding `generatedAt`)
- [ ] `typeDistribution` maps serialize in lattice key order
- [ ] CISM property keys serialize in declaration order (Spec §9.3)
- [ ] 100 repeated invocations of `infer()` on the same input produce byte-identical CISM (minus `generatedAt`)

### 6.4 Performance Benchmarks

**Status:** Complete | **Priority:** Medium

Targets from Spec §15.3.

**Acceptance Criteria:**
- [ ] Flat CSV 2000×20: < 50ms
- [ ] Nested JSON 2000×50 (depth 4): < 200ms
- [ ] Wide CSV 2000×500: < 500ms
- [ ] JSON with 20 optional properties, 2000 records: < 100ms
- [ ] JSON with mixed primitives, 2000 records, 10 properties: < 50ms
- [ ] Benchmarks run in Node.js (browser benchmarks deferred)

### 6.5 Update Spec Tests for BIBSS

**Status:** Complete | **Priority:** Medium

Ensure the template's immutable spec tests (`determinism.test.ts`, `no-network.test.ts`, `snapshot.test.ts`) work with the BIBSS API shape.

**Acceptance Criteria:**
- [ ] Determinism test calls `infer()` and verifies CISM determinism (excluding `generatedAt`)
- [ ] No-network test confirms `infer()` makes zero fetch/XHR calls
- [ ] Snapshot test verifies example input produces expected CISM output
- [ ] `npm test` passes all spec tests + domain tests
- [ ] `npm run test:purity` passes

**NOT in scope for ANY phase:**
- Bundle tooling (esbuild/Rollup) — deferred to a build/deploy phase beyond this roadmap
- Composition layer (Concepts/Synchronizations)
- Adapters for external systems (HTTP, persistence)
- Deployment
- Semantic inference, date detection, ontology alignment, or any non-goal from Spec §3

---

## Developer Implementation Notes

These notes are from the Orchestrator and carry binding authority for implementation decisions.

### Note 1: Papa Parse is the One Runtime Dependency

Spec §5 mandates Papa Parse for CSV parsing. It is bundled at build time. `dynamicTyping: false` is non-negotiable — BIBSS controls type narrowing via §7.1.3. The purity checker must be updated to whitelist `papaparse`. See ADR-002.

### Note 2: typeDistribution Accumulation Ordering

**This is the single most implementation-critical detail in the spec.**

`typeDistribution` records pre-widening observation counts. The accumulation MUST happen at the point each value is observed, BEFORE the lattice resolves the final type. If accumulation happens post-widening (retroactively recording the resolved type), the distribution will be wrong (e.g., `{ "string": 100 }` instead of `{ "integer": 95, "string": 3, "null": 2 }`).

The Phase 0.5 test exists specifically to catch this error. Write it first, run it often. See ADR-003.

### Note 3: generatedAt and Determinism

`CISMRoot.generatedAt` is a timestamp that changes per invocation, which conflicts with the byte-identical determinism contract (§2.1). Resolution: `generatedAt` is populated outside the deterministic pipeline and excluded from determinism comparisons. See ADR-004.

**Implementation boundary:** The inference engine (Phase 4) produces a CISM **without** `generatedAt`. The `infer()` public API wrapper (Phase 5.4) attaches `generatedAt` before returning to the caller. This keeps the engine function signature pure — same inputs, same outputs, testable without timestamp mocking. `Date.now()` or equivalent appears ONLY in the API wrapper, never in the engine or any function the engine calls.
