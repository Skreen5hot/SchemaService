# Architecture Decision Records

<!--
  Log decisions here so they survive between AI sessions.
  An AI agent has no memory of yesterday. This file IS its memory.

  Format: Date | Decision | Context | Consequences
-->

## ADR-001: Use JSON-LD Deterministic Service Template

**Date:** 2026-02-28

**Decision:** Adopt the JSON-LD Deterministic Service Template as the base architecture.

**Context:** We need a service that produces deterministic, reproducible transformations on structured data. The template provides a pure kernel with spec tests, layered boundaries (kernel/composition/adapters), and zero runtime dependencies.

**Consequences:**
- All transformation logic lives in `src/kernel/` as pure functions
- Kernel MUST NOT perform I/O, reference time, randomness, or environment state
- Infrastructure (HTTP, persistence, scheduling) lives in `src/adapters/`
- Spec tests (determinism, no-network, snapshot, purity) MUST pass before any merge

---

## ADR-002: Papa Parse as Sole Runtime Dependency

**Date:** 2026-03-01

**Decision:** Add Papa Parse (`papaparse`) as the sole runtime dependency for CSV parsing. Update the purity checker to whitelist it.

**Context:** BIBSS Spec §5 mandates Papa Parse for CSV parsing. The alternatives considered:

1. **Hand-written CSV parser** — rejected. BIBSS requires RFC 4180 compliance (quoted fields with embedded commas, newlines, escaped double-quotes), delimiter auto-detection (comma, tab, pipe, semicolon), and robust error recovery for malformed rows. A hand-written parser would be a significant implementation effort with high defect risk. Papa Parse is the industry standard and handles all these cases. This is not the same situation as SNP, where the CSV operations were simple enough to avoid a dependency.

2. **csv-parse or other alternatives** — rejected. Papa Parse is browser-compatible (BIBSS must run client-side per §2.2), has zero dependencies of its own, and is the most battle-tested option.

The critical constraint is `dynamicTyping: false` (§7.1.1). Papa Parse's internal type coercion is disabled entirely. BIBSS controls all type narrowing through the explicit rules in §7.1.3. This is the correct architecture: use the library for format parsing, reject its type guessing.

**Purity Checker Impact:** The existing `scripts/ensure-kernel-purity.ts` blocks all non-relative, non-`node:` imports from the kernel. It must be updated with a whitelist for `papaparse`. This is the ONLY exception to the kernel purity rule. The whitelist must be documented in code comments and must not be extended without Orchestrator approval.

**Bundling Constraint:** Papa Parse must be bundled at build time. The compiled artifact must make zero network requests. This is verified by the existing no-network spec test. When bundle tooling (esbuild/Rollup) is added in a later phase, the bundle must include Papa Parse inline.

**Consequences:**
- `papaparse` added to `dependencies` in `package.json`
- `@types/papaparse` added to `devDependencies`
- Purity checker whitelist updated
- No other runtime dependencies permitted without Orchestrator approval
- `dynamicTyping: false` is non-negotiable and must be enforced in code review

---

## ADR-003: typeDistribution Accumulation — Observe First, Widen Second

**Date:** 2026-03-01

**Decision:** The `typeDistribution` field on primitive `SchemaNode` instances must be accumulated at value-observation time, before the type widening lattice resolves the final `primitiveType`. This ordering is enforced by a test written before implementation (Phase 0.5).

**Context:** Spec §9.4 defines `typeDistribution` as a record of per-type observation counts "before the widening lattice resolves to a single type." The accumulation rules (§9.4 items 1–4) state:

> 1. For each value observed during inference, classify it by primitive kind.
> 2. Increment the count for that primitive kind in the typeDistribution map.

This means the engine must classify and count each value as it is encountered, not after the lattice has resolved. If a developer implements accumulation as a post-processing step (re-examining values through the lens of the resolved type), all values would be counted under the widened type, destroying the pre-widening distribution.

**Example of the failure mode:**

Given a column with 95 integers, 3 strings, and 2 nulls:
- **Correct** (observe-first): `typeDistribution: { "null": 2, "integer": 95, "string": 3 }`, `primitiveType: "string"`
- **Wrong** (widen-first): `typeDistribution: { "string": 100 }`, `primitiveType: "string"`

The wrong version records the widened type for all values retroactively. The downstream SAS consensus mechanism relies on the pre-widening distribution to make type promotion decisions. If the distribution is `{ "string": 100 }`, SAS cannot know that 95% of values were actually integers.

**Enforcement:** The test in Phase 0.5 (`tests/type-distribution.test.ts`) exercises this exact case. It is written before any implementation code exists. If the engine accumulates distributions incorrectly, this test fails immediately.

**Implementation Guidance:**

The inference loop for a property should follow this structure:
```
for each value in observations:
    kind = classifyPrimitive(value)    // Tier 2 classification
    distribution[kind]++               // Accumulate BEFORE widening
    resolvedType = widenType(resolvedType, kind)  // Lattice resolution
```

NOT this structure:
```
for each value in observations:
    resolvedType = widenType(resolvedType, classifyPrimitive(value))
// Then: distribution[resolvedType] = observations.length  // WRONG
```

**Consequences:**
- Every value observation must classify and count before widening
- The distribution map and the lattice accumulator are separate state
- This applies everywhere: property-level inference, array element inference, property-merge
- The invariant `sum(typeDistribution) === occurrences` (§17.3 item 7) is tested for every primitive node

---

## ADR-004: generatedAt Excluded from Determinism Contract

**Date:** 2026-03-01

**Decision:** `CISMRoot.generatedAt` is populated outside the deterministic inference pipeline and excluded from byte-identical determinism comparisons. It is metadata for human inspection, not a structural component of the CISM.

**Context:** The BIBSS spec contains a tension:

- §2.1 (Determinism Contract): "Given identical input bytes and an identical `InferConfig` object, BIBSS must produce byte-identical CISM output across all invocations."
- §9.1 (CISMRoot): `generatedAt: string // ISO 8601 timestamp of generation`

These conflict because `generatedAt` changes with each invocation. Two calls to `infer()` with identical input will produce different timestamps, making `JSON.stringify(cism1) !== JSON.stringify(cism2)`.

The spec's own determinism test (§17.1) uses `JSON.stringify(infer(input, config).cism)` compared against itself — but if the two calls happen at different milliseconds, the timestamps differ and the test fails. In practice this only works if both calls execute within the same millisecond, which is fragile.

**Options Considered:**

1. **Exclude `generatedAt` from determinism comparison** — pragmatic. Tests serialize the CISM minus `generatedAt`. The timestamp is still present in the output for human inspection.

2. **Make `generatedAt` caller-supplied or omit it entirely** — architecturally cleaner. No downstream service (SAS, ECVE) depends on `generatedAt`. It's purely informational.

3. **Derive `generatedAt` deterministically from input** — not meaningful. A timestamp derived from input content is not a timestamp.

**Decision:** Option 1. `generatedAt` remains in `CISMRoot` as an ISO 8601 string. The `infer()` function sets it after the deterministic pipeline completes. Determinism tests compare CISM output with `generatedAt` stripped or ignored.

**Consequences:**
- The deterministic pipeline (normalize → sample → infer → resolve) does not reference `Date.now()` or any clock
- `generatedAt` is set in the public API wrapper (`infer()`) after the pipeline returns
- Determinism tests use a comparison that excludes `generatedAt`
- The snapshot test either excludes `generatedAt` or uses a fixed test value
- The kernel purity checker does not flag `Date.now()` in `infer()` because `infer()` is the API boundary, not a kernel-internal function — but this must be carefully scoped to avoid leaking time references into the inference engine itself

---

<!--
  Add new decisions below. Use the format:

  ## ADR-NNN: [Decision Title]

  **Date:** YYYY-MM-DD

  **Decision:** One sentence stating the choice.

  **Context:** Why this decision was needed. What alternatives were considered.

  **Consequences:** What follows from this decision. What is now easier or harder.
-->
